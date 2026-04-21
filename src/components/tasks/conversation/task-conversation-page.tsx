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
  ExternalLink,
  GitBranch,
  Link2,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Sparkles,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { isLegacyAdapterType } from "@/lib/agents/adapters/legacy-ids";
import { WebTerminal } from "@/components/terminal/web-terminal";
import { ClaudeTranscriptView } from "@/components/tasks/conversation/claude-transcript-view";
import { ConversationResultView } from "@/components/agents/conversation-result-view";
import {
  deleteConversation,
  restartConversation,
  stopConversation,
} from "@/components/tasks/board-v2/board-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openArtifactPath } from "@/lib/navigation/open-artifact-path";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TurnBlock, type TurnBlockAgent } from "./turn-block";
import { useUserProfile } from "@/hooks/use-user-profile";
import { PendingActionsPanel } from "@/components/agents/pending-actions-panel";
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

/**
 * Primary status-driven action pill rendered in the task header. The user
 * wanted the small ghost "Mark done" control to be bigger and colored — this
 * component maps status → tone (emerald for done, rose for failed, sky for
 * running, amber for awaiting-input, default otherwise) and swaps the label
 * between "Mark done", "Done", "Retry", "Running…", and "Waiting".
 *
 * Failed → "Retry" calls onRetry (restart), so the user has a visible recovery
 * path. Running/awaiting-input are disabled since "Stop" lives next to this
 * button and takes precedence.
 */
function StatusActionButton({
  status,
  busy,
  onMarkDone,
  onRetry,
}: {
  status: TaskStatus;
  busy: boolean;
  onMarkDone: () => void;
  onRetry: () => void;
}) {
  if (status === "done") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 text-[12px] font-semibold text-emerald-300">
        <CheckCircle2 className="size-4" />
        Done
      </span>
    );
  }

  if (status === "failed") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onRetry}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/15 px-3 text-[12px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 hover:text-rose-200 disabled:opacity-50"
        title="Restart this task from the original prompt"
      >
        <RotateCcw className="size-4" />
        Retry
      </button>
    );
  }

  if (status === "running") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/15 px-3 text-[12px] font-semibold text-sky-300">
        <Loader2 className="size-4 animate-spin" />
        Running
      </span>
    );
  }

  if (status === "awaiting-input") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 text-[12px] font-semibold text-amber-300">
        <Pause className="size-4" />
        Waiting
      </span>
    );
  }

  if (status === "archived") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-3 text-[12px] font-semibold text-zinc-400">
        <Archive className="size-4" />
        Archived
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onMarkDone}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 hover:text-emerald-200 disabled:opacity-50"
      title="Mark this task as done"
    >
      <Check className="size-4" />
      Mark done
    </button>
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
  /**
   * Section the "Back" banner should restore when the user opens a KB
   * artifact from this conversation. When omitted, artifact clicks fall
   * back to whatever the app's current section is at click time — which
   * is correct for standalone full-panel mounts (section === "task") but
   * wrong for compact embeds inside a board/activity surface where the
   * outer section is "tasks"/"cabinet"/etc. Compact-embed callers should
   * pass `{type:"task", taskId, cabinetPath}` so back jumps the user
   * into the full task view rather than the outer list.
   */
  returnContext?: import("@/stores/app-store").SelectedSection;
}

