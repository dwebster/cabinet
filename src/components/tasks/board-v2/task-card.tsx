"use client";

import { HeartPulse, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { isLegacyAdapterType } from "@/lib/agents/adapters/legacy-ids";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { useProviderIcons } from "@/hooks/use-provider-icons";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { LaneKey } from "./lane-rules";
import { AgentPill } from "./agent-pill";
import { StatusIcon, deriveCardState } from "./status-icon";

function relTime(fromIso: string | undefined, now: number): string {
  if (!fromIso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TaskCard({
  task,
  lane,
  agent,
  isActive,
  now,
  onClick,
  density = "comfortable",
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  isActive: boolean;
  now: number;
  onClick: (e?: React.MouseEvent) => void;
  density?: "compact" | "comfortable";
}) {
  const state = deriveCardState(task, lane);
  const lastActivity = task.lastActivityAt ?? task.startedAt;
  const isTerminal = isLegacyAdapterType(task.adapterType);
  const groupSize = task.groupSize && task.groupSize > 1 ? task.groupSize : 0;

  const compact = density === "compact";
  const providerIcons = useProviderIcons();
  const providerIcon = task.providerId ? providerIcons.get(task.providerId) : null;
  const modelName =
    typeof task.adapterConfig?.model === "string" ? task.adapterConfig.model : undefined;
  const showModelRow = !!(providerIcon || modelName);
  return (
    <button
      type="button"
      onClick={(e) => onClick(e)}
      className={cn(
        "group relative w-full rounded-md border bg-card text-left transition-all",
        "hover:border-foreground/30 hover:shadow-sm",
        compact ? "px-2.5 py-2" : "p-3",
        isActive ? "border-foreground/50 shadow-sm" : "border-border/60",
        isTerminal &&
          "border-l-2 border-l-emerald-500/60 bg-[linear-gradient(to_right,rgba(16,185,129,0.035),transparent_30%)]"
      )}
    >
      <div className="flex items-center gap-2">
        <StatusIcon state={state} />
        <AgentPill agent={agent} slug={task.agentSlug ?? "general"} />
        {groupSize > 0 && (
          <span
            title={`${groupSize} heartbeat runs collapsed — showing the latest`}
            className="inline-flex items-center gap-0.5 rounded-full border border-pink-500/30 bg-pink-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-pink-600 dark:text-pink-400"
          >
            <HeartPulse className="size-2.5" />+{groupSize - 1}
          </span>
        )}
        {isTerminal && (
          <span
            title="Running in terminal (PTY) mode"
            className="ml-auto inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
          >
            <Terminal className="size-2.5" />
            PTY
          </span>
        )}
      </div>
      <p
        className={cn(
          "line-clamp-2 text-[13px] leading-snug text-foreground",
          compact ? "mt-1" : "mt-2"
        )}
      >
        {task.title}
      </p>
      {!compact && showModelRow && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          {providerIcon ? (
            <span
              className="inline-flex size-5 items-center justify-center rounded border border-border/60 bg-background/60"
              title={providerIcon.name}
            >
              <ProviderGlyph
                icon={providerIcon.icon}
                asset={providerIcon.iconAsset}
                className="size-4"
              />
            </span>
          ) : null}
          {modelName ? (
            <span className="truncate font-mono text-[10.5px] text-foreground/70">
              {modelName}
            </span>
          ) : null}
          <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
            {relTime(lastActivity, now)}
          </span>
        </div>
      )}
      {!compact && !showModelRow && (
        <div className="mt-2 flex items-center gap-2 text-[10.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <span>{relTime(lastActivity, now)}</span>
        </div>
      )}
    </button>
  );
}
