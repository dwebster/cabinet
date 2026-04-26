"use client";

import { type ReactNode } from "react";
import { ArrowUpRight, HelpCircle, MessageCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { requestShowTour } from "@/components/onboarding/tour/use-tour";
import { MockupSidebar } from "@/components/onboarding/tour/mockup-sidebar";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { cn } from "@/lib/utils";

const DISCORD_SUPPORT_URL = "https://discord.gg/hJa5TRTbTH";

type HelpItemType = "demo" | "video" | "text";

interface HelpItem {
  id: string;
  title: ReactNode;
  description: string;
  type: HelpItemType;
  visual: ReactNode;
  onActivate: () => void;
}

function TourVisual() {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: P.paperWarm }}
    >
      <div style={{ width: 280 }}>
        <MockupSidebar
          activeTab={null}
          title="Cabinet"
          headerBadge=""
          hideBody
        />
      </div>
    </div>
  );
}

const HELP_ITEMS: HelpItem[] = [
  {
    id: "tour",
    title: (
      <>
        Meet your <span style={{ color: P.accent }}>Cabinet</span>.
      </>
    ),
    description: "Your AI team. Your knowledge base. One place.",
    type: "demo",
    visual: <TourVisual />,
    onActivate: () => requestShowTour(),
  },
];

function HelpCard({ item }: { item: HelpItem }) {
  return (
    <button
      type="button"
      onClick={item.onActivate}
      className={cn(
        "group relative grid w-full grid-cols-1 overflow-hidden rounded-2xl text-left",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-22px_rgba(59,47,47,0.45)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
        "md:grid-cols-[1.15fr_1fr]",
      )}
      style={{
        background: P.paper,
        border: `1px solid ${P.border}`,
      }}
    >
      <div className="flex flex-col justify-center gap-4 p-8 md:p-10 lg:p-12">
        <h3
          className="font-logo italic tracking-tight text-[40px] leading-[1.05] sm:text-[48px] lg:text-[56px]"
          style={{ color: P.text }}
        >
          {item.title}
        </h3>

        <p
          className="font-body-serif text-[16px] leading-relaxed sm:text-[17px]"
          style={{ color: P.textSecondary }}
        >
          {item.description}
        </p>

        <span
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] transition-transform duration-200 group-hover:translate-x-0.5"
          style={{ color: P.accent }}
        >
          Watch it
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>

      <div
        className="relative flex min-h-[220px] items-center justify-center md:min-h-[300px]"
        style={{ borderLeft: `1px solid ${P.borderLight}` }}
      >
        {item.visual}
      </div>
    </button>
  );
}

export function HelpPage() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border transition-[padding] duration-200"
        style={{ paddingLeft: `calc(1rem + var(--sidebar-toggle-offset, 0px))` }}
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Help</h2>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              How To
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-foreground">
              Learn how Cabinet works
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              Short demos, videos, and write-ups for getting the most out of Cabinet.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {HELP_ITEMS.map((item) => (
              <HelpCard key={item.id} item={item} />
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-border bg-muted/40 p-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                  Didn&apos;t find what you&apos;re looking for?
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  We&apos;re in the Discord — come say hi, ask questions, share what you&apos;re building.
                </p>
              </div>
              <a
                href={DISCORD_SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-[#5865F2]/25 bg-[#5865F2]/10 px-4 py-2 text-[12.5px] font-semibold text-[#5865F2] transition-all hover:-translate-y-px hover:border-[#5865F2]/40 hover:bg-[#5865F2]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
              >
                <MessageCircle className="h-4 w-4" />
                Join the Discord
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
