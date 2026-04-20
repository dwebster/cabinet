"use client";

import { createElement } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { resolveAgentIcon } from "@/lib/agents/icon-catalog";
import { resolveAvatarUrl } from "@/lib/agents/avatar-catalog";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";

export interface AgentIdentityInput {
  slug: string;
  cabinetPath?: string;
  displayName?: string;
  iconKey?: string;
  color?: string;
  avatar?: string;
  avatarExt?: string;
}

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_MAP: Record<Size, { box: string; icon: string; px: number }> = {
  xs: { box: "h-4 w-4", icon: "h-2.5 w-2.5", px: 16 },
  sm: { box: "h-5 w-5", icon: "h-3 w-3",     px: 20 },
  md: { box: "h-7 w-7", icon: "h-4 w-4",     px: 28 },
  lg: { box: "h-10 w-10", icon: "h-5 w-5",   px: 40 },
};

export function AgentIdentity({
  agent,
  size = "sm",
  className,
}: {
  agent: AgentIdentityInput;
  size?: Size;
  className?: string;
}) {
  const dims = SIZE_MAP[size];
  const avatarUrl = resolveAvatarUrl(agent);

  if (avatarUrl) {
    return (
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted",
          dims.box,
          className
        )}
      >
        <Image
          src={avatarUrl}
          alt=""
          width={dims.px}
          height={dims.px}
          className="h-full w-full object-cover"
          unoptimized
        />
      </span>
    );
  }

  const iconComponent = resolveAgentIcon(agent.slug, agent.iconKey);
  const palette = agent.color ? tintFromHex(agent.color) : getAgentColor(agent.slug);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        dims.box,
        className
      )}
      style={{ backgroundColor: palette.bg, color: palette.text }}
    >
      {createElement(iconComponent, { className: dims.icon })}
    </span>
  );
}

export function getAgentDisplayName(
  agent: { name?: string; displayName?: string }
): string {
  return agent.displayName?.trim() || agent.name || "";
}
