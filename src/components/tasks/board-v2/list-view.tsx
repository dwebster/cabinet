"use client";

import {
  Archive,
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
import { AgentPill } from "./agent-pill";
import { StatusIcon, deriveCardState } from "./status-icon";

const LANE_ICONS: Record<LaneKey, { label: string; icon: LucideIcon; spin?: boolean }> = {
  inbox: { label: "Inbox", icon: Inbox },
  needs: { label: "Needs Reply", icon: MessageCircleQuestion },
  running: { label: "Running", icon: Loader2, spin: true },
  done: { label: "Just Finished", icon: CheckCircle2 },
  archive: { label: "Archive", icon: Archive },
};

const LANE_ORDER: LaneKey[] = ["inbox", "needs", "running", "done", "archive"];

function relTime(fromIso: string | undefined, now: number): string {
  if (!fromIso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TaskRow({
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
  const state = deriveCardState(task, lane);
  const lastActivity = task.lastActivityAt ?? task.startedAt;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors",
        "hover:bg-muted/40",
        isActive && "border-border/60 bg-muted/40"
      )}
    >
      <StatusIcon state={state} />
      <AgentPill agent={agent} slug={task.agentSlug ?? "general"} />
      <span className="flex-1 truncate text-[13px] text-foreground">{task.title}</span>
      <span className="w-20 shrink-0 text-right text-[10.5px] text-muted-foreground">
        {relTime(lastActivity, now)}
      </span>
    </button>
  );
}

export function ListView({
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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {LANE_ORDER.map((key) => {
        const items = byLane[key];
        if (items.length === 0) return null;
        const meta = LANE_ICONS[key];
        const LaneIcon = meta.icon;
        return (
          <section key={key} className="rounded-lg border border-border/60 bg-muted/10">
            <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
              <LaneIcon
                className={cn(
                  "size-3.5 text-muted-foreground",
                  meta.spin && "animate-spin [animation-duration:3s]"
                )}
              />
              <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {meta.label}
              </span>
              <span className="text-[10.5px] tabular-nums text-muted-foreground">
                {items.length}
              </span>
            </header>
            <ul className="divide-y divide-border/40 px-2 py-1">
              {items.map((task) => (
                <li key={task.id}>
                  <TaskRow
                    task={task}
                    lane={key}
                    agent={agentsBySlug.get(task.agentSlug ?? "")}
                    isActive={selectedId === task.id}
                    now={now}
                    onClick={() => onSelect(task.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
