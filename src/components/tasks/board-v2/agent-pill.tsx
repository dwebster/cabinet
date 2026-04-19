"use client";

import { cn } from "@/lib/utils";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { resolveAgentIcon } from "@/lib/agents/icon-catalog";
import type { CabinetAgentSummary } from "@/types/cabinets";

type AgentRef = Pick<
  CabinetAgentSummary,
  "slug" | "displayName" | "name" | "iconKey" | "color"
>;

function resolveTint(agent: AgentRef | undefined, fallbackSlug: string) {
  if (agent?.color) return tintFromHex(agent.color);
  return getAgentColor(agent?.slug ?? fallbackSlug);
}

export function AgentPill({
  agent,
  slug,
  size = "md",
  className,
}: {
  agent: AgentRef | undefined;
  slug: string;
  size?: "md" | "sm";
  className?: string;
}) {
  const tint = resolveTint(agent, slug);
  const Icon = resolveAgentIcon(agent?.slug ?? slug, agent?.iconKey ?? null);
  const label = agent?.displayName ?? agent?.name ?? slug;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
        className
      )}
      style={{ backgroundColor: tint.bg, color: tint.text }}
    >
      <Icon className={size === "md" ? "size-3" : "size-2.5"} />
      {label}
    </span>
  );
}
