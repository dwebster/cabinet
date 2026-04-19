"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { resolveAgentIcon } from "@/lib/agents/icon-catalog";
import type { CabinetAgentSummary } from "@/types/cabinets";

/**
 * Horizontal chip row for filtering the board by agent. Client-side only
 * in Phase 1; the hook still fetches everything for the cabinet, we just
 * narrow what's shown.
 *
 * `null` = "All agents". Any slug = only that agent's tasks.
 */
export function FilterBar({
  agents,
  value,
  onChange,
}: {
  agents: CabinetAgentSummary[];
  value: string | null;
  onChange: (slug: string | null) => void;
}) {
  if (agents.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 px-4 py-2 text-[11px]">
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="size-3" />
        Filter
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "shrink-0 rounded-full border px-2.5 py-0.5 font-medium transition-colors",
          value === null
            ? "border-foreground bg-foreground text-background"
            : "border-border/60 text-muted-foreground hover:text-foreground"
        )}
      >
        All agents
      </button>
      {agents.map((agent) => {
        const active = value === agent.slug;
        const tint = agent.color ? tintFromHex(agent.color) : getAgentColor(agent.slug);
        const Icon = resolveAgentIcon(agent.slug, agent.iconKey ?? null);
        return (
          <button
            key={agent.scopedId}
            type="button"
            onClick={() => onChange(active ? null : agent.slug)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition-colors",
              active
                ? "border-foreground"
                : "border-transparent hover:border-border/60"
            )}
            style={
              active
                ? { backgroundColor: tint.bg, color: tint.text }
                : { backgroundColor: tint.bg, color: tint.text, opacity: 0.65 }
            }
            title={
              agent.active
                ? agent.displayName ?? agent.name
                : `${agent.displayName ?? agent.name} (paused)`
            }
          >
            <Icon className="size-3" />
            {agent.displayName ?? agent.name}
          </button>
        );
      })}
    </div>
  );
}
