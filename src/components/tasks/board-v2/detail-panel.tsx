"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { TaskConversationPage } from "@/components/tasks/conversation/task-conversation-page";
import { AgentPill } from "./agent-pill";
import { StatusIcon, deriveCardState } from "./status-icon";
import type { LaneKey } from "./lane-rules";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";

/**
 * Slide-out right panel. Renders a thin agent/title chrome at the top and
 * embeds the existing TaskConversationPage in compact variant so the same
 * Chat / Artifacts / Diff / Logs surface that `/tasks/[id]` shows works
 * identically inside the board.
 */
export function DetailPanel({
  task,
  lane,
  agent,
  onClose,
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const state = deriveCardState(task, lane);

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[460px] flex-col border-l border-border/70 bg-background shadow-xl">
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3">
        <StatusIcon state={state} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AgentPill agent={agent} slug={task.agentSlug ?? "general"} />
          </div>
          <h2 className="mt-1 truncate text-[13.5px] font-semibold leading-snug text-foreground">
            {task.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close (Esc)"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1">
        <TaskConversationPage taskId={task.id} variant="compact" />
      </div>
    </aside>
  );
}
