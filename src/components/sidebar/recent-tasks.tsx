"use client";

import { useEffect, useMemo, useState } from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { conversationMetaToTaskMeta } from "@/lib/agents/conversation-to-task-view";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { isLegacyAdapterType } from "@/lib/agents/adapters/legacy-ids";
import type { ConversationMeta } from "@/types/conversations";
import type { TaskMeta } from "@/types/tasks";

function normalizeConversation(meta: ConversationMeta): TaskMeta {
  return conversationMetaToTaskMeta(meta);
}

// "Done, recently" = idle or done whose last activity landed within this window.
const DONE_FRESH_MS = 60 * 60 * 1000; // 1 hour
const MAX_VISIBLE = 6;
// Fetch a larger slice from the API (which still sorts by startedAt) so we
// can re-rank by lastActivityAt locally. 30 is generous — we'd rather pull a
// few extra KB than miss a long-running conversation whose lastActivityAt is
// fresher than several freshly-created-but-idle ones.
const FETCH_POOL = 30;

/**
 * Minimal agent shape the sidebar passes down. We only need the slug + the
 * optional hex color so running tasks inherit their owner's personality tint.
 */
interface SidebarAgentRef {
  slug: string;
  color?: string;
}

function isRecentlyDone(task: TaskMeta, now: number): boolean {
  if (task.status !== "done" && task.status !== "idle") return false;
  const last = task.lastActivityAt || task.completedAt || task.startedAt;
  if (!last) return false;
  return now - new Date(last).getTime() < DONE_FRESH_MS;
}

function resolveAgentColor(
  slug: string,
  agents: SidebarAgentRef[]
): string {
  const explicit = agents.find((a) => a.slug === slug)?.color;
  if (explicit) return tintFromHex(explicit).text;
  return getAgentColor(slug).text;
}

export function RecentTasks({
  active,
  padStyle,
  itemClass,
  cabinetPath,
  agents = [],
}: {
  active: boolean;
  padStyle: React.CSSProperties;
  itemClass: (active: boolean) => string;
  cabinetPath?: string;
  agents?: SidebarAgentRef[];
}) {
  const setSection = useAppStore((s) => s.setSection);
  const activeTaskId = useAppStore((s) =>
    s.section.type === "task" ? s.section.taskId : undefined
  );
  const [tasks, setTasks] = useState<TaskMeta[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const loadTasks = async () => {
      const params = new URLSearchParams({ limit: String(FETCH_POOL) });
      if (cabinetPath) params.set("cabinetPath", cabinetPath);
      try {
        const res = await fetch(`/api/agents/conversations?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        const convos = Array.isArray(data.conversations) ? data.conversations : [];
        // API sorts by startedAt DESC. Re-sort by lastActivityAt ?? startedAt
        // so actively-streaming conversations outrank freshly-created idle
        // ones. Then take the top MAX_VISIBLE.
        const ranked = convos
          .map(normalizeConversation)
          .sort((a: TaskMeta, b: TaskMeta) => {
            const ta = new Date(
              a.lastActivityAt ?? a.completedAt ?? a.startedAt ?? 0
            ).getTime();
            const tb = new Date(
              b.lastActivityAt ?? b.completedAt ?? b.startedAt ?? 0
            ).getTime();
            return tb - ta;
          })
          .slice(0, MAX_VISIBLE);
        setTasks(ranked);
      } catch {
        if (!cancelled) setTasks([]);
      }
    };

    void loadTasks();

    // Auto-refresh via the global conversation SSE.
    const es = new EventSource("/api/agents/conversations/events");
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as { type: string };
        if (event.type === "ping") return;
        void loadTasks();
      } catch {
        // ignore
      }
    };

    // Tick once a minute so "fresh done" green dots fade back to muted without
    // waiting for the next SSE event.
    const tick = setInterval(() => setNow(Date.now()), 60_000);

    return () => {
      cancelled = true;
      es.close();
      clearInterval(tick);
    };
  }, [active, cabinetPath]);

  const agentColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      map.set(a.slug, resolveAgentColor(a.slug, agents));
    }
    return map;
  }, [agents]);

  if (!active) return null;

  if (tasks === null) {
    return (
      <div
        className="px-3 py-1 text-[11px] text-muted-foreground/60"
        style={padStyle}
      >
        Loading…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        className="px-3 py-1 text-[11px] text-muted-foreground/60"
        style={padStyle}
      >
        No tasks yet.
      </div>
    );
  }

  return (
    <>
      {tasks.map((task) => {
        const isActive = activeTaskId === task.id;
        const fresh = isRecentlyDone(task, now);
        const slugForColor = task.agentSlug || "editor";
        const agentTint =
          agentColorMap.get(slugForColor) || resolveAgentColor(slugForColor, agents);

        // Pick the dot variant and color. Running → agent color, pulsing.
        // Needs reply → amber, solid. Failed → red. Done (recent) → green.
        // Older idle/done → muted.
        let dotClass = "bg-muted-foreground/35";
        let dotStyle: React.CSSProperties | undefined;
        let dotPulseColor: string | undefined;
        let tooltip = task.title;

        if (task.status === "running") {
          dotClass = "";
          dotStyle = { backgroundColor: agentTint };
          dotPulseColor = agentTint;
          tooltip = `${task.title} — running`;
        } else if (task.status === "awaiting-input") {
          dotClass = "bg-amber-500";
          tooltip = `${task.title} — needs reply`;
        } else if (task.status === "failed") {
          dotClass = "bg-red-500";
          tooltip = `${task.title} — failed`;
        } else if (task.status === "archived") {
          dotClass = "bg-muted-foreground/20";
        } else if (fresh) {
          dotClass = "bg-emerald-500";
          tooltip = `${task.title} — just finished`;
        }

        return (
          <button
            key={task.id}
            onClick={() =>
              setSection({
                type: "task",
                taskId: task.id,
                cabinetPath: task.cabinetPath,
              })
            }
            className={itemClass(isActive)}
            style={padStyle}
            title={tooltip}
          >
            <span className="relative mt-[1px] inline-flex size-1.5 shrink-0">
              {dotPulseColor && (
                <span
                  className="absolute inset-0 rounded-full animate-ping opacity-70"
                  style={{ backgroundColor: dotPulseColor }}
                />
              )}
              <span
                className={cn(
                  "relative inline-block size-1.5 rounded-full",
                  dotClass
                )}
                style={dotStyle}
              />
            </span>
            <span className="truncate">{task.title}</span>
            {isLegacyAdapterType(task.adapterType) && (
              <Terminal
                className="ml-auto size-2.5 shrink-0 text-emerald-500"
                aria-label="Terminal (PTY) mode"
              />
            )}
          </button>
        );
      })}
    </>
  );
}
