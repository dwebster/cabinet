"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface PendingConfirm {
  id: string;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

/**
 * Inline-feeling confirmation prompt for risky drag-and-drop actions.
 * Backdropped but small — docks near the bottom of the board so it doesn't
 * feel like a full modal interrupt. Esc or Cancel dismisses.
 */
export function ConfirmPopover({
  pending,
  onDismiss,
}: {
  pending: PendingConfirm | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onDismiss]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-[1px]"
        onClick={onDismiss}
      />
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border/70 bg-card p-4 shadow-xl">
        <h3 className="text-[14px] font-semibold text-foreground">{pending.title}</h3>
        {pending.body && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {pending.body}
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border/60 bg-background px-3 py-1 text-[12px] font-medium text-foreground hover:bg-muted"
          >
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await pending.onConfirm();
              } finally {
                onDismiss();
              }
            }}
            className={cn(
              "rounded-md px-3 py-1 text-[12px] font-medium",
              pending.destructive
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-foreground text-background hover:bg-foreground/90"
            )}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
