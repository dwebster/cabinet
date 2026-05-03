"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";

export function NavArrows() {
  const canGoBack = useAppStore((s) => s.canGoBack);
  const canGoForward = useAppStore((s) => s.canGoForward);
  const goBack = useAppStore((s) => s.goBack);
  const goForward = useAppStore((s) => s.goForward);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Go back"
        title="Go back"
        className="h-7 w-7"
        onClick={goBack}
        disabled={!canGoBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Go forward"
        title="Go forward"
        className="h-7 w-7"
        onClick={goForward}
        disabled={!canGoForward}
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
