"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Loader2,
  Rocket,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Star,
  Terminal,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { HomeBlueprintBackground } from "@/components/onboarding/home-blueprint-background";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { RuntimeSelectionBanner } from "@/components/composer/task-runtime-picker";
import type { ProviderInfo } from "@/types/agents";
import type { RegistryTemplate } from "@/lib/registry/registry-manifest";
import { RegistryBrowser } from "@/components/registry/registry-browser";
import {
  ROOMS,
  ROOM_TYPES,
  STARTER_TEAMS,
  type RoomType,
  type StarterTeam,
} from "@/lib/onboarding/rooms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getModelEffortLevels,
  getSuggestedProviderEffort,
  resolveProviderEffort,
  resolveProviderModel,
} from "@/lib/agents/runtime-options";

type OnboardingVerifyStatus =
  | "pass"
  | "not_installed"
  | "auth_required"
  | "payment_required"
  | "quota_exceeded"
  | "other_error";

interface OnboardingVerifyResult {
  status: OnboardingVerifyStatus;
  failedStepTitle: string;
  command: string;
  exitCode: number | null;
  signal: string | null;
  output: string;
  stderr: string;
  durationMs: number;
  hint?: string;
}

type OnboardingVerifyState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: OnboardingVerifyResult }
  | { phase: "error"; message: string };

