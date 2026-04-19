"use client";

import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Circle,
  Loader2,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskMeta } from "@/types/tasks";
import type { LaneKey } from "./lane-rules";

/**
 * One of six visual states a card can carry. Derived from `TaskMeta.status`
 * (and whether the task has started), NOT from the backend directly — the
 * UI owns the semantic grouping (e.g. "handoff" and "idle" share a lane).
 */
export type CardState =
  | "running"
  | "ask"
  | "failed"
  | "just-done"
  | "handoff"
  | "idle";

const STATUS_STYLE: Record<
  CardState,
  { icon: LucideIcon; color: string; label: string; animate?: string }
> = {
  running: {
    icon: Loader2,
    color: "text-sky-500",
    label: "Running",
    animate: "animate-spin [animation-duration:1.6s]",
  },
  ask: { icon: MessageCircleQuestion, color: "text-amber-500", label: "Needs reply" },
  failed: { icon: AlertCircle, color: "text-red-500", label: "Failed" },
  "just-done": { icon: CheckCircle2, color: "text-emerald-500", label: "Just finished" },
  handoff: { icon: ArrowDownToLine, color: "text-violet-500", label: "Waiting to start" },
  idle: { icon: Circle, color: "text-muted-foreground/50", label: "Idle" },
};

export function deriveCardState(task: TaskMeta, lane: LaneKey): CardState {
  if (lane === "running") return "running";
  if (task.status === "failed") return "failed";
  if (task.status === "awaiting-input") return "ask";
  if (lane === "done") return "just-done";
  if (lane === "inbox") {
    const hasActivity = !!task.lastActivityAt;
    return hasActivity ? "idle" : "handoff";
  }
  return "idle";
}

export function StatusIcon({ state, size = "sm" }: { state: CardState; size?: "sm" | "md" }) {
  const meta = STATUS_STYLE[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", meta.color)}
      title={meta.label}
    >
      <Icon
        className={cn(size === "md" ? "size-4" : "size-3.5", meta.animate)}
        strokeWidth={2.25}
      />
    </span>
  );
}
