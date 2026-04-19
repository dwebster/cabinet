"use client";

import { useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { LaneKey } from "./lane-rules";
import { TaskCard } from "./task-card";
import {
  archiveConversation,
  restartConversation,
  restoreConversation,
  stopConversation,
} from "./board-actions";
import type { PendingUndo } from "./undo-toast";
import type { PendingConfirm } from "./confirm-popover";

interface LaneDef {
  key: LaneKey;
  label: string;
  hint: string;
  icon: LucideIcon;
  spin?: boolean;
}

const LANES: LaneDef[] = [
  { key: "inbox", label: "Inbox", hint: "Waiting for you to start", icon: Inbox },
  { key: "needs", label: "Needs Reply", hint: "Asked a question or failed", icon: MessageCircleQuestion },
  { key: "running", label: "Running", hint: "Live right now", icon: Loader2, spin: true },
  { key: "done", label: "Just Finished", hint: "Completed in the last hour", icon: CheckCircle2 },
  { key: "archive", label: "Archive", hint: "Older and acknowledged", icon: Archive },
];

const LANE_DROP_PREFIX = "lane:";
const CARD_DROP_PREFIX = "card:";

function laneDropId(lane: LaneKey) {
  return `${LANE_DROP_PREFIX}${lane}`;
}

function LaneHeader({
  lane,
  count,
  collapsed,
  onToggle,
}: {
  lane: LaneDef;
  count: number;
  collapsed: boolean;
  onToggle?: () => void;
}) {
  const LaneIcon = lane.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left",
        onToggle ? "cursor-pointer hover:bg-muted/40" : "cursor-default"
      )}
    >
      <LaneIcon
        className={cn("size-3.5 text-muted-foreground", lane.spin && "animate-spin [animation-duration:3s]")}
      />
      <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {lane.label}
      </span>
      <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
      {onToggle &&
        (collapsed ? (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ))}
    </button>
  );
}

function SortableTaskCard({
  task,
  lane,
  agent,
  isActive,
  now,
  onClick,
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  isActive: boolean;
  now: number;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${CARD_DROP_PREFIX}${task.id}`,
    data: { taskId: task.id, lane },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        task={task}
        lane={lane}
        agent={agent}
        isActive={isActive}
        now={now}
        onClick={onClick}
      />
    </div>
  );
}

function DroppableLane({
  lane,
  children,
  className,
}: {
  lane: LaneKey;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: laneDropId(lane),
    data: { lane },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background"
      )}
    >
      {children}
    </div>
  );
}

export function KanbanView({
  byLane,
  agentsBySlug,
  selectedId,
  now,
  onSelect,
  onUndoQueued,
  onConfirmRequested,
  onRefresh,
}: {
  byLane: Record<LaneKey, TaskMeta[]>;
  agentsBySlug: Map<string, CabinetAgentSummary>;
  selectedId: string | null;
  now: number;
  onSelect: (id: string) => void;
  onUndoQueued: (undo: PendingUndo) => void;
  onConfirmRequested: (confirm: PendingConfirm) => void;
  onRefresh: () => Promise<void>;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const findTaskLane = (taskId: string): LaneKey | null => {
    for (const lane of Object.keys(byLane) as LaneKey[]) {
      if (byLane[lane].some((t) => t.id === taskId)) return lane;
    }
    return null;
  };

  async function handleDragEnd(event: DragEndEvent) {
    setDragId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id).replace(CARD_DROP_PREFIX, "");
    const overId = String(over.id);

    const sourceLane = findTaskLane(activeId);
    if (!sourceLane) return;

    let targetLane: LaneKey | null = null;
    if (overId.startsWith(LANE_DROP_PREFIX)) {
      targetLane = overId.replace(LANE_DROP_PREFIX, "") as LaneKey;
    } else if (overId.startsWith(CARD_DROP_PREFIX)) {
      const overTaskId = overId.replace(CARD_DROP_PREFIX, "");
      targetLane = findTaskLane(overTaskId);
    }
    if (!targetLane) return;

    const task = byLane[sourceLane].find((t) => t.id === activeId);
    if (!task) return;
    const cabinetPath = task.cabinetPath;

    // ── Destructive: Running → anywhere else (Phase 3) ─────────────────
    // Stopping a live run cancels the active turn. Confirm inline.
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
                // Restart the conversation to recover. Archive was added on
                // top of stop so we also unarchive.
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

    // ── Destructive: Archive → Running (Phase 3) ───────────────────────
    // Restart spawns a new run from the original prompt. Confirm inline.
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

    // ── Non-destructive: Archive (any non-archive → archive) ──────────
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

    // ── Non-destructive: Restore (archive → non-running) ─────────────
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

    // Reorder / other cross-lane drops: no-op. @dnd-kit's SortableContext
    // handles the visual rearrange; persistence via boardOrder is Phase 2b.
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragId(String(e.active.id).replace(CARD_DROP_PREFIX, ""))
      }
      onDragCancel={() => setDragId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {LANES.map((lane) => {
          const items = byLane[lane.key];
          const isArchive = lane.key === "archive";
          const collapsed = isArchive && !archiveOpen;
          return (
            <DroppableLane
              key={lane.key}
              lane={lane.key}
              className={cn(
                "flex min-h-0 shrink-0 flex-col rounded-lg border border-border/60 bg-muted/20",
                collapsed ? "w-12" : "w-[280px]"
              )}
            >
              {collapsed ? (
                <button
                  type="button"
                  onClick={() => setArchiveOpen(true)}
                  className="flex h-full w-full flex-col items-center gap-2 py-3 text-muted-foreground hover:bg-muted/40"
                  title="Expand archive"
                >
                  <Archive className="size-4" />
                  <span className="rotate-180 text-[10.5px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">
                    Archive · {items.length}
                  </span>
                </button>
              ) : (
                <>
                  <LaneHeader
                    lane={lane}
                    count={items.length}
                    collapsed={false}
                    onToggle={isArchive ? () => setArchiveOpen(false) : undefined}
                  />
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-1">
                    <SortableContext
                      items={items.map((t) => `${CARD_DROP_PREFIX}${t.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      {items.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-[11px] text-muted-foreground">
                          {lane.hint}
                        </div>
                      ) : (
                        items.map((task) => (
                          <SortableTaskCard
                            key={task.id}
                            task={task}
                            lane={lane.key}
                            agent={agentsBySlug.get(task.agentSlug ?? "")}
                            isActive={selectedId === task.id}
                            now={now}
                            onClick={() => onSelect(task.id)}
                          />
                        ))
                      )}
                    </SortableContext>
                  </div>
                </>
              )}
            </DroppableLane>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragId ? <DragPreview taskId={dragId} byLane={byLane} now={now} agentsBySlug={agentsBySlug} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function DragPreview({
  taskId,
  byLane,
  now,
  agentsBySlug,
}: {
  taskId: string;
  byLane: Record<LaneKey, TaskMeta[]>;
  now: number;
  agentsBySlug: Map<string, CabinetAgentSummary>;
}) {
  for (const lane of Object.keys(byLane) as LaneKey[]) {
    const task = byLane[lane].find((t) => t.id === taskId);
    if (task) {
      return (
        <div className="rotate-[-2deg] shadow-2xl">
          <TaskCard
            task={task}
            lane={lane}
            agent={agentsBySlug.get(task.agentSlug ?? "")}
            isActive={false}
            now={now}
            onClick={() => undefined}
          />
        </div>
      );
    }
  }
  return null;
}

function shorten(s: string, max = 40): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
