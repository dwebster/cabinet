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
import { useDroppable } from "@dnd-kit/core";
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
import { CARD_DROP_PREFIX, laneDropId } from "./dnd-keys";

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
  isSelected,
  now,
  onClick,
  density,
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  isActive: boolean;
  isSelected: boolean;
  now: number;
  onClick: (modifiers: { shift: boolean; meta: boolean }) => void;
  density: "compact" | "comfortable";
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isSelected && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background"
      )}
    >
      <TaskCard
        task={task}
        lane={lane}
        agent={agent}
        isActive={isActive}
        now={now}
        onClick={(e) =>
          onClick({
            shift: !!e?.shiftKey,
            meta: !!(e?.metaKey || e?.ctrlKey),
          })
        }
        density={density}
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
  selection,
  now,
  onSelect,
  onToggleSelection,
  onClearSelection,
  density = "comfortable",
}: {
  byLane: Record<LaneKey, TaskMeta[]>;
  agentsBySlug: Map<string, CabinetAgentSummary>;
  selectedId: string | null;
  selection: Set<string>;
  now: number;
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onClearSelection: () => void;
  density?: "compact" | "comfortable";
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  return (
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
                          isSelected={selection.has(task.id)}
                          now={now}
                          onClick={({ shift, meta }) => {
                            if (shift || meta) {
                              onToggleSelection(task.id);
                            } else {
                              onClearSelection();
                              onSelect(task.id);
                            }
                          }}
                          density={density}
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
  );
}

export function shorten(s: string, max = 40): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
