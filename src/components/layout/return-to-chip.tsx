"use client";

import { ArrowLeft } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

/**
 * Small "Back to task" / "Back to agent" chip rendered inside the viewer toolbar
 * when the user navigated here from a task/agent/cabinet/jobs context. Pops the
 * previous section from the app-store returnTo stack. Renders nothing when
 * there's no return context.
 */
export function ReturnToChip() {
  const returnTo = useAppStore((s) => s.returnTo);
  const popReturnTo = useAppStore((s) => s.popReturnTo);
  if (!returnTo) return null;

  const label = (() => {
    switch (returnTo.type) {
      case "task":
        return "Back to task";
      case "tasks":
        return "Back to tasks";
      case "agent":
        return "Back to agent";
      case "agents":
        return "Back to agents";
      case "cabinet":
        return "Back to cabinet";
      case "jobs":
        return "Back to jobs";
      case "home":
        return "Back to home";
      case "settings":
        return "Back to settings";
      case "registry":
        return "Back to registry";
      default:
        return "Back";
    }
  })();

  return (
    <button
      type="button"
      onClick={popReturnTo}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground/80 shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground"
      title={label}
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </button>
  );
}
