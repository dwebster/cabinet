"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Copy,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import {
  isLegacyAdapterType,
  supportsTerminalResume,
} from "@/lib/agents/adapters/legacy-ids";
import { WebTerminal } from "@/components/terminal/web-terminal";
import { stopConversation } from "@/components/tasks/board-v2/board-actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TurnBlock } from "./turn-block";
import { ArtifactsList } from "./artifacts-list";
import { DiffPanel } from "./diff-panel";
import { LogsPanel } from "./logs-panel";
import { TaskComposerPanel } from "./task-composer-panel";
import { MOCK_TASK } from "./mock-data";
import type { Task, TaskEvent, TaskStatus } from "@/types/tasks";
import { compactTask, fetchTask, patchTask, postTurn } from "@/lib/agents/task-client";

const STATUS_META: Record<
  TaskStatus,
  { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  idle: { label: "Idle", tone: "bg-muted text-muted-foreground", icon: Circle },
  running: {
    label: "Running",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    icon: Play,
  },
  "awaiting-input": {
    label: "Awaiting input",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    icon: Pause,
  },
  done: {
    label: "Done",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    tone: "bg-red-500/15 text-red-700 dark:text-red-400",
    icon: CircleAlert,
  },
  archived: { label: "Archived", tone: "bg-muted text-muted-foreground", icon: Archive },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.tone
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

function TokenBar({ used, window: ctxWindow }: { used: number; window: number }) {
  const pct = Math.min(100, (used / ctxWindow) * 100);
  const tone =
    pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-foreground/70";
  return (
    <div className="flex items-center gap-2">
      <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {(used / 1000).toFixed(1)}k{" "}
        <span className="opacity-60">/ {(ctxWindow / 1000).toFixed(0)}k</span>
      </div>
      <div className="relative h-1 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 transition-all", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

function WrapUpCard({
  onMarkDone,
  onDismiss,
}: {
  onMarkDone: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mx-auto my-5 w-full max-w-[36rem] px-6">
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] px-4 py-3.5 dark:border-emerald-400/20 dark:bg-emerald-400/[0.05]">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-foreground">
              Looks like a good place to wrap up.
            </p>
            <p className="text-[12px] text-muted-foreground">
              Mark this task done, or keep replying below.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={onDismiss}
            >
              Not yet
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-[11px]"
              onClick={onMarkDone}
            >
              <Check className="size-3" />
              Mark done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildRuntimeLabel(task: Task): string {
  const config = task.meta.adapterConfig as
    | { model?: string; effort?: string }
    | undefined;
  const model = config?.model;
  const effort = config?.effort;
  const provider = task.meta.providerId;
  const parts = [model, provider, effort].filter(Boolean);
  return parts.length ? parts.join(" · ") : "default runtime";
}

function readRuntimeModel(config?: Record<string, unknown>): string | undefined {
  if (!config) return undefined;
  const value = config.model;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRuntimeEffort(config?: Record<string, unknown>): string | undefined {
  if (!config) return undefined;
  const value = config.effort ?? config.reasoningEffort;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Derives the list of skill slugs attached to a run from its adapterConfig.
 * `skillsDir` is a per-run tmpdir materialized by the runner; the directory
 * name itself isn't useful for display, so we list the skill slugs out of
 * `skills` if the runner persisted them, falling back to the tmpdir basename.
 * Returns `null` when no skills were attached so callers can skip the chip.
 */
function readRuntimeSkills(config?: Record<string, unknown>): string[] | null {
  if (!config) return null;
  const skills = config.skills;
  if (Array.isArray(skills)) {
    const slugs = skills.filter(
      (value): value is string => typeof value === "string" && value.trim() !== ""
    );
    if (slugs.length > 0) return slugs;
  }
  // Fallback: the runner always sets skillsDir when it attached anything, so
  // presence alone is a signal even if the slug list wasn't persisted.
  const dir = config.skillsDir;
  return typeof dir === "string" && dir.trim() ? [] : null;
}

const DEFAULT_CONTEXT_WINDOW = 200_000;

export interface TaskConversationPageProps {
  taskId: string;
  variant?: "full" | "compact";
  readOnly?: boolean;
}

export function TaskConversationPage({
  taskId,
  variant = "full",
  readOnly = false,
}: TaskConversationPageProps) {
  const isDemo = taskId === "demo";
  const isCompact = variant === "compact";
  const [task, setTask] = useState<Task | null>(isDemo ? MOCK_TASK : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [wrapUpDismissed, setWrapUpDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial fetch (skip for demo)
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    setLoadError(null);
    fetchTask(taskId)
      .then((t) => {
        if (!cancelled) setTask(t);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo, taskId]);

  // SSE subscription (skip for demo)
  useEffect(() => {
    if (isDemo) return;
    const url = `/api/agents/conversations/${encodeURIComponent(taskId)}/events`;
    const es = new EventSource(url);
    es.onmessage = async (msg) => {
      try {
        const event = JSON.parse(msg.data) as TaskEvent | { type: "ping" };
        if (event.type === "ping") return;
        if (event.type === "task.deleted") return;
        // Re-fetch on any task/turn event — simple, durable
        const fresh = await fetchTask(taskId);
        setTask(fresh);
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => {
      // Browser will auto-reconnect; nothing to do
    };
    return () => {
      es.close();
    };
  }, [isDemo, taskId]);

  // Cleanup demo settle timer
  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  const runtimeLabel = useMemo(() => (task ? buildRuntimeLabel(task) : ""), [task]);
  const contextWindow = task?.meta.runtime?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const tokenPct = task?.meta.tokens
    ? Math.min(100, (task.meta.tokens.total / contextWindow) * 100)
    : 0;

  const isTerminalMode = task ? isLegacyAdapterType(task.meta.adapterType) : false;
  const firstUserTurn = task?.turns.find((t) => t.role === "user") || null;
  const terminalPrompt = firstUserTurn?.content || task?.meta.title || "";
  const attachedSkills = task ? readRuntimeSkills(task.meta.adapterConfig) : null;

  const lastTurn = task ? task.turns[task.turns.length - 1] : null;
  const showWrapUp =
    !!task &&
    !wrapUpDismissed &&
    task.meta.status === "idle" &&
    lastTurn?.role === "agent" &&
    !lastTurn.pending;

  const handleSend = useCallback(
    async (payload: {
      text: string;
      mentionedPaths: string[];
      runtime: {
        providerId?: string;
        adapterType?: string;
        model?: string;
        effort?: string;
        runtimeMode?: "native" | "terminal";
      };
    }) => {
      if (!task) return;
      setWrapUpDismissed(false);

      if (isDemo) {
        const nextTurn = task.turns.length + 1;
        const userTurn = {
          id: `t${nextTurn}u`,
          turn: nextTurn,
          role: "user" as const,
          ts: new Date().toISOString(),
          content: payload.text,
        };
        const pendingId = `t${nextTurn + 1}a`;
        const pendingTurn = {
          id: pendingId,
          turn: nextTurn + 1,
          role: "agent" as const,
          ts: new Date().toISOString(),
          content: "Working on it…",
          pending: true,
        };
        setTask((t) =>
          t
            ? {
                ...t,
                meta: { ...t.meta, status: "running" },
                turns: [...t.turns, userTurn, pendingTurn],
              }
            : t
        );

        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => {
          setTask((t) =>
            t
              ? {
                  ...t,
                  meta: { ...t.meta, status: "idle" },
                  turns: t.turns.map((turn) =>
                    turn.id === pendingId
                      ? {
                          ...turn,
                          pending: undefined,
                          content:
                            "Done. I went with OIDC — added `src/auth/sso.ts`, wired it into `login.ts`, and all 26 tests still pass.",
                          tokens: { input: 5_200, output: 480, cache: 9_600 },
                        }
                      : turn
                  ),
                }
              : t
          );
        }, 1_800);
        return;
      }

      setBusy(true);
      try {
        const result = await postTurn(
          taskId,
          {
            role: "user",
            content: payload.text,
            mentionedPaths: payload.mentionedPaths,
            runtime: payload.runtime,
          },
          task.meta.cabinetPath
        );
        setTask(result.task);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to send");
      } finally {
        setBusy(false);
      }
    },
    [task, isDemo, taskId]
  );

  const handleMarkDone = useCallback(async () => {
    if (!task) return;
    if (isDemo) {
      setTask((t) => (t ? { ...t, meta: { ...t.meta, status: "done" } } : t));
      return;
    }
    setBusy(true);
    try {
      const { meta } = await patchTask(taskId, { status: "done" });
      setTask((t) => (t ? { ...t, meta } : t));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }, [task, isDemo, taskId]);

  const handleCompact = useCallback(async () => {
    if (!task || isDemo) return;
    setBusy(true);
    try {
      await compactTask(taskId, task.meta.cabinetPath);
      // Fresh fetch; SSE will deliver further updates as the digest streams.
      const fresh = await fetchTask(taskId, task.meta.cabinetPath);
      setTask(fresh);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to compact");
    } finally {
      setBusy(false);
    }
  }, [task, isDemo, taskId]);

  const handleSummarySave = useCallback(async () => {
    if (!task) return;
    const next = summaryDraft.trim();
    if (isDemo) {
      setTask((t) => (t ? { ...t, meta: { ...t.meta, summary: next } } : t));
      setEditingSummary(false);
      return;
    }
    setBusy(true);
    try {
      const { meta } = await patchTask(taskId, { summary: next });
      setTask((t) => (t ? { ...t, meta } : t));
      setEditingSummary(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to save summary");
    } finally {
      setBusy(false);
    }
  }, [task, isDemo, summaryDraft, taskId]);

  const startEditingSummary = () => {
    setSummaryDraft(task?.meta.summary ?? "");
    setEditingSummary(true);
  };

  if (loadError && !task) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-foreground">
        <div className="max-w-sm rounded-2xl border border-border/70 bg-card px-6 py-5 text-center">
          <p className="text-[13px] font-medium">Couldn&rsquo;t load task</p>
          <p className="mt-1 text-[12px] text-muted-foreground">{loadError}</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-7 items-center justify-center rounded-md px-3 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Back home
          </Link>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  // Fullscreen terminal-mode layout: thin dark top strip + WebTerminal fills
  // the rest. No tabs, no token bar, no prompt header card — the CLI's own
  // output is the source of truth. Composer pinned to the bottom only when
  // the PTY has exited (idle).
  if (isTerminalMode && !isCompact) {
    const statusTone =
      task.meta.status === "running"
        ? "bg-emerald-500/20 text-emerald-300"
        : task.meta.status === "awaiting-input"
          ? "bg-amber-500/20 text-amber-300"
          : task.meta.status === "failed"
            ? "bg-rose-500/20 text-rose-300"
            : "bg-zinc-700/60 text-zinc-300";
    const statusLabel =
      task.meta.status === "running"
        ? "live"
        : task.meta.status === "awaiting-input"
          ? "awaiting input"
          : task.meta.status === "idle"
            ? "exited"
            : task.meta.status === "failed"
              ? "failed"
              : task.meta.status === "done"
                ? "done"
                : "archived";

    const copyPrompt = () => {
      if (!terminalPrompt) return;
      navigator.clipboard.writeText(terminalPrompt).catch(() => {});
    };

    return (
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        {/* Thin top strip */}
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3">
          <Link
            href="/"
            className="inline-flex size-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            title="Back"
          >
            <ArrowLeft className="size-3.5" />
          </Link>
          <Terminal className="size-3.5 shrink-0 text-emerald-400" />
          <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
            {task.meta.title}
          </h1>
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              statusTone
            )}
          >
            <span className="relative inline-flex size-3 items-center justify-center">
              <Terminal className="relative z-10 size-3" />
              {task.meta.status === "running" && (
                <span
                  className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping"
                  aria-hidden="true"
                />
              )}
            </span>
            {statusLabel}
          </span>
          {task.meta.providerId && (
            <span
              className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
              title={`Provider: ${task.meta.providerId}`}
            >
              {task.meta.providerId}
            </span>
          )}
          {attachedSkills && attachedSkills.length > 0 && (
            <span
              className="shrink-0 inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300"
              title={`Skills attached: ${attachedSkills.join(", ")}`}
            >
              <Sparkles className="size-3" />
              {attachedSkills.length === 1
                ? attachedSkills[0]
                : `${attachedSkills.length} skills`}
            </span>
          )}
          <div className="h-5 w-px bg-zinc-800" />
          <button
            type="button"
            onClick={copyPrompt}
            disabled={!terminalPrompt}
            className="inline-flex size-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            title="Copy original prompt"
          >
            <Copy className="size-3.5" />
          </button>
          {task.meta.status === "running" || task.meta.status === "awaiting-input" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              disabled={busy || isDemo}
              onClick={async () => {
                try {
                  setBusy(true);
                  await stopConversation(task.meta.id, task.meta.cabinetPath);
                } catch (e) {
                  console.error(e);
                } finally {
                  setBusy(false);
                }
              }}
              title="Send SIGTERM to the running PTY process"
            >
              <Square className="size-3 fill-current" />
              Stop
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            disabled={
              busy ||
              task.meta.status === "done" ||
              task.meta.status === "archived"
            }
            onClick={handleMarkDone}
          >
            <Check className="size-3" />
            {task.meta.status === "done" ? "Done" : "Mark done"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="More"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </header>

        {/* Terminal fills the rest of the viewport */}
        <div className="min-h-0 flex-1 bg-zinc-950">
          <WebTerminal
            sessionId={task.meta.id}
            reconnect
            themeSurface="terminal"
            onClose={() => {
              /* PTY ending is handled by the daemon; status updates via SSE. */
            }}
          />
        </div>

        {/* Composer: only shows when the PTY has exited. */}
        {!readOnly && task.meta.status === "idle" ? (() => {
          const canResume = supportsTerminalResume(task.meta.providerId);
          return (
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950">
              <div className="mx-auto w-full max-w-4xl px-3 py-2">
                {canResume ? (
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    <span>
                      Session exited — your next turn resumes in the same{" "}
                      {task.meta.providerId} session.
                    </span>
                  </div>
                ) : (
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    <span>
                      Session exited. {task.meta.providerId ?? "This CLI"} has no native
                      resume — Cabinet will prepend the prior transcript so the new run
                      still has context.
                    </span>
                  </div>
                )}
                <div className="[&_textarea]:bg-zinc-900 [&_textarea]:text-zinc-100 [&_textarea]:placeholder:text-zinc-500 [&_textarea]:border-zinc-800">
                  <TaskComposerPanel
                    awaitingInput={false}
                    onSend={handleSend}
                    initialRuntime={{
                      providerId: task.meta.providerId,
                      adapterType: task.meta.adapterType,
                      model: readRuntimeModel(task.meta.adapterConfig),
                      effort: readRuntimeEffort(task.meta.adapterConfig),
                      runtimeMode: "terminal",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })() : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Top bar (hidden in compact variant) */}
      {!isCompact ? (
      <header className="flex items-center gap-3 border-b border-border/70 px-6 py-3">
        <Link
          href="/"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isTerminalMode && (
              <span
                title="Running in terminal (PTY) mode"
                className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
              >
                <Terminal className="size-3" />
                PTY
              </span>
            )}
            {attachedSkills && attachedSkills.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium text-violet-700 dark:text-violet-400"
                title={`Skills attached: ${attachedSkills.join(", ")}`}
              >
                <Sparkles className="size-3" />
                {attachedSkills.length === 1
                  ? attachedSkills[0]
                  : `${attachedSkills.length} skills`}
              </span>
            )}
            <h1 className="truncate text-[14px] font-semibold tracking-tight">
              {task.meta.title}
            </h1>
            <StatusBadge status={task.meta.status} />
            {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{runtimeLabel}</span>
            <span>·</span>
            <TokenBar used={task.meta.tokens?.total ?? 0} window={contextWindow} />
            {task.meta.errorKind ? (
              <>
                <span>·</span>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
                  title={task.meta.errorHint || undefined}
                >
                  <CircleAlert className="size-3" />
                  {task.meta.errorKind.replace(/_/g, " ")}
                </span>
              </>
            ) : null}
          </div>
          {task.meta.errorKind && task.meta.errorHint ? (
            <div className="mt-1 text-[11px] leading-4 text-destructive/90">
              {task.meta.errorHint}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px]">
            <GitBranch className="size-3.5" />
            main
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-[11px]"
            disabled={busy || isDemo || task.turns.length < 2}
            onClick={handleCompact}
            title="Collapse prior turns into a digest to free context window"
          >
            <RefreshCw className="size-3.5" />
            Compact
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-[11px]"
            disabled={
              busy ||
              task.meta.status === "done" ||
              task.meta.status === "archived"
            }
            onClick={handleMarkDone}
          >
            <Check className="size-3.5" />
            {task.meta.status === "done" ? "Done" : "Mark done"}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </header>
      ) : null}

      {/* Summary */}
      <div className="border-b border-border/70 bg-muted/20 px-6 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Summary
          </span>
          {editingSummary ? (
            <div className="flex-1 space-y-2">
              <textarea
                className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none"
                rows={2}
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    setSummaryDraft(task.meta.summary ?? "");
                    setEditingSummary(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={handleSummarySave}
                  disabled={busy}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="flex-1 text-[13px] leading-relaxed text-foreground/80">
                {task.meta.summary || (
                  <span className="text-muted-foreground/70">No summary yet.</span>
                )}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
                onClick={startEditingSummary}
              >
                <Pencil className="size-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs + content */}
      <Tabs defaultValue="chat" className="flex flex-1 min-h-0 flex-col gap-0">
        <div className="border-b border-border/70 px-6">
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="artifacts">
              Artifacts
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
                {task.turns.flatMap((t) => t.artifacts ?? []).length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="diff">Diff</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {isTerminalMode ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <TerminalPromptHeader
                prompt={terminalPrompt}
                providerId={task.meta.providerId}
                adapterType={task.meta.adapterType}
                status={task.meta.status}
              />
              <div className="flex-1 min-h-0 bg-zinc-950">
                <WebTerminal
                  sessionId={task.meta.id}
                  reconnect
                  themeSurface="terminal"
                  onClose={() => {
                    /* PTY ending is handled by the daemon; status updates via SSE. */
                  }}
                />
              </div>
              {!readOnly ? (
                <div className="shrink-0 border-t border-zinc-800 bg-zinc-950">
                  <div className="mx-auto w-full max-w-3xl">
                    {task.meta.status === "idle" ? (
                      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 text-[11px] text-zinc-400">
                        <CheckCircle2 className="size-3 text-emerald-500" />
                        <span>Session ended — type to continue in the same terminal.</span>
                      </div>
                    ) : task.meta.status === "running" ? (
                      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 text-[11px] text-zinc-400">
                        <Loader2 className="size-3 animate-spin text-emerald-500" />
                        <span>Terminal live. Your next prompt queues after this turn finishes.</span>
                      </div>
                    ) : null}
                    <div className="[&_textarea]:bg-zinc-900 [&_textarea]:text-zinc-100 [&_textarea]:placeholder:text-zinc-500 [&_textarea]:border-zinc-800 [&_*]:!text-zinc-100">
                      <TaskComposerPanel
                        awaitingInput={task.meta.status === "awaiting-input"}
                        onSend={handleSend}
                        initialRuntime={{
                          providerId: task.meta.providerId,
                          adapterType: task.meta.adapterType,
                          model: readRuntimeModel(task.meta.adapterConfig),
                          effort: readRuntimeEffort(task.meta.adapterConfig),
                          runtimeMode: "terminal",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
          <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tokenPct >= 80 && task.meta.status !== "done" && !readOnly ? (
              <div className="mx-auto mx-6 my-4 max-w-3xl">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-3 text-[13px]",
                    tokenPct >= 95
                      ? "border-red-500/40 bg-red-500/[0.04] text-red-700 dark:text-red-400"
                      : "border-amber-500/40 bg-amber-500/[0.04] text-amber-700 dark:text-amber-400"
                  )}
                >
                  <RefreshCw className="size-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">
                      {tokenPct >= 95
                        ? "Context window almost full"
                        : "Approaching context limit"}
                    </div>
                    <div className="text-[11.5px] opacity-80">
                      {tokenPct.toFixed(0)}% of {(contextWindow / 1000).toFixed(0)}k used.
                      Compact to collapse earlier turns into a digest.
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2.5 text-[11px]"
                    onClick={handleCompact}
                    disabled={busy || task.turns.length < 2}
                  >
                    Compact now
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="mx-auto max-w-3xl divide-y divide-border/40">
              {task.turns.map((turn) => (
                <TurnBlock key={turn.id} turn={turn} />
              ))}
            </div>
            {showWrapUp && !readOnly ? (
              <WrapUpCard
                onMarkDone={handleMarkDone}
                onDismiss={() => setWrapUpDismissed(true)}
              />
            ) : null}
          </div>
          {!readOnly ? (
            <div className="shrink-0 border-t border-border/70 bg-background">
              <div className="mx-auto w-full max-w-3xl">
                <TaskComposerPanel
                  awaitingInput={task.meta.status === "awaiting-input"}
                  onSend={handleSend}
                  initialRuntime={{
                    providerId: task.meta.providerId,
                    adapterType: task.meta.adapterType,
                    model: readRuntimeModel(task.meta.adapterConfig),
                    effort: readRuntimeEffort(task.meta.adapterConfig),
                  }}
                />
              </div>
            </div>
          ) : null}
          </>
          )}
        </TabsContent>

        <TabsContent
          value="artifacts"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-3xl">
              <ArtifactsList turns={task.turns} />
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="diff"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-3xl">
              {isDemo ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                  Diff view is only available for real tasks.
                </p>
              ) : (
                <DiffPanel taskId={taskId} cabinetPath={task.meta.cabinetPath} />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="logs"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-3xl">
              {isDemo ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                  Logs view is only available for real tasks.
                </p>
              ) : (
                <LogsPanel taskId={taskId} cabinetPath={task.meta.cabinetPath} />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TerminalPromptHeader({
  prompt,
  providerId,
  adapterType,
  status,
}: {
  prompt: string;
  providerId?: string;
  adapterType?: string;
  status: TaskStatus;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [prompt]);

  const statusTone =
    status === "running"
      ? "bg-emerald-500/20 text-emerald-300"
      : status === "awaiting-input"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-zinc-700/50 text-zinc-300";
  const statusLabel =
    status === "running"
      ? "PTY live"
      : status === "awaiting-input"
        ? "Awaiting input"
        : status === "idle"
          ? "Session ended"
          : "Failed";

  return (
    <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/90 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-emerald-400">
          <Terminal className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Prompt
            </span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                statusTone
              )}
            >
              {statusLabel}
            </span>
            {providerId && (
              <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                {providerId}
              </span>
            )}
            {adapterType && (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                PTY
              </span>
            )}
          </div>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-zinc-100">
            {prompt || "(no prompt)"}
          </pre>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          title={copied ? "Copied" : "Copy prompt"}
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
