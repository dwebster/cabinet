"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { TaskConversationPage } from "@/components/tasks/conversation/task-conversation-page";
import { cn } from "@/lib/utils";
import { AgentPill } from "./agent-pill";
import { StatusIcon, deriveCardState } from "./status-icon";
import { setConversationMuted } from "./board-actions";
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
  onRefresh,
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const state = deriveCardState(task, lane);
  const [muting, setMuting] = useState(false);
  const muted = !!task.muted;

  async function toggleMuted() {
    if (muting) return;
    setMuting(true);
    try {
      await setConversationMuted(task.id, !muted, task.cabinetPath);
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error("[board-v2] mute toggle failed", err);
    } finally {
      setMuting(false);
    }
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[460px] flex-col border-l border-border/70 bg-background shadow-xl">
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3">
        <StatusIcon state={state} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AgentPill agent={agent} slug={task.agentSlug ?? "editor"} />
          </div>
          <h2 className="mt-1 truncate text-[13.5px] font-semibold leading-snug text-foreground">
            {task.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={toggleMuted}
          disabled={muting}
          className={cn(
            "rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
            muted && "text-foreground"
          )}
          title={muted ? "Unmute — done runs resurface in Just Finished" : "Mute — done runs go straight to Archive"}
        >
          {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        </button>
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
        <TaskConversationPage
          taskId={task.id}
          variant="compact"
          returnContext={{
            type: "task",
            taskId: task.id,
            cabinetPath: task.cabinetPath,
          }}
        />
      </div>
    </aside>
  );
}
