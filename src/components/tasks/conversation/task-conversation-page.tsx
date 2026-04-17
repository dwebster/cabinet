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
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TurnBlock } from "./turn-block";
import { ArtifactsList } from "./artifacts-list";
import { TaskComposerPanel } from "./task-composer-panel";
import { MOCK_TASK } from "./mock-data";
import type { Task, TaskEvent, TaskStatus } from "@/types/tasks";
import { fetchTask, patchTask, postTurn } from "@/lib/agents/task-client";

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

const DEFAULT_CONTEXT_WINDOW = 200_000;

export function TaskConversationPage({ taskId }: { taskId: string }) {
  const isDemo = taskId === "demo";
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
    const url = `/api/tasks/${encodeURIComponent(taskId)}/events`;
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

  const lastTurn = task ? task.turns[task.turns.length - 1] : null;
  const showWrapUp =
    !!task &&
    !wrapUpDismissed &&
    task.meta.status === "idle" &&
    lastTurn?.role === "agent" &&
    !lastTurn.pending;

  const handleSend = useCallback(
    async (text: string) => {
      if (!task) return;
      setWrapUpDismissed(false);

      if (isDemo) {
        const nextTurn = task.turns.length + 1;
        const userTurn = {
          id: `t${nextTurn}u`,
          turn: nextTurn,
          role: "user" as const,
          ts: new Date().toISOString(),
          content: text,
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
        const result = await postTurn(taskId, { role: "user", content: text });
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
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
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
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-border/70 px-6 py-3">
        <Link
          href="/"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
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
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px]">
            <GitBranch className="size-3.5" />
            main
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px]">
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

        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl divide-y divide-border/40">
              {task.turns.map((turn) => (
                <TurnBlock key={turn.id} turn={turn} />
              ))}
            </div>
            {showWrapUp ? (
              <WrapUpCard
                onMarkDone={handleMarkDone}
                onDismiss={() => setWrapUpDismissed(true)}
              />
            ) : null}
          </ScrollArea>
          <div className="mx-auto w-full max-w-3xl">
            <TaskComposerPanel
              runtimeLabel={runtimeLabel}
              awaitingInput={task.meta.status === "awaiting-input"}
              onSend={handleSend}
            />
          </div>
        </TabsContent>

        <TabsContent value="artifacts" className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl">
            <ArtifactsList turns={task.turns} />
          </div>
        </TabsContent>

        <TabsContent value="diff" className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-6 py-12 text-center text-sm text-muted-foreground">
            Diff view — placeholder. Will show a unified diff of all file changes across the task.
          </div>
        </TabsContent>

        <TabsContent value="logs" className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-6 py-12 text-center text-sm text-muted-foreground">
            Logs view — placeholder. Will show raw adapter stdout/stderr per turn.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
