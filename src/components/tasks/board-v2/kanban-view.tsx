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
import { cn } from "@/lib/utils";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { LaneKey } from "./lane-rules";
import { TaskCard } from "./task-card";

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

export function KanbanView({
  byLane,
  agentsBySlug,
  selectedId,
  now,
  onSelect,
}: {
  byLane: Record<LaneKey, TaskMeta[]>;
  agentsBySlug: Map<string, CabinetAgentSummary>;
  selectedId: string | null;
  now: number;
  onSelect: (id: string) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
      {LANES.map((lane) => {
        const items = byLane[lane.key];
        const isArchive = lane.key === "archive";
        const collapsed = isArchive && !archiveOpen;
        return (
          <section
            key={lane.key}
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
                  {items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-[11px] text-muted-foreground">
                      {lane.hint}
                    </div>
                  ) : (
                    items.map((task) => (
                      <TaskCard
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
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
