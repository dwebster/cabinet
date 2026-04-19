"use client";

import { useCallback } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { LaneKey } from "./lane-rules";
import {
  archiveConversation,
  reassignConversation,
  restartConversation,
  restoreConversation,
  setConversationBoardOrder,
  stopConversation,
} from "./board-actions";
import type { PendingUndo } from "./undo-toast";
import type { PendingConfirm } from "./confirm-popover";
import {
  AGENT_DROP_PREFIX,
  CARD_DROP_PREFIX,
  LANE_DROP_PREFIX,
} from "./dnd-keys";
import { shorten } from "./kanban-view";

interface Args {
  byLane: Record<LaneKey, TaskMeta[]>;
  agentsBySlug: Map<string, CabinetAgentSummary>;
  onUndoQueued: (undo: PendingUndo) => void;
  onConfirmRequested: (confirm: PendingConfirm) => void;
  onRefresh: () => Promise<void>;
}

/**
 * Fallback boardOrder derivation when a neighbor has no explicit order.
 * Uses its current position in the lane * 1000 so fresh tasks get
 * reasonable spacing without renumbering everyone.
 */
function indexFloor(lane: TaskMeta[], taskId: string): number | undefined {
  const i = lane.findIndex((t) => t.id === taskId);
  return i < 0 ? undefined : (i + 1) * 1000;
}

/**
 * Compute a boardOrder value for a card dropped between `prev` and `next`.
 * Fractional indexing: pick the midpoint. If both neighbors are missing,
 * fall back to the card's visual index * 1000 so stable ordering still works.
 */
function computeBoardOrder(
  prevOrder: number | undefined,
  nextOrder: number | undefined,
  fallbackIdx: number
): number {
  if (prevOrder != null && nextOrder != null) return (prevOrder + nextOrder) / 2;
  if (prevOrder != null) return prevOrder + 1000;
  if (nextOrder != null) return nextOrder / 2;
  return (fallbackIdx + 1) * 1000;
}