export function TaskConversationPage({
  taskId,
  variant = "full",
  readOnly = false,
  returnContext,
}: TaskConversationPageProps) {
  const isDemo = taskId === "demo";
  const isCompact = variant === "compact";
  const [task, setTask] = useState<Task | null>(isDemo ? MOCK_TASK : null);
  const [turnAgent, setTurnAgent] = useState<TurnBlockAgent | null>(null);
  const userState = useUserProfile();
  const turnUser =
    userState.status === "ready" ? userState.data.profile : null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [wrapUpDismissed, setWrapUpDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Terminal-mode viewer tabs: Terminal (xterm stream) vs Details
  // (structured prompt/result/artifacts cards via ConversationResultView).
  // Detail is lazy-fetched on first Details click and cached so toggling
  // doesn't re-request.
  const [terminalTab, setTerminalTab] = useState<
    "terminal" | "transcript" | "details"
  >("terminal");
  const [detail, setDetail] = useState<import("@/types/conversations").ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!taskId || isDemo) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const params = new URLSearchParams();
      const cp = task?.meta.cabinetPath;
      if (cp) params.set("cabinetPath", cp);
      const qs = params.toString();
      const res = await fetch(
        `/api/agents/conversations/${encodeURIComponent(taskId)}${qs ? `?${qs}` : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as
        | import("@/types/conversations").ConversationDetail
        | { detail?: import("@/types/conversations").ConversationDetail };
      // The endpoint returns ConversationDetail directly; some wrappers also
      // nest it under `detail`. Accept either.
      const next =
        body && typeof body === "object" && "meta" in body
          ? (body as import("@/types/conversations").ConversationDetail)
          : ((body as { detail?: import("@/types/conversations").ConversationDetail }).detail ?? null);
      setDetail(next);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  }, [taskId, isDemo, task?.meta.cabinetPath]);

  // Fetch the detail on first switch to Details tab, cache on subsequent
  // toggles. Refetch when the underlying task updates (e.g. status flip to
  // idle after PTY exit) so the Details tab reflects fresh artifacts.
  useEffect(() => {
    if (terminalTab !== "details") return;
    if (detailLoading) return;
    // Refetch if we haven't loaded yet, or the task has changed status since.
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalTab, task?.meta.status, task?.meta.lastActivityAt]);

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

  // Fetch the agent's identity (avatar/icon/color/displayName) so turn blocks
  // can render the real avatar instead of a generic sparkles glyph.
  useEffect(() => {
    const slug = task?.meta.agentSlug;
    if (!slug) {
      setTurnAgent(null);
      return;
    }
    const cabinetPath = task?.meta.cabinetPath;
    const qs = cabinetPath ? `?cabinetPath=${encodeURIComponent(cabinetPath)}` : "";
    let cancelled = false;
    fetch(`/api/agents/personas/${encodeURIComponent(slug)}${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { persona?: { slug: string; name?: string; displayName?: string; iconKey?: string; color?: string; avatar?: string; avatarExt?: string; cabinetPath?: string } } | null) => {
        if (cancelled || !data?.persona) return;
        const p = data.persona;
        setTurnAgent({
          slug: p.slug,
          cabinetPath: p.cabinetPath ?? cabinetPath,
          name: p.name,
          displayName: p.displayName,
          iconKey: p.iconKey,
          color: p.color,
          avatar: p.avatar,
          avatarExt: p.avatarExt,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [task?.meta.agentSlug, task?.meta.cabinetPath]);

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

  // Scroll chat to bottom on initial load and whenever turns arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [task?.turns.length]);

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

  const handleCopyLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const cp = task?.meta.cabinetPath;
    const hash =
      cp && cp !== "."
        ? `#/cabinet/${encodeURIComponent(cp)}/tasks/${encodeURIComponent(taskId)}`
        : `#/ops/tasks/${encodeURIComponent(taskId)}`;
    try {
      await navigator.clipboard.writeText(`${base}${hash}`);
    } catch {
      // clipboard blocked; silently ignore.
    }
  }, [task?.meta.cabinetPath, taskId]);

  const handleOpenTranscriptExternal = useCallback(() => {
    if (typeof window === "undefined") return;
    const cp = task?.meta.cabinetPath;
    const qs = cp ? `?cabinetPath=${encodeURIComponent(cp)}` : "";
    window.open(
      `/agents/conversations/${encodeURIComponent(taskId)}${qs}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [task?.meta.cabinetPath, taskId]);

  const handleRestart = useCallback(async () => {
    if (!task || isDemo) return;
    setBusy(true);
    try {
      await restartConversation(taskId, task.meta.cabinetPath);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to restart");
    } finally {
      setBusy(false);
    }
  }, [task, isDemo, taskId]);

  const handleDelete = useCallback(async () => {
    if (!task || isDemo) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm("Delete this task? This cannot be undone.");
      if (!ok) return;
    }
    setBusy(true);
    try {
      await deleteConversation(taskId, task.meta.cabinetPath);
      if (typeof window !== "undefined") {
        window.location.hash = "#/";
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }, [task, isDemo, taskId]);

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
  if (isTerminalMode) {
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

    const showDetails = terminalTab === "details";
    const showTranscript = terminalTab === "transcript";
    const isClaudeProvider = task.meta.providerId === "claude-code";

    return (
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        {/* Terminal | Transcript (claude only) | Details tab row. Same
            rounded-t merge pattern as the runtime picker — active tab bg
            matches the panel below so the seam disappears. */}
        <div className="shrink-0 bg-zinc-950 px-2 pt-2">
          <div
            role="tablist"
            aria-label="Task view"
            className={cn(
              "relative z-10 grid gap-1 -mb-px text-[12px] font-medium",
              isClaudeProvider ? "grid-cols-3" : "grid-cols-2"
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={terminalTab === "terminal"}
              onClick={() => setTerminalTab("terminal")}
              className={cn(
                "relative inline-flex h-9 items-center justify-center gap-2 rounded-t-md border border-b-0 px-4 transition-colors",
                terminalTab === "terminal"
                  ? "border-zinc-800 bg-zinc-900 text-zinc-100"
                  : "border-transparent bg-zinc-900/40 text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
              )}
            >
              <Terminal className="size-3.5" />
              <span>Terminal</span>
            </button>
            {isClaudeProvider ? (
              <button
                type="button"
                role="tab"
                aria-selected={showTranscript}
                onClick={() => setTerminalTab("transcript")}
                className={cn(
                  "relative inline-flex h-9 items-center justify-center gap-2 rounded-t-md border border-b-0 px-4 transition-colors",
                  showTranscript
                    ? "border-zinc-800 bg-background text-foreground"
                    : "border-transparent bg-zinc-900/40 text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
                )}
                title="Claude Code native session JSONL"
              >
                <ScrollText className="size-3.5" />
                <span>Transcript</span>
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={showDetails}
              onClick={() => setTerminalTab("details")}
              className={cn(
                "relative inline-flex h-9 items-center justify-center gap-2 rounded-t-md border border-b-0 px-4 transition-colors",
                showDetails
                  ? "border-zinc-800 bg-background text-foreground"
                  : "border-transparent bg-zinc-900/40 text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
              )}
            >
              <Sparkles className="size-3.5" />
              <span>Details</span>
              {detail?.artifacts?.length ? (
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-px text-[9.5px] font-semibold text-emerald-300">
                  {detail.artifacts.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {showTranscript ? (
          <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 bg-muted/30 px-3">
              <Link
                href="/"
                className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Back"
              >
                <ArrowLeft className="size-3.5" />
              </Link>
              <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {task.meta.title}
              </h1>
              <span
                className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                title="Reads ~/.claude/projects/<slug>/<session>.jsonl"
              >
                claude-code
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ClaudeTranscriptView
                taskId={taskId}
                cabinetPath={task.meta.cabinetPath}
                statusKey={`${task.meta.status}:${task.meta.lastActivityAt ?? ""}`}
              />
            </div>
          </div>
        ) : showDetails ? (
          <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 bg-muted/30 px-3">
              <Link
                href="/"
                className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Back"
              >
                <ArrowLeft className="size-3.5" />
              </Link>
              <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {task.meta.title}
              </h1>
              {task.meta.providerId && (
                <span
                  className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  title={`Provider: ${task.meta.providerId}`}
                >
                  {task.meta.providerId}
                </span>
              )}
              <StatusActionButton
                status={task.meta.status}
                busy={busy}
                onMarkDone={handleMarkDone}
                onRetry={handleRestart}
              />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {detailLoading && !detail ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading details…
                </div>
              ) : detailError && !detail ? (
                <div className="mx-auto mt-10 max-w-md rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[12.5px] text-destructive">
                  Failed to load details: {detailError}.{" "}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => void loadDetail()}
                  >
                    Retry
                  </button>
                </div>
              ) : detail ? (
                <ConversationResultView
                  detail={detail}
                  onOpenArtifact={(artifactPath) => {
                    void openArtifactPath(
                      artifactPath,
                      task.meta.cabinetPath
                        ? { type: "page", cabinetPath: task.meta.cabinetPath }
                        : { type: "page" }
                    );
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No details yet.
                </div>
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Thin top strip */}
        <header className="flex h-10 shrink-0 items-center gap-2 border-t border-zinc-800 border-b border-b-zinc-800 bg-zinc-900 px-3">
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
          <StatusActionButton
            status={task.meta.status}
            busy={busy}
            onMarkDone={handleMarkDone}
            onRetry={handleRestart}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex size-9 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              title="More actions"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => void handleCopyLink()}>
                <Link2 className="mr-2 size-3.5" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenTranscriptExternal}>
                <ExternalLink className="mr-2 size-3.5" />
                Open transcript
              </DropdownMenuItem>
              {task.meta.status !== "running" && !isDemo ? (
                <DropdownMenuItem onClick={() => void handleRestart()}>
                  <RotateCcw className="mr-2 size-3.5" />
                  Restart
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleDelete()}
                disabled={isDemo || busy}
                className="text-rose-400 focus:bg-rose-500/10 focus:text-rose-300"
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Terminal fills the rest of the viewport. The terminal IS the
            composer — the CLI handles input/output directly, so we don't
            render a second composer card beneath it. Task only finalizes
            when the user exits the CLI themselves (Ctrl-D / /exit). */}
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
        </>
        )}
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
          <StatusActionButton
            status={task.meta.status}
            busy={busy}
            onMarkDone={handleMarkDone}
            onRetry={handleRestart}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="More actions"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => void handleCopyLink()}>
                <Link2 className="mr-2 size-3.5" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenTranscriptExternal}>
                <ExternalLink className="mr-2 size-3.5" />
                Open transcript
              </DropdownMenuItem>
              {task.meta.status !== "running" && !isDemo ? (
                <DropdownMenuItem onClick={() => void handleRestart()}>
                  <RotateCcw className="mr-2 size-3.5" />
                  Restart
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleDelete()}
                disabled={isDemo || busy}
                className="text-rose-500 focus:bg-rose-500/10 focus:text-rose-500"
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto">
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
                <TurnBlock
                  key={turn.id}
                  turn={turn}
                  agent={turnAgent}
                  user={turnUser}
                  returnContext={returnContext}
                />
              ))}
            </div>
            {(task.meta.pendingActions?.length || task.meta.dispatchedActions?.length) ? (
              <div className="mx-auto max-w-3xl px-1 pt-2">
                <PendingActionsPanel
                  conversationId={task.meta.id}
                  cabinetPath={task.meta.cabinetPath}
                  pending={task.meta.pendingActions || []}
                  dispatched={task.meta.dispatchedActions}
                  onRefresh={async () => {
                    try {
                      const fresh = await fetchTask(taskId, task.meta.cabinetPath);
                      setTask(fresh);
                    } catch {
                      // Stale state is fine — SSE will eventually reconcile.
                    }
                  }}
                />
              </div>
            ) : null}
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
              <ArtifactsList turns={task.turns} returnContext={returnContext} />
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
