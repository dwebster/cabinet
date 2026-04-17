"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FilePenLine,
  FileText,
  Hammer,
  Pause,
  TerminalSquare,
  User,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Turn, TurnArtifact as Artifact } from "@/types/tasks";

function computeRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.floor(delta / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function subscribeToTick(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

function RelativeTime({ iso }: { iso: string }) {
  const tick = useSyncExternalStore(
    subscribeToTick,
    () => Math.floor(Date.now() / 30_000),
    () => 0
  );
  const label = tick === 0 ? "\u00a0" : computeRelative(iso);
  return <span suppressHydrationWarning>{label}</span>;
}

function FilePath({ path }: { path: string }) {
  const idx = path.lastIndexOf("/");
  const dir = idx >= 0 ? path.slice(0, idx + 1) : "";
  const name = idx >= 0 ? path.slice(idx + 1) : path;
  return (
    <span className="min-w-0 truncate text-[13px]">
      {dir ? <span className="text-muted-foreground/70">{dir}</span> : null}
      <span className="font-medium text-foreground">{name}</span>
    </span>
  );
}

function ArtifactRow({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false);

  const expandable = artifact.kind === "command" && !!artifact.output;

  const inner = (() => {
    switch (artifact.kind) {
      case "file-edit":
        return (
          <>
            <FilePenLine className="size-4 shrink-0 text-amber-500" />
            <FilePath path={artifact.path} />
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">+{artifact.added}</span>
              <span className="text-red-500/90">−{artifact.removed}</span>
            </span>
          </>
        );
      case "file-create":
        return (
          <>
            <FilePlus className="size-4 shrink-0 text-emerald-500" />
            <FilePath path={artifact.path} />
            <span className="ml-auto text-[12px] tabular-nums text-emerald-600 dark:text-emerald-400">
              +{artifact.added}
            </span>
          </>
        );
      case "command":
        return (
          <>
            <TerminalSquare className="size-4 shrink-0 text-sky-500" />
            <span className="min-w-0 truncate font-mono text-[12.5px] text-foreground/90">
              {artifact.cmd}
            </span>
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1 text-[12px] tabular-nums",
                artifact.exit === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500"
              )}
            >
              {artifact.exit === 0 ? "✓" : "✗"} {(artifact.durationMs / 1000).toFixed(2)}s
            </span>
          </>
        );
      case "tool-call":
        return (
          <>
            <Hammer className="size-4 shrink-0 text-violet-500" />
            <span className="min-w-0 truncate text-[13px]">
              <span className="font-medium text-foreground">{artifact.tool}</span>
              <span className="ml-1.5 text-muted-foreground/80">{artifact.target}</span>
            </span>
          </>
        );
      case "page-edit":
        return (
          <>
            <FileText className="size-4 shrink-0 text-blue-500" />
            <span className="min-w-0 truncate text-[13px]">
              <span className="font-medium text-foreground">{artifact.title}</span>
              <span className="ml-1.5 text-muted-foreground/70">{artifact.path}</span>
            </span>
          </>
        );
    }
  })();

  return (
    <div className="group/row">
      <button
        type="button"
        onClick={() => expandable && setOpen((v: boolean) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md bg-card/60 px-2.5 py-2 text-left ring-1 ring-border/50 transition-colors",
          expandable
            ? "cursor-pointer hover:bg-card hover:ring-border"
            : "cursor-default hover:bg-card/80"
        )}
      >
        {expandable ? (
          open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        {inner}
      </button>
      {expandable && open && artifact.kind === "command" && artifact.output ? (
        <pre className="ml-6 mt-1.5 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/80">
          {artifact.output}
        </pre>
      ) : null}
    </div>
  );
}

export function TurnBlock({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  const totalTokens = turn.tokens
    ? turn.tokens.input + turn.tokens.output + (turn.tokens.cache ?? 0)
    : null;

  return (
    <div className={cn("group/turn flex gap-3 px-6 py-5", !isUser && "bg-muted/20")}>
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
          isUser
            ? "border-border bg-background text-muted-foreground"
            : "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{isUser ? "You" : "Agent"}</span>
          <span>·</span>
          <RelativeTime iso={turn.ts} />
          {totalTokens ? (
            <>
              <span>·</span>
              <span className="font-mono tabular-nums">
                {(totalTokens / 1000).toFixed(1)}k tok
              </span>
            </>
          ) : null}
          {turn.awaitingInput ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <Pause className="size-2.5" /> awaiting input
            </span>
          ) : null}
        </div>

        <div className="whitespace-pre-wrap text-[14.5px] leading-[1.65] tracking-[-0.005em] text-foreground/95">
          {turn.content}
        </div>

        {turn.artifacts && turn.artifacts.length > 0 ? (
          <div className="mt-3.5 space-y-1.5 rounded-xl border border-border/60 bg-muted/40 p-2 dark:bg-muted/20">
            {turn.artifacts.map((a, i) => (
              <ArtifactRow key={i} artifact={a} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
