import type { TaskMeta } from "@/types/tasks";

export type LaneKey = "inbox" | "needs" | "running" | "done" | "archive";

const DONE_FRESH_MS = 60 * 60 * 1000;

/**
 * Derive the v2 board lane for a task. Status-column rules per
 * TASK_BOARD_PRD.md §6:
 *  - archived (or archivedAt set)         → archive
 *  - running                              → running
 *  - awaiting-input OR failed             → needs (with red/amber dot)
 *  - done within the last hour            → done (Just Finished)
 *  - done older than an hour              → archive
 *  - idle with no activity (no turns yet) → inbox (handoff or fresh)
 *  - anything else                        → archive (defensive)
 */
export function deriveLane(task: TaskMeta, now: number): LaneKey {
  if (task.archivedAt || task.status === "archived") return "archive";
  if (task.status === "running") return "running";
  if (task.status === "awaiting-input" || task.status === "failed") return "needs";
  const last = task.lastActivityAt
    ? new Date(task.lastActivityAt).getTime()
    : task.completedAt
    ? new Date(task.completedAt).getTime()
    : 0;
  if (task.status === "done") {
    return last && now - last < DONE_FRESH_MS ? "done" : "archive";
  }
  if (task.status === "idle") {
    // No prior activity and idle → someone handed it off or it hasn't started.
    if (!last) return "inbox";
    // Idle but previously touched → fold into done if fresh, else archive.
    return now - last < DONE_FRESH_MS ? "done" : "archive";
  }
  return "archive";
}

/**
 * Sort comparator per lane (PRD §6 "Default sort"). Newer first except
 * Inbox which sorts handed-off / unstarted tasks by recency of creation.
 */
export function laneSort(lane: LaneKey): (a: TaskMeta, b: TaskMeta) => number {
  switch (lane) {
    case "inbox":
      return (a, b) => tsDesc(a.createdAt, b.createdAt);
    case "needs":
      return (a, b) => tsAsc(a.lastActivityAt ?? a.startedAt, b.lastActivityAt ?? b.startedAt);
    case "running":
      return (a, b) => tsDesc(a.lastActivityAt ?? a.startedAt, b.lastActivityAt ?? b.startedAt);
    case "done":
      return (a, b) => tsDesc(a.completedAt ?? a.lastActivityAt ?? "", b.completedAt ?? b.lastActivityAt ?? "");
    case "archive":
      return (a, b) => tsDesc(a.archivedAt ?? a.completedAt ?? a.lastActivityAt ?? "", b.archivedAt ?? b.completedAt ?? b.lastActivityAt ?? "");
  }
}

function tsDesc(a: string | undefined, b: string | undefined): number {
  return new Date(b ?? 0).getTime() - new Date(a ?? 0).getTime();
}
function tsAsc(a: string | undefined, b: string | undefined): number {
  return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
}