const ONBOARDING_VERIFY_META: Record<OnboardingVerifyStatus, { label: string; color: string; bg: string }> = {
  pass: { label: "Passed", color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  not_installed: { label: "Not installed", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  auth_required: { label: "Auth required", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  payment_required: { label: "Payment required", color: "#e11d48", bg: "rgba(225,29,72,0.12)" },
  quota_exceeded: { label: "Quota / rate limit", color: "#ea580c", bg: "rgba(234,88,12,0.12)" },
  other_error: { label: "Error", color: "#e11d48", bg: "rgba(225,29,72,0.1)" },
};

interface OnboardingAnswers {
  name: string;
  role: string;
  homeName: string;
  roomType: RoomType;
  workspaceName: string;
  description: string;
  teamSize: string;
  priority: string;
}

interface SuggestedAgent {
  slug: string;
  name: string;
  emoji: string;
  role: string;
  checked: boolean;
}

interface CommunityCard {
  title: string;
  description: string;
  cta: string;
  href?: string;
  icon: ReactNode;
  iconClassName: string;
}

interface CommunityStepConfig {
  eyebrow: string;
  title: string;
  description: string;
  aside?: string;
  cards: CommunityCard[];
  nextLabel?: string;
}

const DISCORD_SUPPORT_URL = "https://discord.gg/hJa5TRTbTH";
const GITHUB_REPO_URL = "https://github.com/hilash/cabinet";
const GITHUB_STATS_URL = "/api/github/repo";
const GITHUB_STARS_FALLBACK = 393;
const CABINET_CLOUD_URL = "https://runcabinet.com/waitlist";
const TEAM_SIZES = ["Just me", "2-5", "5-20", "20+"];
const HOUSEHOLD_SIZES = ["Just me", "Couple", "3-4", "5+"];

// Step indices after the compress pass:
// 0 intro · 1 welcome-home · 2 room-setup (pick + name + describe) ·
// 3 team · 4 provider · 5 github · 6 discord · 7 cloud · 8 launch
const COMMUNITY_START_STEP = 5;
const COMMUNITY_END_STEP = 7;
const STEP_COUNT = 9;
const STEP_WELCOME_HOME = 1;
const STEP_ROOM_SETUP = 2;
const STEP_TEAM = 3;
const STEP_PROVIDER = 4;

/* ─── Colors from runcabinet.com ─── */
const WEB = {
  bg: "#FAF6F1",
  bgWarm: "#F3EDE4",
  bgCard: "#FFFFFF",
  text: "#3B2F2F",
  textSecondary: "#6B5B4F",
  textTertiary: "#A89888",
  accent: "#8B5E3C",
  accentWarm: "#7A4F30",
  accentBg: "#F5E6D3",
  border: "#E8DDD0",
  borderLight: "#F0E8DD",
  borderDark: "#D4C4B0",
} as const;

function DiscordIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M20.32 4.37a16.4 16.4 0 0 0-4.1-1.28.06.06 0 0 0-.07.03c-.18.32-.38.73-.52 1.06a15.16 15.16 0 0 0-4.56 0c-.15-.34-.35-.74-.53-1.06a.06.06 0 0 0-.07-.03c-1.43.24-2.8.68-4.1 1.28a.05.05 0 0 0-.02.02C3.77 8.17 3.12 11.87 3.44 15.53a.06.06 0 0 0 .02.04 16.52 16.52 0 0 0 5.03 2.54.06.06 0 0 0 .07-.02c.39-.54.74-1.12 1.04-1.73a.06.06 0 0 0-.03-.08 10.73 10.73 0 0 1-1.6-.77.06.06 0 0 1-.01-.1l.32-.24a.06.06 0 0 1 .06-.01c3.35 1.53 6.98 1.53 10.29 0a.06.06 0 0 1 .06 0c.1.08.21.16.32.24a.06.06 0 0 1-.01.1c-.51.3-1.05.56-1.6.77a.06.06 0 0 0-.03.08c.3.61.65 1.19 1.04 1.73a.06.06 0 0 0 .07.02 16.42 16.42 0 0 0 5.03-2.54.06.06 0 0 0 .02-.04c.38-4.23-.64-7.9-2.89-11.14a.04.04 0 0 0-.02-.02ZM9.68 13.3c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c.99 0 1.79.9 1.78 2 0 1.1-.8 2-1.78 2Zm4.64 0c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c.99 0 1.79.9 1.78 2 0 1.1-.79 2-1.78 2Z" />
    </svg>
  );
}

function formatGithubStars(stars: number) {
  return new Intl.NumberFormat("en-US").format(stars);
}

function CommunityCardTile({ card }: { card: CommunityCard }) {
  const content = (
    <>
      <div
        className="flex size-10 items-center justify-center rounded-xl border"
        style={{
          borderColor: WEB.borderLight,
          background: WEB.accentBg,
          color: WEB.accent,
        }}
      >
        {card.icon}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <p className="text-sm font-semibold" style={{ color: WEB.text }}>
          {card.title}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          {card.description}
        </p>
      </div>
    </>
  );

  if (!card.href) {
    return (
      <div
        className="rounded-xl p-4"
        style={{
          border: `1px solid ${WEB.border}`,
          background: WEB.bgCard,
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <a
      href={card.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded-xl p-4 transition-all hover:-translate-y-0.5"
      style={{
        border: `1px solid ${WEB.border}`,
        background: WEB.bgCard,
      }}
    >
      {content}
      <div
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium"
        style={{ color: WEB.accent }}
      >
        <span>{card.cta}</span>
        <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
    </a>
  );
}

// Agent pre-check + mandatory-lock logic is now room-aware — see getKeywordChecks
// and getAlwaysChecked below. The old KEYWORD_CHECKS / ALWAYS_CHECKED constants
// were per-room-type "office" defaults.

function getKeywordChecksForRoom(roomType: RoomType): [RegExp, string[]][] {
  return ROOMS[roomType].keywordMap;
}

function getAlwaysCheckedForRoom(roomType: RoomType): Set<string> {
  return new Set(ROOMS[roomType].mandatoryAgents);
}

// Starter teams are now defined in src/lib/onboarding/rooms.ts (STARTER_TEAMS)
// with a `rooms` field so the carousel can filter per room type.
type PreMadeTeam = StarterTeam;

const TEAM_DOMAIN_COLORS: Record<string, { bg: string; text: string }> = {
  Marketing: { bg: "#EDE7F6", text: "#6B4FA0" },
  Sales: { bg: "#FCE4EC", text: "#B0475A" },
  Media: { bg: "#E8EAF6", text: "#4A5899" },
  "E-commerce": { bg: "#E0F2F1", text: "#3A7A6D" },
  Content: { bg: "#FFF8E1", text: "#8D7039" },
  Services: { bg: "#E3F2FD", text: "#4A7FB5" },
  PKM: { bg: "#E1F1FF", text: "#3F6DB5" },
  Writing: { bg: "#FFF0F5", text: "#9B4B6B" },
  Admin: { bg: "#F1F1EC", text: "#6F6F57" },
  Research: { bg: "#E8F5E9", text: "#3F7B44" },
  Teaching: { bg: "#FFF4E0", text: "#9C6B2A" },
  Household: { bg: "#FBEFE1", text: "#8C5E3A" },
  Kids: { bg: "#E8F9F5", text: "#3A8879" },
};

function TerminalCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 mt-1.5 font-mono text-[12px]"
      style={{ background: "#1e1e1e", color: "#d4d4d4" }}
    >
      <span style={{ color: "#6A9955" }}>$</span>
      <span className="flex-1 select-all">{command}</span>
      <button
        onClick={copy}
        className="shrink-0 p-1 rounded transition-colors hover:bg-white/10"
        title="Copy to clipboard"
      >
        {copied ? (
          <ClipboardCheck className="size-3.5" style={{ color: "#6A9955" }} />
        ) : (
          <Copy className="size-3.5" style={{ color: "#808080" }} />
        )}
      </button>
    </div>
  );
}

function TeamCarousel({
  templates,
  roomType,
  onSelect,
}: {
  templates: RegistryTemplate[];
  roomType: RoomType;
  onSelect: (t: RegistryTemplate) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Use real templates if loaded, otherwise fall back to room-filtered starter teams.
  const fallbackTeams = STARTER_TEAMS.filter((t) => t.rooms.includes(roomType));
  const items: (RegistryTemplate | PreMadeTeam)[] =
    templates.length > 0 ? templates : fallbackTeams;
  const isReal = templates.length > 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let animationId: number;
    let position = 0;

    const animate = () => {
      if (!isPaused) {
        position += 1.2;
        const halfWidth = el.scrollWidth / 2;
        if (position >= halfWidth) position = 0;
        el.style.transform = `translateX(-${position}px)`;
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isPaused]);

  const doubled = [...items, ...items];

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div ref={scrollRef} className="flex gap-2 will-change-transform">
        {doubled.map((item, i) => {
          const domain = "domain" in item ? item.domain : "";
          const agentCount = "agentCount" in item ? item.agentCount : ("agents" in item ? (item as PreMadeTeam).agents : 0);
          const colors = TEAM_DOMAIN_COLORS[domain] || { bg: WEB.accentBg, text: WEB.accent };
          return (
            <button
              key={`${item.name}-${i}`}
              className="flex-shrink-0 w-44 rounded-lg p-3 flex flex-col text-left transition-all hover:-translate-y-0.5"
              style={{
                border: `1px solid ${WEB.border}`,
                background: WEB.bgCard,
                height: 88,
                cursor: isReal ? "pointer" : "default",
              }}
              onClick={() => {
                if (isReal) onSelect(item as RegistryTemplate);
              }}
            >
              <p className="text-[11px] font-medium leading-tight" style={{ color: WEB.text }}>
                {item.name}
              </p>
              <p className="text-[10px] mt-1 leading-snug line-clamp-2" style={{ color: WEB.textSecondary }}>
                {item.description}
              </p>
              <div className="flex items-center justify-between mt-auto">
                <span
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {domain}
                </span>
                <span className="text-[9px]" style={{ color: WEB.textTertiary }}>
                  {agentCount} agents
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IntroStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState(0);
  // 0: nothing  1: card border + "cabinet" title  2: pronunciation + noun
  // 3: def 1  4: def 2  5: def 3  6: tagline line 1  7: tagline line 2  8: button

  useEffect(() => {
    const delays = [300, 600, 1100, 1700, 2300, 3100, 3700, 4200];
    const timers = delays.map((ms, i) =>
      setTimeout(() => setPhase(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const fade = (p: number): CSSProperties => ({
    opacity: phase >= p ? 1 : 0,
    transform: phase >= p ? "translateY(0)" : "translateY(14px)",
    transition: "opacity 0.6s ease, transform 0.6s ease",
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:gap-10 w-full">
        {/* Dictionary Definition Card */}
        <div
          className="text-left rounded-2xl px-8 py-8 md:px-10 md:py-10 flex-1"
          style={{
            background: WEB.bgCard,
            border: `1px solid ${phase >= 1 ? WEB.border : "transparent"}`,
            boxShadow: phase >= 1
              ? "0 1px 3px rgba(59, 47, 47, 0.04), 0 8px 30px rgba(59, 47, 47, 0.04)"
              : "none",
            transition: "border-color 0.5s ease, box-shadow 0.8s ease",
          }}
        >
          <div className="flex items-baseline gap-3 mb-1" style={fade(1)}>
            <h1
              className="font-logo text-4xl sm:text-5xl tracking-tight italic"
              style={{ color: WEB.text }}
            >
              cabinet
            </h1>
            <span
              className="font-mono text-xs"
              style={{ ...fade(2), color: WEB.textTertiary }}
            >
              /&#x2C8;kab.&#x26A;.n&#x259;t/
            </span>
          </div>
          <p
            className="font-mono text-xs italic mb-6"
            style={{ ...fade(2), color: WEB.textTertiary }}
          >
            noun
          </p>

          <ol className="font-body-serif space-y-5 text-[15px] leading-relaxed">
            <li className="flex gap-3" style={fade(3)}>
              <span className="font-logo italic text-lg mt-[-2px] shrink-0" style={{ color: WEB.accent }}>1.</span>
              <div>
                <p style={{ color: WEB.textSecondary }}>
                  A cupboard with shelves or drawers for storing or displaying items.
                </p>
                <p className="font-mono text-xs italic mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;a filing cabinet&rdquo;
                </p>
              </div>
            </li>
            <li className="flex gap-3" style={fade(4)}>
              <span className="font-logo italic text-lg mt-[-2px] shrink-0" style={{ color: WEB.accent }}>2.</span>
              <div>
                <p style={{ color: WEB.textSecondary }}>
                  <span
                    className="font-mono text-[11px] uppercase tracking-wider mr-1.5 px-1.5 py-0.5 rounded"
                    style={{ color: WEB.textTertiary, background: "#F5F0EB" }}
                  >
                    politics
                  </span>
                  The committee of senior ministers responsible for controlling government policy.
                </p>
                <p className="font-mono text-xs italic mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;a cabinet meeting&rdquo;
                </p>
              </div>
            </li>
            <li className="flex gap-3" style={fade(5)}>
              <span className="font-logo italic text-lg mt-[-2px] shrink-0" style={{ color: WEB.accent }}>3.</span>
              <div>
                <p style={{ color: WEB.text }}>
                  <span
                    className="font-mono text-[11px] uppercase tracking-wider mr-1.5 px-1.5 py-0.5 rounded"
                    style={{ color: WEB.accent, background: WEB.accentBg }}
                  >
                    software
                  </span>
                  An AI-first knowledge base where a team of AI agents work for you 24/7 (no salary needed).
                </p>
                <p className="font-mono text-xs italic mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;I asked my cabinet to research the market and draft the blog post&rdquo;
                </p>
              </div>
            </li>
          </ol>
        </div>

        {/* Tagline + CTA */}
        <div className="flex flex-col items-center lg:items-start gap-6 py-6 lg:py-0 lg:max-w-xs shrink-0">
          <h2 className="text-center lg:text-left text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1]">
            <span className="font-logo italic" style={{ ...fade(6), color: WEB.text, display: "inline-block" }}>
              Your knowledge base.
            </span>
            <br />
            <span
              className="font-logo italic"
              style={{
                ...fade(7),
                display: "inline-block",
                background: "linear-gradient(135deg, #3B2F2F 0%, #8B5E3C 50%, #A0714D 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Your AI team.
            </span>
          </h2>

          <div style={fade(8)}>
            <button
              onClick={onNext}
              className="inline-flex items-center justify-center gap-2.5 rounded-full px-10 py-4 text-base font-medium text-white transition-all hover:-translate-y-0.5 shadow-sm w-full lg:w-auto"
              style={{ background: WEB.accent }}
            >
              Get started
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Cabinet Created — animated tree after import ─── */

function CabinetCreatedScreen({
  cabinetName,
  template,
  onContinue,
}: {
  cabinetName: string;
  template: RegistryTemplate;
  onContinue: () => void;
}) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [showButton, setShowButton] = useState(false);

  const treeLines = useMemo(() => {
    const lines: { text: string; indent: number; icon?: string }[] = [];
    lines.push({ text: cabinetName, indent: 0, icon: "📦" });
    lines.push({ text: ".cabinet", indent: 1 });
    lines.push({ text: ".agents/", indent: 1 });
    if (template.agentCount > 0) {
      const count = template.agentCount;
      lines.push({ text: `${count} agent${count > 1 ? "s" : ""} ready to work`, indent: 2, icon: "🤖" });
    }
    lines.push({ text: ".jobs/", indent: 1 });
    if (template.jobCount > 0) {
      const count = template.jobCount;
      lines.push({ text: `${count} scheduled job${count > 1 ? "s" : ""}`, indent: 2, icon: "⏱" });
    }
    if (template.childCount > 0) {
      lines.push({ text: `${template.childCount} sub-cabinet${template.childCount > 1 ? "s" : ""}`, indent: 2, icon: "📂" });
    }
    lines.push({ text: ".cabinet-state/", indent: 1 });
    lines.push({ text: "index.md", indent: 1 });
    return lines;
  }, [cabinetName, template]);

  useEffect(() => {
    if (visibleLines >= treeLines.length) {
      const t = setTimeout(() => setShowButton(true), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setVisibleLines((c) => c + 1),
      visibleLines === 0 ? 500 : 250 + Math.random() * 150
    );
    return () => clearTimeout(t);
  }, [visibleLines, treeLines.length]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <CheckCircle2 className="size-10 mx-auto" style={{ color: WEB.accent }} />
        <h1 className="font-logo text-2xl tracking-tight italic" style={{ color: WEB.text }}>
          Your cabinet has been created
        </h1>
        <p className="text-sm" style={{ color: WEB.textSecondary }}>
          Everything is set up and ready to go.
        </p>
      </div>

      {/* Animated tree */}
      <div
        className="w-full rounded-xl px-6 py-5 font-mono text-[13px] leading-relaxed"
        style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}` }}
      >
        {treeLines.map((line, i) => {
          const isVisible = i < visibleLines;
          const isRoot = i === 0;
          // Build the tree connector prefix
          let prefix = "";
          if (!isRoot && line.indent === 1) {
            // Check if this is the last indent-1 line
            const hasMoreAtSameLevel = treeLines.slice(i + 1).some((l) => l.indent === 1);
            prefix = hasMoreAtSameLevel ? "├── " : "└── ";
          } else if (line.indent === 2) {
            // Sub-item under a parent
            const hasMoreSiblings = treeLines.slice(i + 1).some(
              (l) => l.indent === 2 && treeLines.slice(i + 1).indexOf(l) < treeLines.slice(i + 1).findIndex((x) => x.indent <= 1)
            );
            prefix = "│   " + (hasMoreSiblings ? "├── " : "└── ");
          }

          return (
            <div
              key={i}
              className="transition-all duration-300"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateX(0)" : "translateX(-8px)",
              }}
            >
              {isRoot ? (
                <span style={{ color: WEB.accent, fontWeight: 600 }}>
                  {line.icon} {line.text}
                </span>
              ) : (
                <span style={{ color: WEB.textSecondary }}>
                  <span style={{ color: WEB.borderDark }}>{prefix}</span>
                  {line.icon ? `${line.icon} ` : ""}
                  {line.text}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 duration-300"
        style={{
          background: WEB.accent,
          opacity: showButton ? 1 : 0,
          transform: showButton ? "translateY(0)" : "translateY(8px)",
        }}
      >
        Continue setup
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── Welcome Back — shown when .cabinet already exists ─── */

function WelcomeBackStep({
  cabinetName,
  onNext,
}: {
  cabinetName?: string;
  onNext: () => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 animate-in fade-in duration-500">
      <div
        className="text-center space-y-3 transition-all duration-700"
        style={{ opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(12px)" }}
      >
        <CheckCircle2 className="size-10 mx-auto" style={{ color: WEB.accent }} />
        <h1 className="font-logo text-2xl tracking-tight italic" style={{ color: WEB.text }}>
          Welcome back{cabinetName ? ` to ${cabinetName}` : ""}
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          We found an existing cabinet here. Let&apos;s finish setting it up.
        </p>
      </div>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 duration-300"
        style={{
          background: WEB.accent,
          opacity: show ? 1 : 0,
          transform: show ? "translateY(0)" : "translateY(8px)",
        }}
      >
        Continue
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TeamBuildStep({
  agentsLoading,
  suggestedAgents,
  libraryTemplates,
  launchDisabled,
  selectedCount,
  maxAgents,
  toggleAgent,
  roomType,
  mandatoryAgents,
  onBack,
  onNext,
}: {
  agentsLoading: boolean;
  suggestedAgents: SuggestedAgent[];
  libraryTemplates: LibraryTemplate[];
  launchDisabled: boolean;
  selectedCount: number;
  maxAgents: number;
  toggleAgent: (slug: string) => void;
  roomType: RoomType;
  mandatoryAgents: Set<string>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [phase, setPhase] = useState(0);
  // phase 0: title
  // phase 1: "import" label
  // phase 2: carousel visible
  // phase 3: (reserved)
  // phase 4: "or pick" label + agents

  const [registryTemplates, setRegistryTemplates] = useState<RegistryTemplate[]>([]);
  const [importTemplate, setImportTemplate] = useState<RegistryTemplate | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedSlugs, setImportedSlugs] = useState<Set<string>>(new Set());
  const [registryOpen, setRegistryOpen] = useState(false);
  const [importedCabinet, setImportedCabinet] = useState<{ name: string; template: RegistryTemplate } | null>(null);

  useEffect(() => {
    fetch("/api/registry")
      .then((r) => r.json())
      .then((data) => {
        if (data.templates) setRegistryTemplates(data.templates);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleImport = async () => {
    if (!importTemplate) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await fetch("/api/registry/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: importTemplate.slug,
          name: importName.trim() !== importTemplate.name ? importName.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setImportError(data?.error || "Import failed");
        setImportBusy(false);
        return;
      }
      setImportedSlugs((prev) => new Set(prev).add(importTemplate.slug));
      setImportOpen(false);
      setImportedCabinet({ name: importName.trim() || importTemplate.name, template: importTemplate });
      setImportTemplate(null);
    } catch {
      setImportError("Import failed. Check your connection.");
    } finally {
      setImportBusy(false);
    }
  };

  // ── Success screen after import ──
  if (importedCabinet) {
    return (
      <CabinetCreatedScreen
        cabinetName={importedCabinet.name}
        template={importedCabinet.template}
        onContinue={onNext}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Title */}
      <div
        className="text-center space-y-2 transition-all duration-500"
        style={{ opacity: 1 }}
      >
        <h1 className="font-logo text-2xl tracking-tight italic">
          Build <span style={{ color: WEB.accent }}>your</span> team
        </h1>
        <p className="text-sm" style={{ color: WEB.textSecondary }}>
          Each cabinet is an AI team — agents, tasks, and a shared knowledge base, working together as one.
        </p>
      </div>

      {/* Carousel section */}
      <div
        className="space-y-2 transition-all duration-700"
        style={{
          width: "100vw",
          marginLeft: "calc(-50vw + 50%)",
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? "translateY(0)" : "translateY(12px)",
        }}
      >
        <div className="flex items-center justify-center gap-3">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: WEB.textTertiary }}
          >
            Import a pre-made zero-human team
          </p>
          <button
            onClick={() => setRegistryOpen(true)}
            className="text-[11px] font-semibold transition-colors"
            style={{ color: WEB.accent }}
          >
            Browse all &rarr;
          </button>
        </div>
        <div
          className="transition-opacity duration-500"
          style={{ opacity: phase >= 2 ? 1 : 0 }}
        >
          <TeamCarousel
            templates={registryTemplates}
            roomType={roomType}
            onSelect={(t) => {
              setImportTemplate(t);
              setImportName(t.name);
              setImportError(null);
              setImportOpen(true);
            }}
          />
        </div>
        {importedSlugs.size > 0 && (
          <p
            className="text-[10px] font-medium text-center mt-1"
            style={{ color: WEB.accent }}
          >
            <CheckCircle2 className="inline size-3 mr-1 -mt-px" />
            {importedSlugs.size} cabinet{importedSlugs.size > 1 ? "s" : ""} imported
          </p>
        )}
      </div>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={(v) => { if (!importBusy) setImportOpen(v); }}>
        <DialogContent
          className="sm:max-w-md"
          style={{ background: WEB.bg, border: `1px solid ${WEB.border}`, color: WEB.text }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: WEB.text }}>
              Import {importTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          {importTemplate && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: WEB.textSecondary }}>
                {importTemplate.description}
              </p>
              <div className="flex gap-4 text-xs" style={{ color: WEB.textTertiary }}>
                <span>{importTemplate.agentCount} agents</span>
                <span>{importTemplate.jobCount} jobs</span>
                {importTemplate.childCount > 0 && (
                  <span>{importTemplate.childCount} sub-cabinets</span>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: WEB.textSecondary }}>
                  Cabinet name
                </label>
                <input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    border: `1px solid ${WEB.border}`,
                    background: WEB.bgCard,
                    color: WEB.text,
                    outline: "none",
                  }}
                />
              </div>
              {importError && (
                <p className="text-xs" style={{ color: "#c0392b" }}>{importError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setImportOpen(false)}
                  disabled={importBusy}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={importBusy || !importName.trim()}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-white transition-all disabled:opacity-40"
                  style={{ background: WEB.accent }}
                >
                  {importBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                  Import
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Registry browser — full-screen overlay */}
      {registryOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: WEB.bg }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${WEB.border}` }}>
            <h2 className="font-logo text-xl italic" style={{ color: WEB.text }}>
              Browse cabinets
            </h2>
            <button
              onClick={() => setRegistryOpen(false)}
              className="flex items-center justify-center size-8 rounded-full transition-colors"
              style={{ color: WEB.textSecondary, background: WEB.bgWarm }}
            >
              <XCircle className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <RegistryBrowser />
          </div>
        </div>
      )}

      {/* Agent selection */}
      <div
        className="transition-all duration-700"
        style={{
          width: "100vw",
          marginLeft: "calc(-50vw + 50%)",
          opacity: phase >= 4 ? 1 : 0,
          transform: phase >= 4 ? "translateY(0)" : "translateY(12px)",
        }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-wider text-center mb-2"
          style={{ color: WEB.textTertiary }}
        >
          Or pick your agents{" "}
          <span style={{ color: selectedCount >= maxAgents ? WEB.accent : WEB.textTertiary }}>
            ({selectedCount}/{maxAgents})
          </span>
        </p>
        {agentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin" style={{ color: WEB.textTertiary }} />
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto px-6 pb-2 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
            {groupByDepartment(suggestedAgents, libraryTemplates, roomType).map(([label, agents]) => (
              <div
                key={label}
                className="rounded-xl p-3 shrink-0"
                style={{ background: WEB.bgWarm, width: 180 }}
              >
                <p
                  className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: WEB.textTertiary }}
                >
                  {label}
                </p>
                <div className="flex flex-col gap-1.5">
                  {agents.map((agent) => {
                    const isMandatory = mandatoryAgents.has(agent.slug);
                    const atLimit = selectedCount >= maxAgents && !agent.checked;
                    return (
                      <button
                        key={agent.slug}
                        onClick={() => toggleAgent(agent.slug)}
                        disabled={isMandatory || atLimit}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all"
                        style={{
                          border: `1px solid ${agent.checked ? WEB.accent : WEB.border}`,
                          background: agent.checked ? WEB.accentBg : WEB.bgCard,
                          opacity: atLimit ? 0.45 : 1,
                          cursor: isMandatory ? "default" : atLimit ? "not-allowed" : "pointer",
                        }}
                      >
                        <div
                          className="flex size-3.5 shrink-0 items-center justify-center rounded"
                          style={{
                            border: `1.5px solid ${agent.checked ? WEB.accent : WEB.borderDark}`,
                            background: agent.checked ? WEB.accent : "transparent",
                          }}
                        >
                          {agent.checked && (
                            <Check className="size-2 text-white" />
                          )}
                        </div>
                        <span className="text-xs">{agent.emoji}</span>
                        <p className="text-[11px] font-medium truncate" style={{ color: WEB.text }}>
                          {agent.name}
                        </p>
                        {isMandatory && (
                          <span
                            className="ml-auto text-[9px] font-medium uppercase tracking-wide shrink-0"
                            style={{ color: WEB.textTertiary }}
                          >
                            Required
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
          style={{ color: WEB.textSecondary }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={launchDisabled}
          className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{ background: WEB.accent }}
        >
          Next
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Room-aware grouping: each room has its own vocabulary for organising the
// agent picker. A department not mapped for the active room falls to "Other".
type DepartmentOrder = [string, string][];

const OFFICE_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["marketing", "Marketing"],
  ["content", "Content"],
  ["publishing", "Content"],
  ["engineering", "Engineering"],
  ["product", "Product & Design"],
  ["design", "Product & Design"],
  ["sales", "Business"],
  ["support", "Business"],
  ["analytics", "Business"],
  ["research", "Research"],
  ["finance", "Finance & Ops"],
  ["legal", "Finance & Ops"],
  ["hr", "Finance & Ops"],
  ["personal", "Personal"],
  ["household", "Personal"],
];

const STUDY_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["personal", "Second brain"],
  ["content", "Writing"],
  ["publishing", "Writing"],
  ["research", "Research"],
  ["engineering", "Tools"],
  ["household", "Life admin"],
  ["finance", "Life admin"],
  ["marketing", "From the Office"],
  ["sales", "From the Office"],
  ["support", "From the Office"],
  ["product", "From the Office"],
  ["design", "From the Office"],
  ["analytics", "From the Office"],
  ["legal", "From the Office"],
  ["hr", "From the Office"],
];

const LAB_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["research", "Research"],
  ["personal", "Writing & notes"],
  ["content", "Writing & notes"],
  ["publishing", "Writing & notes"],
  ["engineering", "Tools"],
  ["household", "Other"],
  ["finance", "Other"],
  ["marketing", "From the Office"],
  ["sales", "From the Office"],
  ["support", "From the Office"],
  ["product", "From the Office"],
  ["design", "From the Office"],
  ["analytics", "From the Office"],
  ["legal", "From the Office"],
  ["hr", "From the Office"],
];

const FAMILY_ROOM_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["household", "Household"],
  ["personal", "Admin"],
  ["finance", "Money"],
  ["engineering", "Tools"],
  ["research", "Other"],
  ["content", "Other"],
  ["publishing", "Other"],
  ["marketing", "From the Office"],
  ["sales", "From the Office"],
  ["support", "From the Office"],
  ["product", "From the Office"],
  ["design", "From the Office"],
  ["analytics", "From the Office"],
  ["legal", "From the Office"],
  ["hr", "From the Office"],
];

// Blank room has no opinion — just show everything in one flat list, leadership first.
const BLANK_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["marketing", "Marketing"],
  ["content", "Content"],
  ["publishing", "Content"],
  ["engineering", "Engineering"],
  ["product", "Product"],
  ["design", "Design"],
  ["sales", "Sales"],
  ["support", "Support"],
  ["analytics", "Analytics"],
  ["research", "Research"],
  ["finance", "Finance"],
  ["legal", "Legal"],
  ["hr", "People"],
  ["personal", "Personal"],
  ["household", "Household"],
];

const DEPARTMENT_ORDERS: Record<RoomType, DepartmentOrder> = {
  office: OFFICE_ORDER,
  study: STUDY_ORDER,
  lab: LAB_ORDER,
  "family-room": FAMILY_ROOM_ORDER,
  blank: BLANK_ORDER,
};

function getDepartmentLabel(dept: string, roomType: RoomType): string {
  const order = DEPARTMENT_ORDERS[roomType];
  const entry = order.find(([key]) => key === dept);
  return entry ? entry[1] : "Other";
}

function computeChecked(answers: OnboardingAnswers): Set<string> {
  const roomConfig = ROOMS[answers.roomType];
  const checked = new Set<string>(roomConfig.mandatoryAgents);
  // Pre-check the room's default suggestions.
  for (const s of roomConfig.suggestedAgents) checked.add(s);
  const desc = (answers.description + " " + answers.role + " " + answers.priority).toLowerCase();

  for (const [pattern, slugs] of roomConfig.keywordMap) {
    if (pattern.test(desc)) {
      for (const s of slugs) checked.add(s);
    }
  }

  return checked;
}

interface LibraryTemplate {
  slug: string;
  name: string;
  emoji: string;
  role: string;
  department: string;
  type: string;
}

function groupByDepartment(
  agents: SuggestedAgent[],
  templates: LibraryTemplate[],
  roomType: RoomType
): [string, SuggestedAgent[]][] {
  const deptMap = new Map<string, string>();
  for (const t of templates) deptMap.set(t.slug, t.department);

  const groups = new Map<string, SuggestedAgent[]>();
  for (const agent of agents) {
    const label = getDepartmentLabel(deptMap.get(agent.slug) || "general", roomType);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(agent);
  }

  // Sort groups by the predefined order
  const order = DEPARTMENT_ORDERS[roomType];
  const labelOrder = Array.from(new Set(order.map(([, l]) => l))).concat("Other");
  return labelOrder
    .filter((label) => groups.has(label))
    .map((label) => [label, groups.get(label)!]);
}

/* ─── Agent Chat Preview (launch step) ─── */

function AgentChatPreview({
  agents,
  workspaceName,
  homeName,
  roomType,
}: {
  agents: SuggestedAgent[];
  workspaceName: string;
  homeName: string;
  roomType: RoomType;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build conversation script from the selected agents. The lead (first agent
  // in ROOMS[roomType].mandatoryAgents) speaks first with a room-specific
  // greeting; followups come from the specialists.
  const messages = useMemo(() => {
    const config = ROOMS[roomType];
    const leadSlug = config.mandatoryAgents[0];
    const lead = agents.find((a) => a.slug === leadSlug) || agents[0];
    const others = agents.filter((a) => a.slug !== lead?.slug);
    if (!lead) return [];

    const script: { agent: SuggestedAgent; text: string }[] = [
      { agent: lead, text: config.greetingTemplate(homeName, workspaceName) },
    ];

    const roomReplies: Record<RoomType, string[]> = {
      office: [
        "On it. I'll have a landscape overview ready by end of day.",
        "Already drafting a plan. I'll share it in #content shortly.",
        "Setting up the foundational workflows now. Looking good so far.",
      ],
      study: [
        "I'll triage the inbox and surface what needs you.",
        "Calendar looks clear until 3pm — good window for writing.",
        "I've linked three new notes to the 'Daily' index already.",
      ],
      lab: [
        "Pulling the latest paper on this now — draft summary in an hour.",
        "I'll sync the bibliography after this and flag duplicates.",
        "Lecture outline for Thursday is almost ready for review.",
      ],
      "family-room": [
        "Schedule looks clear after 4. Flagging overlapping drop-offs.",
        "Menu drafted for the week — grocery list is ready to review.",
        "Kids' activities synced. DnD night is still on for Friday.",
      ],
      blank: [
        "Got it. Ready whenever you are.",
        "Standing by.",
        "I'll wait for direction.",
      ],
    };

    const replies = roomReplies[roomType];

    const topics: Record<RoomType, string[]> = {
      office: ["competitor research", "the content calendar", "the launch plan"],
      study: ["today's inbox triage", "this week's writing", "my reading list"],
      lab: ["the lit review", "Thursday's lecture prep", "the references list"],
      "family-room": ["today's schedule", "the meal plan", "the kids' activities"],
      blank: ["the first thing", "whatever's next", "the open question"],
    };
    const topicList = topics[roomType];

    others.slice(0, 3).forEach((other, idx) => {
      const topic = topicList[idx] || "what's next";
      script.push({ agent: lead, text: `${other.name}, can you take on ${topic}?` });
      if (replies[idx]) {
        script.push({ agent: other, text: replies[idx] });
      }
    });

    const closing: Record<RoomType, string> = {
      office: "Great energy everyone. Let's make this a strong first week.",
      study: "Good. Ping me when anything needs me — otherwise I'll stay out of your way.",
      lab: "Keep me posted. I'll review whatever you push by end of day.",
      "family-room": "Thanks all. Ping me if anything shifts during the day.",
      blank: "Whenever you're ready, tell us what to do.",
    };
    script.push({ agent: lead, text: closing[roomType] });

    return script;
  }, [agents, workspaceName, homeName, roomType]);

  useEffect(() => {
    if (visibleCount >= messages.length) return;
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, visibleCount === 0 ? 600 : 1200 + Math.random() * 800);
    return () => clearTimeout(timer);
  }, [visibleCount, messages.length]);

  useEffect(() => {
    const el = scrollRef.current?.parentElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleCount]);

  return (
    <div ref={scrollRef} className="space-y-0.5">
      {messages.slice(0, visibleCount).map((msg, i) => {
        const prevAgent = i > 0 ? messages[i - 1].agent.slug : null;
        const isConsecutive = prevAgent === msg.agent.slug;
        return (
          <div
            key={i}
            className="onboarding-chat-msg flex gap-2.5 px-1"
            style={{
              paddingTop: isConsecutive ? 1 : 8,
              animationDelay: "0s",
            }}
          >
            {/* Avatar column */}
            <div className="w-5 shrink-0 flex justify-center">
              {!isConsecutive && <span className="text-sm leading-none mt-0.5">{msg.agent.emoji}</span>}
            </div>
            {/* Message */}
            <div className="flex-1 min-w-0">
              {!isConsecutive && (
                <span
                  className="text-[11px] font-semibold block mb-0.5"
                  style={{ color: WEB.accent }}
                >
                  {msg.agent.name}
                </span>
              )}
              <p className="text-[11px] leading-relaxed" style={{ color: WEB.text }}>
                {msg.text}
              </p>
            </div>
          </div>
        );
      })}
      {/* Typing indicator */}
      {visibleCount < messages.length && visibleCount > 0 && (
        <div className="flex gap-2.5 px-1 pt-2">
          <div className="w-5 shrink-0 flex justify-center">
            <span className="text-sm leading-none mt-0.5">{messages[visibleCount]?.agent.emoji}</span>
          </div>
          <div className="flex items-center gap-1 py-1">
            <span className="onboarding-typing-dot size-1.5 rounded-full" style={{ background: WEB.textTertiary, animationDelay: "0s" }} />
            <span className="onboarding-typing-dot size-1.5 rounded-full" style={{ background: WEB.textTertiary, animationDelay: "0.15s" }} />
            <span className="onboarding-typing-dot size-1.5 rounded-full" style={{ background: WEB.textTertiary, animationDelay: "0.3s" }} />
          </div>
        </div>
      )}
      <style>{`
        @keyframes onboarding-chat-appear {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes onboarding-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        .onboarding-chat-msg {
          animation: onboarding-chat-appear 0.3s ease-out both;
        }
        .onboarding-typing-dot {
          animation: onboarding-typing-bounce 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/* ─── Dot-grid background (from runcabinet.com) ─── */
const dotGridStyle: React.CSSProperties = {
  backgroundImage: `radial-gradient(circle, ${WEB.borderDark} 0.5px, transparent 0.5px)`,
  backgroundSize: "32px 32px",
};

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    name: "",
    role: "",
    homeName: "",
    roomType: "study",
    workspaceName: "",
    description: "",
    teamSize: "",
    priority: "",
  });
  const mandatoryAgents = useMemo(
    () => new Set<string>(ROOMS[answers.roomType].mandatoryAgents),
    [answers.roomType]
  );
  const activeRoom = ROOMS[answers.roomType];
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const [suggestedAgents, setSuggestedAgents] = useState<SuggestedAgent[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<LibraryTemplate[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [githubStars, setGithubStars] = useState(GITHUB_STARS_FALLBACK);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [onboardingVerifyState, setOnboardingVerifyState] = useState<
    Record<string, OnboardingVerifyState>
  >({});
  const runOnboardingVerify = useCallback(async (providerId: string) => {
    setOnboardingVerifyState((prev) => ({
      ...prev,
      [providerId]: { phase: "running" },
    }));
    try {
      const res = await fetch(`/api/agents/providers/${providerId}/verify`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setOnboardingVerifyState((prev) => ({
          ...prev,
          [providerId]: {
            phase: "error",
            message: body.error || `HTTP ${res.status}`,
          },
        }));
        return;
      }
      const data = (await res.json()) as OnboardingVerifyResult;
      setOnboardingVerifyState((prev) => ({
        ...prev,
        [providerId]: { phase: "done", result: data },
      }));
    } catch (err) {
      setOnboardingVerifyState((prev) => ({
        ...prev,
        [providerId]: {
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, []);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffort] = useState<string | null>(null);
  const [cabinetManifest, setCabinetManifest] = useState<{ name?: string; description?: string } | null>(null);
  const [isExistingCabinet, setIsExistingCabinet] = useState(false);
  const readyProviders = providers.filter((p) => p.available && p.authenticated);
  const anyProviderReady = readyProviders.length > 0;
  const activeProvider = providers.find((p) => p.id === selectedProvider);
  const activeModel = resolveProviderModel(
    activeProvider,
    selectedModel || undefined,
    undefined
  );
  const activeModels = activeProvider?.models || [];
  const activeEffortLevels = getModelEffortLevels(activeProvider, activeModel?.id);
  const sortedProviders = useMemo(() => {
    const rank = (p: ProviderInfo) =>
      p.available && p.authenticated ? 0 : p.available ? 1 : 2;
    return [...providers].sort((a, b) => rank(a) - rank(b));
  }, [providers]);
  const expandedProviderInfo = useMemo(
    () => (expandedProvider ? providers.find((p) => p.id === expandedProvider) || null : null),
    [expandedProvider, providers]
  );

  useEffect(() => {
    const controller = new AbortController();

    const fetchGitHubStats = async () => {
      try {
        const res = await fetch(GITHUB_STATS_URL, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = await res.json();
        if (typeof data.stars === "number") {
          setGithubStars(data.stars);
        }
      } catch {
        // ignore
      }
    };

    void fetchGitHubStats();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    fetch("/api/system/cabinet-manifest")
      .then((r) => r.json())
      .then((data) => {
        if (data.exists && data.manifest) {
          setIsExistingCabinet(true);
          setCabinetManifest(data.manifest);
          if (data.manifest.name) {
            setAnswers((prev) => ({
              ...prev,
              workspaceName: prev.workspaceName || data.manifest.name,
            }));
          }
        }
      })
      .catch(() => {});
  }, []);

  const checkProvider = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const res = await fetch("/api/agents/providers");
      if (!res.ok) throw new Error("Failed to check providers");
      const data = await res.json();
      const cliProviders: ProviderInfo[] = (data.providers ?? []).filter(
        (p: ProviderInfo) => p.type === "cli"
      );
      setProviders(cliProviders);
      // Auto-select first ready provider if none selected
      const ready = cliProviders.filter((p) => p.available && p.authenticated);
      if (ready.length > 0 && !selectedProvider) {
        const first = ready[0];
        const firstModelId = first.models?.[0]?.id ?? null;
        setSelectedProvider(first.id);
        setSelectedModel(firstModelId);
        setSelectedEffort(
          getSuggestedProviderEffort(first, firstModelId || undefined)?.id || null
        );
      }
    } catch {
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }, [selectedProvider]);

  useEffect(() => {
    if (step === STEP_PROVIDER) {
      void checkProvider();
    }
  }, [step, checkProvider]);

  const goToTeamSuggestion = async () => {
    setStep(STEP_TEAM);
    setAgentsLoading(true);
    try {
      const res = await fetch("/api/agents/library");
      const data = await res.json();
      const templates: LibraryTemplate[] = data.templates ?? [];
      setLibraryTemplates(templates);
      const checked = computeChecked(answers);
      setSuggestedAgents(
        templates.map((t) => ({
          slug: t.slug,
          name: t.name,
          emoji: t.emoji,
          role: t.role,
          checked: checked.has(t.slug),
        }))
      );
    } catch {
      // Fallback: at least offer the room's mandatory pair
      const [leadSlug, editorSlug] = ROOMS[answers.roomType].mandatoryAgents;
      setSuggestedAgents([
        { slug: leadSlug, name: leadSlug, emoji: "\u{1F916}", role: "Lead", checked: true },
        { slug: editorSlug, name: editorSlug, emoji: "\u{1F4DD}", role: "Support", checked: true },
      ]);
    } finally {
      setAgentsLoading(false);
    }
  };

  const MAX_AGENTS = 5;

  const toggleAgent = (slug: string) => {
    // The room's mandatory agents cannot be unchecked.
    if (mandatoryAgents.has(slug)) return;

    setSuggestedAgents((prev) => {
      const target = prev.find((a) => a.slug === slug);
      if (!target) return prev;

      // If trying to check and already at limit, block it
      if (!target.checked && prev.filter((a) => a.checked).length >= MAX_AGENTS) {
        return prev;
      }

      return prev.map((a) =>
        a.slug === slug ? { ...a, checked: !a.checked } : a
      );
    });
  };

  const launch = useCallback(async () => {
    setLaunching(true);
    try {
      const selected = suggestedAgents.filter((a) => a.checked).map((a) => a.slug);

      // Save provider + model preference
      if (selectedProvider) {
        await fetch("/api/agents/providers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultProvider: selectedProvider,
            defaultModel: selectedModel || undefined,
            defaultEffort: selectedEffort || undefined,
          }),
        });
      }

      await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeName: answers.homeName || (answers.name ? `${answers.name}'s Home` : "Home"),
          roomType: answers.roomType,
          answers: {
            name: answers.name,
            workspaceName: answers.workspaceName,
            description: answers.description,
            teamSize: answers.teamSize,
            priority: answers.priority,
          },
          selectedAgents: selected,
        }),
      });

      onComplete();
    } catch (e) {
      console.error("Setup failed:", e);
      setLaunching(false);
    }
  }, [answers, suggestedAgents, selectedProvider, selectedModel, selectedEffort, onComplete]);

  const selectedAgentCount = suggestedAgents.filter(
    (agent) => agent.checked
  ).length;
  const communitySteps: CommunityStepConfig[] = [
    {
      eyebrow: "GitHub",
      title: "Help the Cabinet community grow",
      description:
        "A GitHub star helps more people discover Cabinet and join the community.",
      aside:
        "Cabinet is open source. If you like the vision, help us spread the word.",
      nextLabel: "Next",
      cards: [],
    },
    {
      eyebrow: "Discord",
      title: "Discord is where the good weirdness happens.",
      description:
        "This is where feedback turns into features, screenshots turn into debates, and somebody usually finds the edge case before it finds you.",
      aside:
        "If you want new features first and prefer 'come chat' over 'please submit a ticket,' this is your room.",
      nextLabel: "Next",
      cards: [
        {
          title: "Join the Discord",
          description:
            "Meet the people building Cabinet, see what's shipping, and toss ideas into the fire while they are still hot.",
          cta: "Join the chat",
          href: DISCORD_SUPPORT_URL,
          icon: <DiscordIcon className="size-4" />,
          iconClassName: "",
        },
        {
          title: "Why people stay",
          description:
            "Early features, fast answers, behind-the-scenes progress, and the occasional delightful chaos of building in public.",
          cta: "",
          icon: <Sparkles className="size-4" />,
          iconClassName: "",
        },
      ],
    },
    {
      eyebrow: "Cabinet Cloud",
      title: "Cabinet Cloud is for people who want the magic without babysitting the plumbing.",
      description:
        "Self-hosting is great until you're explaining ports, sync, and local setup to a teammate who just wanted the doc to open.",
      aside:
        "Cloud is the future easy button: easier sharing, less setup, and fewer heroic acts of yak shaving before coffee.",
      cards: [
        {
          title: "Join the Cabinet Cloud waitlist",
          description:
            "Raise your hand if you want the hosted version first when it is ready.",
          cta: "Register for Cabinet Cloud",
          href: CABINET_CLOUD_URL,
          icon: <Cloud className="size-4" />,
          iconClassName: "",
        },
        {
          title: "Why people want it",
          description:
            "Less setup, easier sharing, faster onboarding for teams, and a much lower chance of explaining terminal tabs before lunch.",
          cta: "",
          icon: <Rocket className="size-4" />,
          iconClassName: "",
        },
      ],
    },
  ];
  const communityStep =
    step >= COMMUNITY_START_STEP && step <= COMMUNITY_END_STEP
      ? communitySteps[step - COMMUNITY_START_STEP]
      : null;
  const isGitHubCommunityStep = communityStep?.eyebrow === "GitHub";
  const launchDisabled = launching || selectedAgentCount === 0;
  const starsLabel = `${formatGithubStars(githubStars)} GitHub stars`;

  /* ─── Shared inline styles (website tokens) ─── */
  const inputStyle: React.CSSProperties = {
    background: WEB.bgCard,
    border: `1px solid ${WEB.border}`,
    color: WEB.text,
    borderRadius: 12,
    height: 44,
    fontSize: 15,
    padding: "0 14px",
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: WEB.bg, color: WEB.text }}
    >
      {step === STEP_WELCOME_HOME && (
        <div className="pointer-events-none absolute inset-0">
          <HomeBlueprintBackground
            accent={WEB.accent}
            accentSoft={WEB.accentBg}
            paper={WEB.bgWarm}
          />
        </div>
      )}
      <div
        className="relative mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-10"
        style={step === STEP_WELCOME_HOME ? undefined : dotGridStyle}
      >
        <div className="w-full">
          {/* Progress indicator */}
          <div className="mb-10 flex items-center justify-center gap-2">
            {Array.from({ length: STEP_COUNT }, (_, i) => i).map((i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  height: 8,
                  width: i <= step ? 40 : 24,
                  background: i <= step ? WEB.accent : WEB.borderLight,
                }}
              />
            ))}
          </div>

          {/* Step 0: Welcome — Dictionary card */}
          {step === 0 && (
            <IntroStep onNext={() => setStep(1)} />
          )}

          {/* Step 1: Welcome home — name only */}
          {step === STEP_WELCOME_HOME && (
            <div className="relative">
              <div
                className="relative z-10 mx-auto flex max-w-xl flex-col gap-7 rounded-2xl px-6 py-7 animate-in fade-in duration-500"
                style={{
                  background: "rgba(253, 250, 244, 0.82)",
                  backdropFilter: "blur(10px) saturate(1.2)",
                  WebkitBackdropFilter: "blur(10px) saturate(1.2)",
                  border: `1px solid ${WEB.accent}33`,
                  boxShadow:
                    "0 20px 60px -20px rgba(139, 94, 60, 0.28), 0 0 0 1px rgba(255,255,255,0.6) inset",
                }}
              >
                <div className="text-center space-y-3">
                  <h1 className="font-logo text-2xl tracking-tight italic">
                    Welcome <span style={{ color: WEB.accent }}>home</span>
                  </h1>
                  <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                    Your Home is yours. Inside it, you&apos;ll set up rooms for different parts of your life — work, second brain, research, family. And every room has cabinets: your notes, your files, and an AI team quietly getting things done in the background.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    What&apos;s your name?
                  </label>
                  <input
                    value={answers.name}
                    onChange={(e) => setAnswers({ ...answers, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && answers.name.trim()) {
                        e.preventDefault();
                        setStep(STEP_ROOM_SETUP);
                      }
                    }}
                    placeholder="Jane"
                    style={inputStyle}
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setStep(0)}
                    className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                    style={{ color: WEB.textSecondary }}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    onClick={() => setStep(STEP_ROOM_SETUP)}
                    disabled={!answers.name.trim()}
                    className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                    style={{ background: WEB.accent }}
                  >
                    Next
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Pick a room + name + describe the cabinet (merged) */}
          {step === STEP_ROOM_SETUP && (
            <div className="mx-auto flex max-w-4xl flex-col gap-7 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-logo text-2xl tracking-tight italic">
                  Pick a <span style={{ color: WEB.accent }}>room</span>
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                  What&apos;s this cabinet for? Each room comes with its own AI team.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {ROOM_TYPES.map((id) => {
                  const room = ROOMS[id];
                  const Icon = room.icon;
                  const isSelected = answers.roomType === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setAnswers({ ...answers, roomType: id })}
                      className="group relative flex flex-col gap-2.5 rounded-xl p-4 text-left transition-all hover:-translate-y-0.5 overflow-hidden"
                      style={{
                        background: isSelected ? WEB.accentBg : WEB.bgCard,
                        border: `1px solid ${isSelected ? WEB.accent : WEB.border}`,
                        boxShadow: isSelected
                          ? "0 4px 14px rgba(139, 94, 60, 0.15)"
                          : "0 1px 2px rgba(59, 47, 47, 0.03)",
                        minHeight: 170,
                      }}
                    >
                      {/* Vague background glyph — blurred, tiny-opacity, bleeds off the card */}
                      <Icon
                        aria-hidden="true"
                        className="pointer-events-none absolute transition-opacity duration-300"
                        style={{
                          right: -40,
                          bottom: -40,
                          width: 190,
                          height: 190,
                          color: WEB.accent,
                          opacity: isSelected ? 0.09 : 0.045,
                          strokeWidth: 1,
                          filter: "blur(1.5px)",
                        }}
                      />
                      <div className="relative space-y-1">
                        <p className="text-sm font-semibold" style={{ color: WEB.text }}>
                          {room.label}
                        </p>
                        <p className="text-[11px] leading-relaxed" style={{ color: WEB.textSecondary }}>
                          {room.tagline}
                        </p>
                      </div>
                      <div
                        className="relative mt-auto flex flex-wrap items-center gap-1 pt-2"
                        style={{ borderTop: `1px solid ${WEB.borderLight}` }}
                      >
                        {room.exampleAgents.slice(0, 2).map((ex) => (
                          <span
                            key={ex}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{
                              background: isSelected ? WEB.bgCard : WEB.bgWarm,
                              color: WEB.textSecondary,
                            }}
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Cabinet name + description inputs, adaptive to the active room */}
              <div
                className="space-y-5 rounded-2xl p-5"
                style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}` }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    {activeRoom.workspaceLabel}
                  </label>
                  <input
                    value={answers.workspaceName}
                    onChange={(e) =>
                      setAnswers({ ...answers, workspaceName: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        descriptionInputRef.current?.focus();
                      }
                    }}
                    placeholder={activeRoom.workspacePlaceholder}
                    style={inputStyle}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    {activeRoom.descriptionLabel}
                  </label>
                  <input
                    ref={descriptionInputRef}
                    value={answers.description}
                    onChange={(e) =>
                      setAnswers({ ...answers, description: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && answers.workspaceName.trim()) {
                        e.preventDefault();
                        void goToTeamSuggestion();
                      }
                    }}
                    placeholder={activeRoom.descriptionPlaceholder}
                    style={inputStyle}
                  />
                </div>

                {activeRoom.askTeamSize && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: WEB.text }}>
                      {activeRoom.teamSizeLabel || "How big is your team?"}
                    </label>
                    <div className="flex gap-2">
                      {(answers.roomType === "family-room" ? HOUSEHOLD_SIZES : TEAM_SIZES).map((size) => (
                        <button
                          key={size}
                          onClick={() =>
                            setAnswers({ ...answers, teamSize: size })
                          }
                          className="flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all"
                          style={{
                            border: `1px solid ${answers.teamSize === size ? WEB.accent : WEB.border}`,
                            background: answers.teamSize === size ? WEB.accentBg : WEB.bgCard,
                            color: answers.teamSize === size ? WEB.accent : WEB.textSecondary,
                          }}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setStep(STEP_WELCOME_HOME)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <button
                  onClick={goToTeamSuggestion}
                  disabled={!answers.workspaceName.trim()}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                  style={{ background: WEB.accent }}
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Team Suggestion — carousel + agent picker */}
          {step === STEP_TEAM && (
            <TeamBuildStep
              agentsLoading={agentsLoading}
              suggestedAgents={suggestedAgents}
              libraryTemplates={libraryTemplates}
              launchDisabled={launchDisabled}
              selectedCount={selectedAgentCount}
              maxAgents={MAX_AGENTS}
              toggleAgent={toggleAgent}
              roomType={answers.roomType}
              mandatoryAgents={mandatoryAgents}
              onBack={() => setStep(STEP_ROOM_SETUP)}
              onNext={() => setStep(STEP_PROVIDER)}
            />
          )}

          {/* Step 5: AI Provider Check */}
          {step === STEP_PROVIDER && (
            <div className="mx-auto flex max-w-xl flex-col gap-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-logo text-2xl tracking-tight italic">
                  Agent Provider
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                  Cabinet needs an AI CLI to power your agents.
                </p>
              </div>

              {/* Registered CLI providers */}
              {providersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin" style={{ color: WEB.textTertiary }} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                    {sortedProviders.map((p) => {
                      const isReady = !!(p.available && p.authenticated);
                      const isInstalled = !!p.available;
                      const isSelected = selectedProvider === p.id;
                      const isExpanded = expandedProvider === p.id;
                      const verifyState =
                        onboardingVerifyState[p.id] ?? { phase: "idle" as const };
                      const verifyMeta =
                        verifyState.phase === "done"
                          ? ONBOARDING_VERIFY_META[verifyState.result.status]
                          : null;
                      const statusLabel = isReady
                        ? "Ready"
                        : isInstalled
                          ? "Log in required"
                          : "Not installed";
                      const statusColor = isReady
                        ? "#16a34a"
                        : isInstalled
                          ? "#d97706"
                          : WEB.textTertiary;
                      const statusBg = isReady
                        ? "rgba(22,163,74,0.12)"
                        : isInstalled
                          ? "rgba(217,119,6,0.12)"
                          : "rgba(100,116,139,0.12)";
                      const cardBorder = isReady
                        ? isSelected
                          ? WEB.accent
                          : WEB.borderLight
                        : isInstalled
                          ? "rgba(217,119,6,0.45)"
                          : WEB.borderLight;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (isReady) {
                              const nextModelId = p.models?.[0]?.id ?? null;
                              setSelectedProvider(p.id);
                              setSelectedModel(nextModelId);
                              setSelectedEffort(
                                getSuggestedProviderEffort(
                                  p,
                                  nextModelId || undefined
                                )?.id || null
                              );
                            } else {
                              setExpandedProvider(isExpanded ? null : p.id);
                            }
                          }}
                          className="group relative flex flex-col items-start gap-2 rounded-xl p-3 text-left transition-all hover:-translate-y-0.5"
                          style={{
                            background:
                              isSelected && isReady ? WEB.accentBg : WEB.bgCard,
                            border: `1px solid ${cardBorder}`,
                            boxShadow:
                              isSelected && isReady
                                ? `0 0 0 2px ${WEB.accent}22`
                                : undefined,
                            opacity: isReady ? 1 : isInstalled ? 0.95 : 0.7,
                          }}
                        >
                          {isSelected && isReady && (
                            <span
                              className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full"
                              style={{ background: WEB.accent }}
                            >
                              <Check className="size-2.5 text-white" />
                            </span>
                          )}
                          <div className="flex w-full items-center gap-2">
                            <div
                              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                background: WEB.bgWarm,
                                color: WEB.accent,
                              }}
                            >
                              <ProviderGlyph icon={p.icon} className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className="truncate text-[13px] font-medium"
                                style={{ color: WEB.text }}
                              >
                                {p.name}
                              </p>
                              {isReady && p.version && (
                                <p
                                  className="truncate text-[10px]"
                                  style={{ color: WEB.textTertiary }}
                                >
                                  {p.version}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex w-full items-center justify-between gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ background: statusBg, color: statusColor }}
                            >
                              {verifyMeta ? verifyMeta.label : statusLabel}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium"
                              style={{ color: WEB.textTertiary }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedProvider(isExpanded ? null : p.id);
                              }}
                              role="button"
                            >
                              {isReady
                                ? "Guide"
                                : isInstalled
                                  ? "Log in"
                                  : "Install"}
                              <ChevronDown
                                className="size-3 transition-transform"
                                style={{
                                  transform: isExpanded
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                }}
                              />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={checkProvider}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all hover:-translate-y-0.5"
                    style={{ background: WEB.bgWarm, border: `1px solid ${WEB.borderLight}`, color: WEB.accent }}
                  >
                    <RefreshCw className="size-3" />
                    Re-check providers
                  </button>

                  {/* Install / verify guide drawer */}
                  {expandedProviderInfo && (() => {
                    const p = expandedProviderInfo;
                    const setupSteps: { title: string; detail: string; cmd?: string; openTerminal?: boolean; link?: { label: string; url: string } }[] = [
                      { title: "Open a terminal", detail: "You'll need a terminal to run the next steps.", openTerminal: true },
                      ...((p.installSteps || []).map((step) => ({
                        title: step.title,
                        detail: step.detail,
                        cmd: step.command,
                        link: step.link,
                      }))),
                    ];
                    const verifyState =
                      onboardingVerifyState[p.id] ?? { phase: "idle" as const };
                    const verifyResult =
                      verifyState.phase === "done" ? verifyState.result : null;
                    const verifyMeta = verifyResult
                      ? ONBOARDING_VERIFY_META[verifyResult.status]
                      : null;
                    return (
                      <div
                        className="rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200"
                        style={{
                          background: WEB.bgWarm,
                          border: `1px solid ${WEB.borderLight}`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex size-7 items-center justify-center rounded-lg"
                              style={{ background: WEB.bgCard, color: WEB.accent }}
                            >
                              <ProviderGlyph icon={p.icon} className="size-3.5" />
                            </div>
                            <p className="text-[13px] font-semibold" style={{ color: WEB.text }}>
                              {p.name} setup
                            </p>
                          </div>
                          <button
                            onClick={() => setExpandedProvider(null)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                            style={{ color: WEB.textTertiary }}
                          >
                            Close
                          </button>
                        </div>

                        {setupSteps.map((setupStep, i) => {
                          const isFailedStep =
                            verifyResult?.status !== undefined &&
                            verifyResult.status !== "pass" &&
                            setupStep.title.trim().toLowerCase() ===
                              verifyResult.failedStepTitle.trim().toLowerCase();
                          const isPassStep =
                            verifyResult?.status === "pass" &&
                            /verify\s+setup/i.test(setupStep.title);
                          return (
                            <div
                              key={i}
                              className="flex items-start gap-2.5 rounded-md p-1.5"
                              style={{
                                background: isFailedStep
                                  ? "rgba(225,29,72,0.08)"
                                  : isPassStep
                                    ? "rgba(22,163,74,0.08)"
                                    : "transparent",
                                boxShadow: isFailedStep
                                  ? "0 0 0 1px rgba(225,29,72,0.3) inset"
                                  : isPassStep
                                    ? "0 0 0 1px rgba(22,163,74,0.3) inset"
                                    : undefined,
                              }}
                            >
                              <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5"
                                style={{
                                  background: isFailedStep
                                    ? "#e11d48"
                                    : isPassStep
                                      ? "#16a34a"
                                      : WEB.accent,
                                  color: "white",
                                }}
                              >
                                {isFailedStep ? "!" : isPassStep ? "✓" : i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium" style={{ color: WEB.text }}>
                                  {setupStep.title}
                                </p>
                                <p className="text-[11px] mt-0.5" style={{ color: WEB.textSecondary }}>
                                  {setupStep.detail}
                                </p>
                                {setupStep.cmd && (
                                  <TerminalCommand command={setupStep.cmd} />
                                )}
                                {setupStep.openTerminal && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fetch("/api/terminal/open", { method: "POST" }).catch(() => {
                                        alert("Could not open terminal automatically. Please open Terminal.app (Mac) or your system terminal manually.");
                                      });
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 mt-1.5 text-[11px] font-medium transition-all hover:-translate-y-0.5"
                                    style={{ background: "#1e1e1e", color: "#d4d4d4" }}
                                  >
                                    <Terminal className="size-3" />
                                    Open terminal
                                  </button>
                                )}
                                {setupStep.link && (
                                  <a
                                    href={setupStep.link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5"
                                    style={{ color: WEB.accent }}
                                  >
                                    {setupStep.link.label}
                                    <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        <div
                          className="flex flex-wrap items-center gap-2 pt-2 border-t"
                          style={{ borderColor: WEB.borderLight }}
                        >
                          <button
                            onClick={() => void runOnboardingVerify(p.id)}
                            disabled={verifyState.phase === "running"}
                            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all hover:-translate-y-0.5 disabled:opacity-50"
                            style={{ background: WEB.accent, color: "white" }}
                          >
                            {verifyState.phase === "running" ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3" />
                            )}
                            {verifyState.phase === "running"
                              ? "Verifying…"
                              : verifyState.phase === "done"
                                ? "Re-run verify"
                                : "Run verify"}
                          </button>
                          {verifyMeta && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: verifyMeta.bg, color: verifyMeta.color }}
                            >
                              {verifyMeta.label}
                            </span>
                          )}
                          {verifyResult &&
                            verifyResult.status !== "pass" &&
                            verifyResult.failedStepTitle && (
                              <span className="text-[11px]" style={{ color: WEB.textSecondary }}>
                                Failed at step:{" "}
                                <strong style={{ color: WEB.text }}>
                                  {verifyResult.failedStepTitle}
                                </strong>
                              </span>
                            )}
                          {verifyState.phase === "error" && (
                            <span className="text-[11px]" style={{ color: "#e11d48" }}>
                              {verifyState.message}
                            </span>
                          )}
                        </div>
                        {verifyResult?.hint && verifyResult.status !== "pass" && (
                          <p className="text-[11px]" style={{ color: WEB.textSecondary }}>
                            {verifyResult.hint}
                          </p>
                        )}

                        <p className="text-[11px]" style={{ color: WEB.textTertiary }}>
                          Verify runs the provider's headless prompt end-to-end and classifies any failure so you know which step to revisit.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Selected runtime summary */}
              {activeProvider && (
                <RuntimeSelectionBanner
                  providers={providers}
                  value={{
                    providerId: selectedProvider,
                    model: selectedModel,
                    effort: selectedEffort,
                  }}
                  label="Default Model"
                />
              )}

              {/* Model selector — shown when a ready provider is selected */}
              {activeModels.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: WEB.textTertiary }}>
                    Default model
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {activeModels.map((m) => {
                      const isMSelected = selectedModel === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            const nextEffortId =
                              resolveProviderEffort(
                                activeProvider,
                                m.id,
                                selectedEffort || undefined,
                                undefined
                              )?.id ||
                              getSuggestedProviderEffort(activeProvider, m.id)?.id ||
                              null;
                            setSelectedModel(m.id);
                            setSelectedEffort(nextEffortId);
                          }}
                          className="rounded-xl p-3 text-left transition-all"
                          style={{
                            background: isMSelected ? WEB.accentBg : WEB.bgCard,
                            border: `1px solid ${isMSelected ? WEB.borderDark : WEB.borderLight}`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="flex size-3 shrink-0 items-center justify-center rounded-full"
                              style={{
                                border: `1.5px solid ${isMSelected ? WEB.accent : WEB.borderDark}`,
                                background: isMSelected ? WEB.accent : "transparent",
                              }}
                            >
                              {isMSelected && <Check className="size-1.5 text-white" />}
                            </div>
                            <p className="text-[13px] font-medium" style={{ color: WEB.text }}>{m.name}</p>
                          </div>
                          {m.description && (
                            <p className="text-[11px] ml-5" style={{ color: WEB.textSecondary }}>{m.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Effort level selector — only for providers that support it */}
              {activeEffortLevels.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: WEB.textTertiary }}>
                    {activeModel?.name
                      ? `Reasoning effort · ${activeModel.name}`
                      : "Reasoning effort"}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {activeEffortLevels.map((e) => {
                      const isESelected = selectedEffort === e.id;
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEffort(e.id)}
                          className="rounded-xl p-3 text-left transition-all"
                          style={{
                            background: isESelected ? WEB.accentBg : WEB.bgCard,
                            border: `1px solid ${isESelected ? WEB.borderDark : WEB.borderLight}`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="flex size-3 shrink-0 items-center justify-center rounded-full"
                              style={{
                                border: `1.5px solid ${isESelected ? WEB.accent : WEB.borderDark}`,
                                background: isESelected ? WEB.accent : "transparent",
                              }}
                            >
                              {isESelected && <Check className="size-1.5 text-white" />}
                            </div>
                            <p className="text-[13px] font-medium" style={{ color: WEB.text }}>{e.name}</p>
                          </div>
                          {e.description && (
                            <p className="text-[11px] ml-5" style={{ color: WEB.textSecondary }}>{e.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Coming soon providers */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: WEB.textTertiary }}>
                  Coming soon
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { name: "Anthropic API", type: "API", icon: "api" },
                    { name: "OpenAI API", type: "API", icon: "api" },
                    { name: "Google AI API", type: "API", icon: "api" },
                    { name: "Plugin SDK", type: "SDK", icon: "terminal" },
                  ].map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 opacity-40"
                      style={{
                        background: WEB.bgCard,
                        border: `1px solid ${WEB.borderLight}`,
                      }}
                    >
                      <div
                        className="flex size-8 items-center justify-center rounded-lg"
                        style={{ background: WEB.bgWarm, color: WEB.textTertiary }}
                      >
                        {p.icon === "terminal" ? (
                          <Terminal className="size-4" />
                        ) : (
                          <Zap className="size-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium" style={{ color: WEB.textSecondary }}>
                          {p.name}
                        </p>
                        <p className="text-[10px]" style={{ color: WEB.textTertiary }}>
                          {p.type} agent
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(STEP_TEAM)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <button
                  onClick={() => setStep(COMMUNITY_START_STEP)}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
                  style={{ background: WEB.accent }}
                >
                  {anyProviderReady ? "Next" : "Skip for now"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Steps 6-8: Community */}
          {communityStep && (
            <div className="relative mx-auto flex max-w-2xl flex-col gap-8 animate-in fade-in duration-300">
              {/* Floating emoji backdrop per community step */}
              {(() => {
                const emojiMap: Record<string, string> = {
                  "Cabinet Cloud": "☁️",
                };
                const emoji = emojiMap[communityStep.eyebrow];
                if (!emoji) return null;
                return (
                  <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                    {[
                      { top: "-5%", left: "-8%", duration: "34s", delay: "-8s", opacity: 0.45, reverse: false },
                      { top: "5%", left: "55%", duration: "42s", delay: "-17s", opacity: 0.4, reverse: true },
                      { top: "40%", left: "-5%", duration: "38s", delay: "-12s", opacity: 0.38, reverse: true },
                      { top: "50%", left: "60%", duration: "46s", delay: "-22s", opacity: 0.4, reverse: false },
                      { top: "75%", left: "20%", duration: "40s", delay: "-5s", opacity: 0.35, reverse: false },
                    ].map((cloud, i) => (
                      <div
                        key={i}
                        className={`waitlist-cloud-row absolute ${cloud.reverse ? "waitlist-cloud-row-reverse" : ""}`}
                        style={{
                          top: cloud.top,
                          left: cloud.left,
                          opacity: cloud.opacity,
                          ["--cloud-row-duration" as string]: cloud.duration,
                          animationDelay: cloud.delay,
                        }}
                      >
                        <span
                          className={`select-none leading-none ${
                            communityStep.eyebrow === "Cabinet Cloud"
                              ? "text-[280px] sm:text-[400px]"
                              : "text-[180px] sm:text-[260px]"
                          }`}
                          style={{ filter: "drop-shadow(0 18px 26px rgba(214,194,160,0.22))" }}
                        >
                          {emoji}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div
                className="relative z-10 rounded-2xl p-5 sm:p-6"
                style={{
                  border: `1px solid ${WEB.border}`,
                  background: communityStep.eyebrow === "Cabinet Cloud"
                    ? `linear-gradient(180deg, rgba(252,249,244,0.96), rgba(247,241,232,0.94))`
                    : WEB.bgCard,
                  boxShadow: "0 1px 3px rgba(59, 47, 47, 0.04), 0 8px 30px rgba(59, 47, 47, 0.04)",
                }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <h2
                        className="font-logo text-xl tracking-tight italic"
                        style={{ color: WEB.text }}
                      >
                        {communityStep.title}
                      </h2>
                      <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                        {communityStep.description}
                      </p>
                      {communityStep.aside && (
                        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                          {communityStep.aside}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Big CTA buttons — same style across all community steps */}
                {isGitHubCommunityStep && (
                  <div className="pt-6">
                    <a
                      href={GITHUB_REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-between gap-4 rounded-full px-5 py-5 sm:px-6 sm:py-6 transition-all hover:-translate-y-0.5"
                      style={{ background: WEB.accentBg, border: `1px solid ${WEB.border}` }}
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ background: WEB.bgCard }}>
                          <Star className="size-5 fill-current" style={{ color: WEB.accent }} />
                        </span>
                        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                          <span className="truncate text-base font-semibold sm:text-lg" style={{ color: WEB.text }}>Star Cabinet on GitHub</span>
                          <span className="text-sm" style={{ color: WEB.textSecondary }}>Help more people find the community</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 rounded-full px-3 py-1 text-sm font-semibold sm:inline-flex" style={{ background: WEB.bgWarm, color: WEB.accent }}>
                        {starsLabel}
                      </span>
                    </a>
                  </div>
                )}

                {communityStep.eyebrow === "Discord" && (
                  <div className="pt-6">
                    <a
                      href={DISCORD_SUPPORT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-between gap-4 rounded-full px-5 py-5 sm:px-6 sm:py-6 transition-all hover:-translate-y-0.5"
                      style={{ background: "#ECEAFD", border: "1px solid #D8D4F7" }}
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ background: WEB.bgCard }}>
                          <DiscordIcon className="size-5" style={{ color: "#5865F2" }} />
                        </span>
                        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                          <span className="truncate text-base font-semibold sm:text-lg" style={{ color: WEB.text }}>Join the Discord</span>
                          <span className="text-sm" style={{ color: WEB.textSecondary }}>Chat with the people building Cabinet</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 rounded-full px-3 py-1 text-sm font-semibold sm:inline-flex" style={{ background: "#D8D4F7", color: "#5865F2" }}>
                        Join
                      </span>
                    </a>
                  </div>
                )}

                {communityStep.eyebrow === "Cabinet Cloud" && (
                  <div className="pt-6">
                    <a
                      href={CABINET_CLOUD_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-between gap-4 rounded-full px-5 py-5 sm:px-6 sm:py-6 transition-all hover:-translate-y-0.5"
                      style={{ background: WEB.accentBg, border: `1px solid ${WEB.border}` }}
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ background: WEB.bgCard }}>
                          <Cloud className="size-5" style={{ color: WEB.accent }} />
                        </span>
                        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                          <span className="truncate text-base font-semibold sm:text-lg" style={{ color: WEB.text }}>Join the Cabinet Cloud waitlist</span>
                          <span className="text-sm" style={{ color: WEB.textSecondary }}>Get the hosted version when it&apos;s ready</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 rounded-full px-3 py-1 text-sm font-semibold sm:inline-flex" style={{ background: WEB.bgWarm, color: WEB.accent }}>
                        Waitlist
                      </span>
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(step - 1)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                {step < COMMUNITY_END_STEP ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={launching}
                    className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
                    style={{ background: WEB.accent }}
                  >
                    {communityStep.nextLabel}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(COMMUNITY_END_STEP + 1)}
                    className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
                    style={{ background: WEB.accent }}
                  >
                    Next
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 7: Launch — Summary + data directory */}
          {step === COMMUNITY_END_STEP + 1 && (
            <div className="mx-auto flex max-w-4xl flex-col gap-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-logo text-2xl tracking-tight italic">
                  Start your <span style={{ color: WEB.accent }}>Cabinet</span>
                </h1>
              </div>

              <div
                className="rounded-2xl overflow-hidden flex flex-col lg:flex-row lg:h-[280px]"
                style={{
                  background: WEB.bgCard,
                  border: `1px solid ${WEB.border}`,
                  boxShadow: "0 1px 3px rgba(59, 47, 47, 0.04), 0 8px 30px rgba(59, 47, 47, 0.04)",
                }}
              >
                {/* Left half — Company + agents */}
                <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                  <div className="space-y-1">
                    <h2 className="font-logo text-xl tracking-tight italic" style={{ color: WEB.text }}>
                      {answers.workspaceName || "Your Cabinet"}
                    </h2>
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: WEB.textTertiary }}
                    >
                      {answers.description || "Knowledge base + AI team"}
                    </p>
                  </div>

                  <div
                    className="h-px w-full"
                    style={{ background: WEB.borderLight }}
                  />

                  <div className="flex flex-col gap-1">
                    {suggestedAgents.filter((a) => a.checked).map((a) => (
                      <div
                        key={a.slug}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                        style={{ background: WEB.bgWarm }}
                      >
                        <span className="text-sm">{a.emoji}</span>
                        <p className="text-[12px] font-medium flex-1" style={{ color: WEB.text }}>
                          {a.name}
                        </p>
                        <span className="relative flex size-2.5">
                          <span
                            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
                            style={{ background: "#22c55e" }}
                          />
                          <span
                            className="relative inline-flex size-2.5 rounded-full"
                            style={{ background: "#22c55e" }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right half — Animated agent chat preview */}
                <div
                  className="relative flex-1 flex flex-col overflow-hidden"
                  style={{ background: WEB.bgWarm, borderLeft: `1px solid ${WEB.borderLight}` }}
                >
                  {/* Channel header */}
                  <div
                    className="shrink-0 px-4 py-2 flex items-center gap-2"
                    style={{ background: WEB.bgWarm, borderBottom: `1px solid ${WEB.borderLight}` }}
                  >
                    <span className="text-[11px] font-semibold" style={{ color: WEB.textTertiary }}>#</span>
                    <span className="text-[11px] font-semibold" style={{ color: WEB.text }}>general</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 pb-2 space-y-0.5">
                    <AgentChatPreview
                      agents={suggestedAgents.filter((a) => a.checked)}
                      workspaceName={answers.workspaceName}
                      homeName={answers.homeName || (answers.name ? `${answers.name}'s Home` : "Home")}
                      roomType={answers.roomType}
                    />
                  </div>
                </div>
              </div>


              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(COMMUNITY_END_STEP)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <button
                  onClick={launch}
                  disabled={launchDisabled}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                  style={{ background: WEB.accent }}
                >
                  {launching ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      Launch Cabinet
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
