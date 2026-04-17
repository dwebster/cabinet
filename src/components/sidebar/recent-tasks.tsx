"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { conversationMetaToTaskMeta } from "@/lib/agents/conversation-to-task-view";
import type { ConversationMeta } from "@/types/conversations";
import type { TaskMeta, TaskStatus } from "@/types/tasks";

function normalizeConversation(meta: ConversationMeta): TaskMeta {
  return conversationMetaToTaskMeta(meta);
}

const STATUS_DOT: Record<TaskStatus, string> = {
  idle: "bg-muted-foreground/35",
  running: "bg-sky-500 animate-pulse",
  "awaiting-input": "bg-amber-500",
  done: "bg-emerald-500",
  failed: "bg-red-500",
  archived: "bg-muted-foreground/20",
};

const MAX_VISIBLE = 6;

export function RecentTasks({
  active,
  padStyle,
  itemClass,
  cabinetPath,
}: {
  active: boolean;
  padStyle: React.CSSProperties;
  itemClass: (active: boolean) => string;
  cabinetPath?: string;
}) {
  const setSection = useAppStore((s) => s.setSection);
  const activeTaskId = useAppStore((s) =>
    s.section.type === "task" ? s.section.taskId : undefined
  );
  const [tasks, setTasks] = useState<TaskMeta[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const loadTasks = async () => {
      const params = new URLSearchParams({ limit: String(MAX_VISIBLE) });
      if (cabinetPath) params.set("cabinetPath", cabinetPath);
      try {
        const res = await fetch(`/api/agents/conversations?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        const convos = Array.isArray(data.conversations) ? data.conversations : [];
        setTasks(convos.map(normalizeConversation));
      } catch {
        if (!cancelled) setTasks([]);
      }
    };

    void loadTasks();

    // Subscribe to global conversation events to auto-refresh.
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
      cancelled = true;
      es.close();
    };
  }, [active, cabinetPath]);

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
      {tasks.map((task) => (
        <button
          key={task.id}
          onClick={() =>
            setSection({
              type: "task",
              taskId: task.id,
              mode: task.cabinetPath ? "cabinet" : "ops",
              cabinetPath: task.cabinetPath,
            })
          }
          className={itemClass(activeTaskId === task.id)}
          style={padStyle}
          title={task.title}
        >
          <span
            className={cn(
              "mt-[1px] size-1.5 shrink-0 rounded-full",
              STATUS_DOT[task.status]
            )}
          />
          <span className="truncate">{task.title}</span>
        </button>
      ))}
    </>
  );
}
