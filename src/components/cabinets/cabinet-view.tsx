"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FolderTree,
  HeartPulse,
  Loader2,
  Network,
  Save,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SchedulePicker } from "@/components/mission-control/schedule-picker";
import { HeaderActions } from "@/components/layout/header-actions";
import { VersionHistory } from "@/components/editor/version-history";
import { CabinetSchedulerControls } from "@/components/cabinets/cabinet-scheduler-controls";
import { CabinetTaskComposer } from "@/components/cabinets/cabinet-task-composer";
import {
  NewRoutineDialog,
  type NewRoutineDialogAgent,
} from "@/components/agents/new-routine-dialog";
import type { JobConfig } from "@/types/jobs";
import { ActivityFeed } from "@/components/cabinets/activity-feed";
import { CABINET_VISIBILITY_OPTIONS } from "@/lib/cabinets/visibility";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";
import type { ConversationMeta } from "@/types/conversations";
import type {
  CabinetAgentSummary,
  CabinetOverview,
} from "@/types/cabinets";
import type { ScheduleEvent } from "@/lib/agents/cron-compute";
import { NextUpRuns } from "./next-up-runs";
import { OrgChartModal } from "./org-chart-modal";

export function CabinetView({ cabinetPath }: { cabinetPath: string }) {
  const [overview, setOverview] = useState<CabinetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [requestedAgent, setRequestedAgent] = useState<CabinetAgentSummary | null>(null);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [orgChartOpen, setOrgChartOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [routineDialog, setRoutineDialog] = useState<{
    agent: NewRoutineDialogAgent;
    existingJob?: Partial<JobConfig>;
    missedRun?: { scheduledAt: string };
  } | null>(null);
  const [heartbeatDialog, setHeartbeatDialog] = useState<{
    agentSlug: string;
    agentName: string;
    cabinetPath: string;
    heartbeat: string;
    active: boolean;
    missedRun?: { scheduledAt: string };
  } | null>(null);
  const [dialogRunning, setDialogRunning] = useState(false);
  const [dialogSaving, setDialogSaving] = useState(false);

  const setSection = useAppStore((state) => state.setSection);
  const cabinetVisibilityModes = useAppStore((state) => state.cabinetVisibilityModes);
  const setCabinetVisibilityMode = useAppStore((state) => state.setCabinetVisibilityMode);
  const cabinetVisibilityMode = cabinetVisibilityModes[cabinetPath] || "own";
  const selectPage = useTreeStore((state) => state.selectPage);
  const loadPage = useEditorStore((state) => state.loadPage);

  const openCabinet = useCallback(
    (path: string) => {
      selectPage(path);
      void loadPage(path);
      setSection({ type: "cabinet", cabinetPath: path });
    },
    [loadPage, selectPage, setSection]
  );

  const openCabinetAgent = useCallback(
    (agent: CabinetAgentSummary) => {
      const targetCabinetPath = agent.cabinetPath || cabinetPath;
      setSection({
        type: "agent",
        slug: agent.slug,
        cabinetPath: targetCabinetPath,
        agentScopedId: agent.scopedId || `${targetCabinetPath}::agent::${agent.slug}`,
      });
    },
    [cabinetPath, setSection]
  );

  const openCabinetAgentsWorkspace = useCallback(() => {
    setSection({ type: "agents", cabinetPath });
  }, [cabinetPath, setSection]);

  const openConversation = useCallback(
    (conversation: ConversationMeta) => {
      const targetCabinetPath = conversation.cabinetPath || cabinetPath;
      setSection({
        type: "agent",
        slug: conversation.agentSlug,
        cabinetPath: targetCabinetPath,
        agentScopedId: `${targetCabinetPath}::agent::${conversation.agentSlug}`,
        conversationId: conversation.id,
      });
    },
    [cabinetPath, setSection]
  );

  const primeTaskComposer = useCallback((agent: CabinetAgentSummary) => {
    setRequestedAgent(agent);
    setComposerFocusRequest((current) => current + 1);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ path: cabinetPath, visibility: cabinetVisibilityMode });
      const response = await fetch(`/api/cabinets/overview?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to load cabinet overview");
      }
      const data = (await response.json()) as CabinetOverview;
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [cabinetPath, cabinetVisibilityMode]);

  useEffect(() => {
    void loadOverview();
    const interval = window.setInterval(() => void loadOverview(), 15000);
    const onFocus = () => void loadOverview();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadOverview]);

  // Tick `now` every minute so Next-up labels stay fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/agents/config")
      .then((response) => response.json())
      .then((data) => {
        const nextName = [
          data?.person?.name,
          data?.user?.name,
          data?.owner?.name,
          data?.company?.name,
          typeof data?.company === "string" ? data.company : null,
        ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
        if (nextName) setDisplayName(nextName);
      })
      .catch(() => {});
  }, []);

  const cabinetName =
    overview?.cabinet.name ||
    cabinetPath.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ||
    "Cabinet";
  const ownAgents = useMemo(
    () => (overview?.agents || []).filter((a) => a.cabinetDepth === 0),
    [overview?.agents]
  );
  const boardName = displayName || "there";
  const agentCount = overview?.agents.length ?? 0;
  const jobCount = overview?.jobs.length ?? 0;
  const heartbeatCount = useMemo(
    () => (overview?.agents || []).filter((a) => !!a.heartbeat).length,
    [overview?.agents]
  );

  function handleScheduleEventClick(event: ScheduleEvent) {
    if (event.sourceType === "job" && event.jobRef && event.agentRef) {
      setRoutineDialog({
        agent: {
          slug: event.agentRef.slug,
          name: event.agentRef.name,
          role: event.agentRef.role,
          cabinetPath: event.agentRef.cabinetPath || cabinetPath,
        },
        existingJob: {
          id: event.jobRef.id,
          name: event.jobRef.name,
          schedule: event.jobRef.schedule,
          prompt: event.jobRef.prompt || "",
          enabled: event.jobRef.enabled,
        },
      });
    } else if (event.sourceType === "heartbeat" && event.agentRef) {
      setHeartbeatDialog({
        agentSlug: event.agentRef.slug,
        agentName: event.agentRef.name,
        cabinetPath: event.agentRef.cabinetPath || cabinetPath,
        heartbeat: event.agentRef.heartbeat || "0 9 * * 1-5",
        active: event.agentRef.active,
      });
    }
  }

  async function runDialogHeartbeat() {
    if (!heartbeatDialog) return;
    setDialogRunning(true);
    try {
      const res = await fetch(`/api/agents/personas/${heartbeatDialog.agentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", cabinetPath: heartbeatDialog.cabinetPath }),
      });
      if (res.ok) {
        const data = await res.json();
        setHeartbeatDialog(null);
        if (data.sessionId) {
          setSection({
            type: "agent",
            slug: heartbeatDialog.agentSlug,
            cabinetPath: heartbeatDialog.cabinetPath,
            agentScopedId: `${heartbeatDialog.cabinetPath}::agent::${heartbeatDialog.agentSlug}`,
            conversationId: data.sessionId,
          });
        }
      }
    } finally {
      setDialogRunning(false);
    }
  }

  async function saveDialogHeartbeat() {
    if (!heartbeatDialog) return;
    setDialogSaving(true);
    try {
      await fetch(`/api/agents/personas/${heartbeatDialog.agentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heartbeat: heartbeatDialog.heartbeat,
          active: heartbeatDialog.active,
          cabinetPath: heartbeatDialog.cabinetPath,
        }),
      });
      setHeartbeatDialog(null);
      void loadOverview();
    } finally {
      setDialogSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Header row ── */}
        <header className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-background/95 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
              {cabinetName}
            </h1>
            {loading && !overview ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CountPill label="agents" value={agentCount} />
            <CountPill label="jobs" value={jobCount} />
            <CountPill label="heartbeats" value={heartbeatCount} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-full border border-border/60 p-0.5">
              {CABINET_VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setCabinetVisibilityMode(cabinetPath, option.value)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                    cabinetVisibilityMode === option.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={option.label}
                >
                  {option.shortLabel}
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => setOrgChartOpen(true)}
              disabled={!overview || agentCount === 0}
            >
              <Network className="size-3.5" />
              Org chart
            </Button>

            <CabinetSchedulerControls
              cabinetPath={cabinetPath}
              ownAgents={ownAgents}
              onRefresh={() => void loadOverview()}
            />
            <VersionHistory />
            <HeaderActions />
          </div>
        </header>

        {/* ── Scrollable body ── */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            {error ? (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            ) : null}

            {/* Composer hero */}
            <section className="mb-8">
              <CabinetTaskComposer
                cabinetPath={cabinetPath}
                agents={overview?.agents || []}
                displayName={boardName}
                requestedAgent={requestedAgent}
                focusRequest={composerFocusRequest}
                onNavigate={(agentSlug, agentCabinetPath, conversationId) =>
                  setSection({
                    type: "agent",
                    slug: agentSlug,
                    cabinetPath: agentCabinetPath,
                    agentScopedId: `${agentCabinetPath}::agent::${agentSlug}`,
                    conversationId,
                  })
                }
              />
            </section>

            {/* Activity + Next-up runs */}
            <section className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ActivityFeed
                  cabinetPath={cabinetPath}
                  visibilityMode={cabinetVisibilityMode}
                  agents={overview?.agents || []}
                  onOpen={openConversation}
                  onOpenWorkspace={openCabinetAgentsWorkspace}
                />
              </div>
              <div>
                <NextUpRuns
                  agents={overview?.agents || []}
                  jobs={overview?.jobs || []}
                  now={now}
                  onEventClick={handleScheduleEventClick}
                />
                {(overview?.children?.length ?? 0) > 0 && (
                  <div className="mt-8 space-y-2">
                    <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
                      Child cabinets
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {overview!.children.map((child) => (
                        <button
                          key={child.path}
                          type="button"
                          onClick={() => openCabinet(child.path)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/60"
                          title={child.name}
                        >
                          <FolderTree className="size-3 shrink-0 text-muted-foreground" />
                          <span className="max-w-[160px] truncate">{child.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

      {/* ── Org chart modal ── */}
      <OrgChartModal
        open={orgChartOpen}
        onOpenChange={setOrgChartOpen}
        cabinetName={cabinetName}
        agents={overview?.agents || []}
        jobs={overview?.jobs || []}
        childCabinets={overview?.children || []}
        onAgentClick={(agent) => {
          setOrgChartOpen(false);
          openCabinetAgent(agent);
        }}
        onAgentSend={(agent) => {
          setOrgChartOpen(false);
          primeTaskComposer(agent);
        }}
        onChildCabinetClick={(child) => {
          setOrgChartOpen(false);
          openCabinet(child.path);
        }}
      />

      {/* ── Job dialog ── */}
      <NewRoutineDialog
        open={routineDialog !== null}
        onOpenChange={(next) => {
          if (!next) setRoutineDialog(null);
        }}
        agent={routineDialog?.agent ?? { slug: "", name: "" }}
        existingJob={routineDialog?.existingJob}
        missedRun={routineDialog?.missedRun}
        onSaved={() => {
          setRoutineDialog(null);
          void loadOverview();
        }}
        onDeleted={() => {
          setRoutineDialog(null);
          void loadOverview();
        }}
      />

      {/* ── Heartbeat dialog ── */}
      {heartbeatDialog ? (
        <Dialog open onOpenChange={(open) => { if (!open) setHeartbeatDialog(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3 pr-10">
                <DialogTitle className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-pink-400" />
                  Heartbeat
                  <span className="text-[11px] font-normal text-muted-foreground">· {heartbeatDialog.agentName}</span>
                </DialogTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => void runDialogHeartbeat()}
                  disabled={dialogRunning}
                >
                  {dialogRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Run now
                </Button>
              </div>
            </DialogHeader>
            <div className="space-y-3">
              {heartbeatDialog.missedRun && <MissedRunBanner scheduledAt={heartbeatDialog.missedRun.scheduledAt} />}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Schedule</span>
                <SchedulePicker
                  value={heartbeatDialog.heartbeat}
                  onChange={(cron) =>
                    setHeartbeatDialog((prev) => (prev ? { ...prev, heartbeat: cron } : prev))
                  }
                />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={heartbeatDialog.active}
                    onChange={(e) =>
                      setHeartbeatDialog((prev) =>
                        prev ? { ...prev, active: e.target.checked } : prev
                      )
                    }
                    className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-sm border border-border bg-background transition-colors checked:border-primary checked:bg-primary focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1"
                  />
                  Active
                </label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setHeartbeatDialog(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => void saveDialogHeartbeat()}
                    disabled={dialogSaving}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {dialogSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px]">
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function MissedRunBanner({ scheduledAt }: { scheduledAt: string }) {
  const when = new Date(scheduledAt);
  const label = `${when.toLocaleDateString()} ${when.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium">This run did not execute at {label}.</p>
      </div>
    </div>
  );
}
