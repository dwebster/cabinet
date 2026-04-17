"use client";

import { useState } from "react";
import { ArrowUp, AtSign, BrainCircuit, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function TaskComposerPanel({
  runtimeLabel,
  awaitingInput,
  onSend,
}: {
  runtimeLabel: string;
  awaitingInput: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim()) return;
    onSend(value);
    setValue("");
  };

  return (
    <div
      className={cn(
        "border-t border-border/70 bg-background px-6 py-4",
        awaitingInput && "bg-amber-500/[0.04]"
      )}
    >
      {awaitingInput ? (
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
          </span>
          Agent is waiting for your reply
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-2xl border bg-background shadow-sm transition-colors",
          "focus-within:border-foreground/30 focus-within:shadow",
          awaitingInput ? "border-amber-500/40" : "border-border"
        )}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          autoFocus={awaitingInput}
          placeholder={awaitingInput ? "Reply to the agent…" : "Continue the conversation…"}
          rows={3}
          className="block w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />

        <div className="flex items-center gap-1 border-t border-border/60 px-2 py-1.5">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground">
            <AtSign className="size-3.5" />
            Mention
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground">
            <Paperclip className="size-3.5" />
            Attach
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <BrainCircuit className="size-3.5" />
              {runtimeLabel}
            </span>
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-[11px]"
              disabled={!value.trim()}
              onClick={submit}
            >
              Send
              <ArrowUp className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      <p className="mt-2 px-1 text-[10px] text-muted-foreground">
        ⌘↵ to send · session continues across turns
      </p>
    </div>
  );
}
