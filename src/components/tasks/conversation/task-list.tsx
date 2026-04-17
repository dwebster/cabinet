"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { conversationMetaToTaskMeta } from "@/lib/agents/conversation-to-task-view";
import type { ConversationMeta } from "@/types/conversations";
import {
  Archive,
  CheckCircle2,
  Circle,
  CircleAlert,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskMeta, TaskStatus } from "@/types/tasks";

function taskHref(task: TaskMeta): string {
  if (task.cabinetPath) {
    return `/#/cabinet/${encodeURIComponent(task.cabinetPath)}/tasks/${encodeURIComponent(task.id)}`;
  }
  return `/#/ops/tasks/${encodeURIComponent(task.id)}`;
}

const STATUS_META: Record<
  TaskStatus,
  { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  idle: { label: "Idle", tone: "bg-muted text-muted-foreground", icon: Circle },
  running: {
    label: "Running",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    icon: Play,
  },
  "awaiting-input": {
    label: "Awaiting input",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    icon: Pause,
  },
  done: {
    label: "Done",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    tone: "bg-red-500/15 text-red-700 dark:text-red-400",
    icon: CircleAlert,
  },
  archived: { label: "Archived", tone: "bg-muted text-muted-foreground", icon: Archive },
};

function subscribeToTick(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

function computeRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.floor(delta / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RelativeTime({ iso }: { iso?: string }) {
  const tick = useSyncExternalStore(
    subscribeToTick,
    () => Math.floor(Date.now() / 30_000),
    () => 0
  );
  if (!iso) return null;
  const label = tick === 0 ? "\u00a0" : computeRelative(iso);
  return <span suppressHydrationWarning>{label}</span>;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
        meta.tone
      )}
    >
      <Icon className="size-2.5" />
      {meta.label}
    </span>
  );
}

function runtimeLabel(meta: TaskMeta): string | null {
  const config = meta.adapterConfig as { model?: string; effort?: string } | undefined;
  const parts = [config?.model, meta.providerId].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const FILTERS: { id: "all" | TaskStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Active" },
  { id: "awaiting-input", label: "Awaiting" },
  { id: "done", label: "Done" },
];

export function TaskList({ tasks: initialTasks }: { tasks: TaskMeta[] }) {
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [tasks, setTasks] = useState(initialTasks);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        const res = await fetch("/api/agents/conversations?limit=500", {
          cache: "no-store",
        });
        const data = await res.json();
        const convos: ConversationMeta[] = Array.isArray(data.conversations)
          ? data.conversations
          : [];
        setTasks(convos.map(conversationMetaToTaskMeta));
      } catch {
        // keep previous on error
      }
    };

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
    return () => {
      es.close();
    };
  }, []);

  const visible = tasks.filter((t) => {
    if (filter === "all") return t.status !== "archived";
    if (filter === "running") {
      return t.status === "running" || t.status === "idle";
    }
    return t.status === filter;
  });

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 px-6 py-20 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Sparkles className="size-5 text-muted-foreground" />
        </div>
        <h2 className="text-[15px] font-semibold">No tasks yet</h2>
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
          Tasks are long-lived conversations with an agent. Each one is a thread — brief, act, adjust, act again.
        </p>
        <Link
          href="/tasks/new"
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-background hover:bg-foreground/90"
        >
          Create your first task
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "inline-flex h-7 items-center rounded-full px-3 text-[11.5px] font-medium transition-colors",
              filter === f.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-muted-foreground">
          Nothing in this view.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {visible.map((task) => {
            const runtime = runtimeLabel(task);
            const tokens = task.tokens?.total ?? 0;
            return (
              <li key={task.id}>
                <Link
                  href={taskHref(task)}
                  className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="mt-0.5">
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[13.5px] font-medium text-foreground">
                        {task.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        <RelativeTime iso={task.lastActivityAt || task.startedAt} />
                      </span>
                    </div>
                    {task.summary ? (
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                        {task.summary}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground/80">
                      {runtime ? <span>{runtime}</span> : null}
                      {runtime && tokens > 0 ? <span>·</span> : null}
                      {tokens > 0 ? (
                        <span className="font-mono tabular-nums">
                          {(tokens / 1000).toFixed(1)}k tok
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