export function useDragHandler({
  byLane,
  agentsBySlug,
  onUndoQueued,
  onConfirmRequested,
  onRefresh,
}: Args) {
  return useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id).replace(CARD_DROP_PREFIX, "");
      const overId = String(over.id);

      // Find source lane by scanning byLane.
      let sourceLane: LaneKey | null = null;
      for (const lane of Object.keys(byLane) as LaneKey[]) {
        if (byLane[lane].some((t) => t.id === activeId)) {
          sourceLane = lane;
          break;
        }
      }
      if (!sourceLane) return;

      const task = byLane[sourceLane].find((t) => t.id === activeId);
      if (!task) return;
      const cabinetPath = task.cabinetPath;

      // ── Agent handoff drop (Phase 4) ────────────────────────────────
      if (overId.startsWith(AGENT_DROP_PREFIX)) {
        const toSlug = overId.slice(AGENT_DROP_PREFIX.length);
        if (toSlug === task.agentSlug) return; // no-op on self
        const fromSlug = task.agentSlug;
        const fromAgent = fromSlug ? agentsBySlug.get(fromSlug) : undefined;
        const toAgent = agentsBySlug.get(toSlug);
        if (!toAgent) return;
        try {
          await reassignConversation(activeId, toSlug, cabinetPath);
          await onRefresh();
          onUndoQueued({
            id: `reassign:${activeId}`,
            message: `Reassigned "${shorten(task.title)}" to ${toAgent.displayName ?? toAgent.name}`,
            undo: async () => {
              if (fromSlug) {
                await reassignConversation(activeId, fromSlug, cabinetPath);
                await onRefresh();
              }
            },
          });
        } catch (err) {
          console.error("[board-v2] reassign failed", err);
        }
        void fromAgent;
        return;
      }

      // ── Resolve target lane from lane or card drop id ───────────────
      let targetLane: LaneKey | null = null;
      if (overId.startsWith(LANE_DROP_PREFIX)) {
        targetLane = overId.slice(LANE_DROP_PREFIX.length) as LaneKey;
      } else if (overId.startsWith(CARD_DROP_PREFIX)) {
        const overTaskId = overId.slice(CARD_DROP_PREFIX.length);
        for (const lane of Object.keys(byLane) as LaneKey[]) {
          if (byLane[lane].some((t) => t.id === overTaskId)) {
            targetLane = lane;
            break;
          }
        }
      }
      if (!targetLane) return;

      // ── Destructive: Running → anywhere else (Phase 3) ──────────────
      if (sourceLane === "running" && targetLane !== "running") {
        const archiveAfter = targetLane === "archive";
        onConfirmRequested({
          id: `stop:${activeId}`,
          title: "Stop running conversation?",
          body: archiveAfter
            ? `Cancels the active turn and archives "${shorten(task.title)}".`
            : `Cancels the active turn for "${shorten(task.title)}".`,
          confirmLabel: archiveAfter ? "Stop & archive" : "Stop run",
          destructive: true,
          onConfirm: async () => {
            try {
              await stopConversation(activeId, cabinetPath);
              if (archiveAfter) await archiveConversation(activeId, cabinetPath);
              await onRefresh();
              onUndoQueued({
                id: `stop:${activeId}`,
                message: archiveAfter
                  ? `Stopped & archived "${shorten(task.title)}"`
                  : `Stopped "${shorten(task.title)}"`,
                undo: async () => {
                  if (archiveAfter) await restoreConversation(activeId, cabinetPath);
                  await restartConversation(activeId, cabinetPath);
                  await onRefresh();
                },
              });
            } catch (err) {
              console.error("[board-v2] stop failed", err);
            }
          },
        });
        return;
      }

      // ── Destructive: Archive → Running (Phase 3) ────────────────────
      if (sourceLane === "archive" && targetLane === "running") {
        onConfirmRequested({
          id: `restart:${activeId}`,
          title: "Restart conversation?",
          body: `Spawns a fresh run from the original prompt of "${shorten(task.title)}". The archived run stays in history.`,
          confirmLabel: "Restart",
          destructive: false,
          onConfirm: async () => {
            try {
              await restoreConversation(activeId, cabinetPath);
              await restartConversation(activeId, cabinetPath);
              await onRefresh();
            } catch (err) {
              console.error("[board-v2] restart failed", err);
            }
          },
        });
        return;
      }

      // ── Non-destructive: Archive (any non-archive → archive) ───────
      if (sourceLane !== "archive" && targetLane === "archive") {
        try {
          await archiveConversation(activeId, cabinetPath);
          await onRefresh();
          onUndoQueued({
            id: `archive:${activeId}`,
            message: `Archived "${shorten(task.title)}"`,
            undo: async () => {
              await restoreConversation(activeId, cabinetPath);
              await onRefresh();
            },
          });
        } catch (err) {
          console.error("[board-v2] archive failed", err);
        }
        return;
      }

      // ── Non-destructive: Restore (archive → non-running) ──────────
      if (sourceLane === "archive" && targetLane !== "archive") {
        try {
          await restoreConversation(activeId, cabinetPath);
          await onRefresh();
          onUndoQueued({
            id: `restore:${activeId}`,
            message: `Restored "${shorten(task.title)}"`,
            undo: async () => {
              await archiveConversation(activeId, cabinetPath);
              await onRefresh();
            },
          });
        } catch (err) {
          console.error("[board-v2] restore failed", err);
        }
        return;
      }

      // ── Same-lane reorder (persist boardOrder) ─────────────────────
      // @dnd-kit's SortableContext rearranges visually; we need to write
      // the new index to ConversationMeta.boardOrder so the server of
      // truth matches. Compute a fractional midpoint between neighbors
      // (or first/last + nudge) to avoid renumbering everyone.
      if (sourceLane === targetLane && overId.startsWith(CARD_DROP_PREFIX)) {
        const overTaskId = overId.slice(CARD_DROP_PREFIX.length);
        if (overTaskId === activeId) return;
        const lane = byLane[sourceLane];
        const overIdx = lane.findIndex((t) => t.id === overTaskId);
        const activeIdx = lane.findIndex((t) => t.id === activeId);
        if (overIdx < 0 || activeIdx < 0) return;

        // Build the post-move order as @dnd-kit would render it.
        const reordered = [...lane];
        const [moved] = reordered.splice(activeIdx, 1);
        reordered.splice(overIdx, 0, moved);
        const newIdx = reordered.findIndex((t) => t.id === activeId);
        const prev = newIdx > 0 ? reordered[newIdx - 1] : null;
        const next = newIdx < reordered.length - 1 ? reordered[newIdx + 1] : null;
        const prevOrder = prev?.boardOrder ?? (prev ? indexFloor(reordered, prev.id) : undefined);
        const nextOrder = next?.boardOrder ?? (next ? indexFloor(reordered, next.id) : undefined);
        const newOrder = computeBoardOrder(prevOrder, nextOrder, newIdx);

        try {
          await setConversationBoardOrder(activeId, newOrder, cabinetPath);
          await onRefresh();
        } catch (err) {
          console.error("[board-v2] reorder failed", err);
        }
        return;
      }

      // Other cross-lane drops with no defined action: ignore.
    },
    [byLane, agentsBySlug, onUndoQueued, onConfirmRequested, onRefresh]
  );
}
