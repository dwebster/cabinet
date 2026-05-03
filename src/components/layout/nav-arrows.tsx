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
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Go back"
        title="Go back (⌘[)"
        className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
        onClick={goBack}
        disabled={!canGoBack}
      >
        <ArrowLeft className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Go forward"
        title="Go forward (⌘])"
        className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
        onClick={goForward}
        disabled={!canGoForward}
      >
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}
