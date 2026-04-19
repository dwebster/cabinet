"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronRight, Pause, Sparkles, User } from "lucide-react";
import {
  artifactPathToTreePath,
  inferPageTypeFromPath,
  pageTypeColor,
  pageTypeIcon,
} from "@/lib/ui/page-type-icons";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { cn } from "@/lib/utils";
import type { Turn } from "@/types/tasks";
import { Markdown } from "./markdown";
import { ConversationContentViewer } from "@/components/agents/conversation-content-viewer";

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

const THINKING_VERBS = [
  "Thinking",
  "Pondering",
  "Cogitating",
  "Musing",
  "Ruminating",
  "Forging",
  "Weaving",
  "Conjuring",
  "Brewing",
  "Mulling",
  "Stirring",
  "Sizzling",
  "Tinkering",
  "Grokking",
  "Percolating",
  "Hacking",
  "Wrangling",
  "Divining",
  "Plotting",
  "Scheming",
  "Jizzling",
  "Noodling",
  "Riffing",
  "Whirring",
  "Simmering",
];

function PendingIndicator() {
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_VERBS.length)
  );
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const verbIv = setInterval(() => {
      setIdx((i) => (i + 1 + Math.floor(Math.random() * 3)) % THINKING_VERBS.length);
    }, 2400);
    const tickIv = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => {
      clearInterval(verbIv);
      clearInterval(tickIv);
    };
  }, []);
  return (
    <div className="mt-2 inline-flex items-center gap-2 text-[13px] italic text-muted-foreground">
      <span className="font-medium text-foreground/75">
        {THINKING_VERBS[idx]}
      </span>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        <span className="size-1 rounded-full bg-foreground/60 animate-bounce [animation-delay:-0.3s] [animation-duration:1s]" />
        <span className="size-1 rounded-full bg-foreground/60 animate-bounce [animation-delay:-0.15s] [animation-duration:1s]" />
        <span className="size-1 rounded-full bg-foreground/60 animate-bounce [animation-duration:1s]" />
      </span>
      {elapsed > 2 ? (
        <span className="ml-1 font-mono text-[10.5px] tabular-nums opacity-60">
          {elapsed}s
        </span>
      ) : null}
    </div>
  );
}

function basename(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] || p;
}

function directory(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts.slice(0, -1).join(" / ");
}

/* eslint-disable react-hooks/static-components */
function KbArtifactRow({ path }: { path: string }) {
  const setSection = useAppStore((s) => s.setSection);
  const selectPage = useTreeStore((s) => s.selectPage);
  const loadPage = useEditorStore((s) => s.loadPage);
  const kind = inferPageTypeFromPath(path);
  const Icon = pageTypeIcon(kind);
  const color = pageTypeColor(kind);
  const name = basename(path);
  const dir = directory(path);
  return (
    <button
      type="button"
      onClick={() => {
        const treePath = artifactPathToTreePath(path);
        selectPage(treePath);
        setSection({ type: "page" });
        void loadPage(treePath);
      }}
      className="group flex w-full items-center gap-2.5 rounded-md bg-card/80 px-2.5 py-2 text-left ring-1 ring-border/60 transition-colors hover:bg-muted/40"
    >
      <Icon className={cn("size-4 shrink-0", color)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-foreground">
          {name}
        </div>
        {dir ? (
          <div className="truncate text-[10.5px] text-muted-foreground/75">
            {dir}
          </div>
        ) : null}
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
/* eslint-enable react-hooks/static-components */

function collectArtifactPaths(turn: Turn): string[] {
  const seen = new Set<string>();
  for (const artifact of turn.artifacts ?? []) {
    if (
      artifact.kind === "file-edit" ||
      artifact.kind === "file-create" ||
      artifact.kind === "page-edit"
    ) {
      seen.add(artifact.path);
    }
  }
  return [...seen];
}

export function TurnBlock({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  const totalTokens = turn.tokens
    ? turn.tokens.input + turn.tokens.output + (turn.tokens.cache ?? 0)
    : null;
  const artifactPaths = collectArtifactPaths(turn);

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

        {isUser ? (
          <Markdown
            content={turn.content}
            className="text-[14.5px] leading-[1.65] tracking-[-0.005em] text-foreground/95"
          />
        ) : turn.content.trim() ? (
          <ConversationContentViewer text={turn.content} />
        ) : null}

        {!isUser && turn.pending ? <PendingIndicator /> : null}

        {artifactPaths.length > 0 ? (
          <div className="mt-3.5 space-y-1.5 rounded-xl border border-border/60 bg-muted/40 p-2 dark:bg-muted/20">
            {artifactPaths.map((path) => (
              <KbArtifactRow key={path} path={path} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
