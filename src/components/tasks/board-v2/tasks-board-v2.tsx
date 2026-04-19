"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useBoardData } from "./use-board-data";
import { KanbanView } from "./kanban-view";
import { ListView } from "./list-view";
import { ScheduleView } from "./schedule-view";
import { PeopleRail } from "./people-rail";
import { DetailPanel } from "./detail-panel";
import { ViewToggle, type BoardViewMode } from "./view-toggle";
import { FilterBar } from "./filter-bar";
import { UndoToast, type PendingUndo } from "./undo-toast";
import { ConfirmPopover, type PendingConfirm } from "./confirm-popover";
import { useDragHandler } from "./use-drag-handler";
import { usePersistentState } from "./use-persistent-state";
import { TaskCard } from "./task-card";
import { CARD_DROP_PREFIX } from "./dnd-keys";
import { deriveLane, laneSort, type LaneKey } from "./lane-rules";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import type { CabinetVisibilityMode } from "@/types/cabinets";
import type { TaskMeta } from "@/types/tasks";

/**
 * Entry point for the v2 Task Board. Phase 1 ships read-only:
 *  - Kanban / List / Schedule views toggleable from the header
 *  - Right-side display-only People rail
 *  - Click-to-open DetailPanel that embeds the existing TaskConversationPage
 *  - Live updates via /api/agents/conversations/events SSE
 *
 * No DnD, no write actions — those land in later phases.
 */
export function TasksBoardV2({
  cabinetPath = ROOT_CABINET_PATH,
  visibilityMode = "own",
  standalone = false,
}: {
  cabinetPath?: string;
  visibilityMode?: CabinetVisibilityMode;
  standalone?: boolean;
}) {
  const {
    byLane,
    agentsBySlug,
    overview,
    tasks,
    conversations,
    jobs,
    loading,
    refreshing,
    now,
    refresh,
  } = useBoardData({ cabinetPath, visibilityMode });

  const [view, setView] = usePersistentState<BoardViewMode>(
    "cabinet.tasks.v2.view",
    "kanban",
    (raw) => (raw === "kanban" || raw === "list" || raw === "schedule" ? raw : null)
  );
  const [agentFilter, setAgentFilter] = usePersistentState<string | null>(
    "cabinet.tasks.v2.agent",
    null,
    (raw) => (raw === "" || raw === "null" ? null : raw)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  // Client-side agent filter. Null = all. Non-null narrows tasks +
  // conversations to that agent; byLane is rebuilt from the filtered set so
  // lane counts reflect what the user actually sees.
  const filteredTasks = useMemo<TaskMeta[]>(
    () => (agentFilter ? tasks.filter((t) => t.agentSlug === agentFilter) : tasks),
    [tasks, agentFilter]
  );
  const filteredConversations = useMemo(
    () =>
      agentFilter
        ? conversations.filter((c) => c.agentSlug === agentFilter)
        : conversations,
    [conversations, agentFilter]
  );
  const filteredByLane = useMemo<Record<LaneKey, TaskMeta[]>>(() => {
    if (!agentFilter) return byLane;
    const map: Record<LaneKey, TaskMeta[]> = {
      inbox: [], needs: [], running: [], done: [], archive: [],
    };
    for (const t of filteredTasks) map[deriveLane(t, now)].push(t);
    for (const lane of Object.keys(map) as LaneKey[]) map[lane].sort(laneSort(lane));
    return map;
  }, [agentFilter, byLane, filteredTasks, now]);

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;
  const selectedLane = selected ? deriveLane(selected, now) : null;
  const selectedAgent = selected ? agentsBySlug.get(selected.agentSlug ?? "") : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useDragHandler({
    byLane: filteredByLane,
    agentsBySlug,
    onUndoQueued: setPendingUndo,
    onConfirmRequested: setPendingConfirm,
    onRefresh: refresh,
  });

  const draggedTask = dragTaskId ? tasks.find((t) => t.id === dragTaskId) ?? null : null;
  const draggedLane = draggedTask ? deriveLane(draggedTask, now) : null;
  const draggedAgent = draggedTask ? agentsBySlug.get(draggedTask.agentSlug ?? "") : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border/70 px-6 py-3">
        {standalone && (
          <Link
            href="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <h1 className="text-[14px] font-semibold tracking-tight">Tasks</h1>
        {refreshing && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        <div className="ml-4">
          <ViewToggle value={view} onChange={setView} />
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {agentFilter ? `${filteredTasks.length} of ${tasks.length}` : `${tasks.length}`}
          {" "}task{tasks.length === 1 ? "" : "s"}
        </span>
      </header>

      <FilterBar
        agents={overview?.agents ?? []}
        value={agentFilter}
        onChange={setAgentFilter}
      />

    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragTaskId(String(e.active.id).replace(CARD_DROP_PREFIX, ""))
      }
      onDragCancel={() => setDragTaskId(null)}
      onDragEnd={(e) => {
        setDragTaskId(null);
        void handleDragEnd(e);
      }}
    >
      <div className="relative flex min-h-0 flex-1">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col">
            {view === "kanban" && (
              <KanbanView
                byLane={filteredByLane}
                agentsBySlug={agentsBySlug}
                selectedId={selectedId}
                now={now}
                onSelect={setSelectedId}
              />
            )}
            {view === "list" && (
              <ListView
                byLane={filteredByLane}
                agentsBySlug={agentsBySlug}
                selectedId={selectedId}
                now={now}
                onSelect={setSelectedId}
              />
            )}
            {view === "schedule" && (
              <ScheduleView
                agents={
                  agentFilter
                    ? (overview?.agents ?? []).filter((a) => a.slug === agentFilter)
                    : overview?.agents ?? []
                }
                jobs={
                  agentFilter ? jobs.filter((j) => j.ownerAgent === agentFilter) : jobs
                }
                conversations={filteredConversations}
                onConversationClick={setSelectedId}
              />
            )}
          </main>
        )}

        <PeopleRail agents={overview?.agents ?? []} />

        {selected && selectedLane && (
          <DetailPanel
            task={selected}
            lane={selectedLane}
            agent={selectedAgent}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {draggedTask && draggedLane ? (
          <div className="rotate-[-2deg] shadow-2xl">
            <TaskCard
              task={draggedTask}
              lane={draggedLane}
              agent={draggedAgent}
              isActive={false}
              now={now}
              onClick={() => undefined}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>

      <UndoToast pending={pendingUndo} onDismiss={() => setPendingUndo(null)} />
      <ConfirmPopover
        pending={pendingConfirm}
        onDismiss={() => setPendingConfirm(null)}
      />
    </div>
  );
}
