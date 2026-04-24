"use client";

import {
  FileText,
  FileType,
  Image as ImageIcon,
  Table,
  Presentation,
  AppWindow,
  Code,
  GitBranch,
  ChevronRight,
  ChevronDown,
  AtSign,
} from "lucide-react";
import { MockupSidebar } from "./mockup-sidebar";
import { TOUR_PALETTE as P } from "./palette";

type IconComponent = typeof FileText;

interface TreeRow {
  label: string;
  icon: IconComponent;
  iconColor: string;
  indent: number;
  expanded?: boolean;
}

// Icon colors — slightly muted versions tuned for the cream paper
// background so they don't scream off the warm palette.
const ROWS: TreeRow[] = [
  { label: "Getting Started", icon: ChevronDown as IconComponent, iconColor: P.textTertiary, indent: 0, expanded: true },
  { label: "Welcome.md", icon: FileText, iconColor: "#5A7FB5", indent: 1 },
  { label: "Market Research", icon: ChevronRight as IconComponent, iconColor: P.textTertiary, indent: 0 },
  { label: "Competitors.md", icon: FileText, iconColor: "#5A7FB5", indent: 1 },
  { label: "Industry Report.pdf", icon: FileType, iconColor: "#C26B6B", indent: 1 },
  { label: "Logo v3.png", icon: ImageIcon, iconColor: "#D08BA6", indent: 1 },
  { label: "Revenue 2026.xlsx", icon: Table, iconColor: "#5A9E7B", indent: 1 },
  { label: "Pitch Deck.pptx", icon: Presentation, iconColor: "#D18A55", indent: 1 },
  { label: "Landing Page", icon: AppWindow, iconColor: "#5AA39B", indent: 1 },
  { label: "cabinet-repo", icon: Code, iconColor: "#8B7FB5", indent: 1 },
  { label: "Roadmap (Google)", icon: GitBranch, iconColor: P.accent, indent: 1 },
];

export function SlideData() {
  return (
    <div className="grid h-full grid-cols-[minmax(260px,320px)_1fr] gap-10 lg:gap-14 items-center">
      <div className="h-[440px] w-full">
        <MockupSidebar activeTab="data" viewTransitionName="cabinet-card">
          <div className="relative h-full px-2.5 py-2">
            {ROWS.map((row, i) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[12px] opacity-0"
                  style={{
                    color: P.text,
                    paddingLeft: `${row.indent * 12 + 6}px`,
                    animation: `cabinet-tour-fade-up 0.35s ease-out forwards`,
                    animationDelay: `${120 + i * 90}ms`,
                  }}
                >
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={
                      row.indent > 0
                        ? {
                            color: row.iconColor,
                            animation: `cabinet-tour-icon-pulse 0.8s ease-in-out`,
                            animationDelay: `${1400 + i * 110}ms`,
                          }
                        : { color: row.iconColor }
                    }
                  />
                  <span className="truncate">{row.label}</span>
                </div>
              );
            })}

            {/* Floating @ mention chip */}
            <div
              className="absolute left-1/2 top-[58%] -translate-x-1/2 opacity-0 pointer-events-none"
              style={{
                animation: "cabinet-tour-mention-float 3s ease-in-out forwards",
                animationDelay: "3200ms",
              }}
            >
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-lg backdrop-blur"
                style={{
                  color: P.accentWarm,
                  background: P.accentBg,
                  border: `1px solid ${P.borderDark}`,
                }}
              >
                <AtSign className="h-3 w-3" />
                <span>Market Research</span>
              </div>
            </div>
          </div>
        </MockupSidebar>
      </div>

      {/* Copy */}
      <div className="flex flex-col gap-5 max-w-lg">
        <span
          className="inline-block w-fit rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] opacity-0"
          style={{
            color: P.accent,
            background: P.accentBg,
            border: `1px solid ${P.borderDark}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "60ms",
          }}
        >
          01 &middot; DATA
        </span>
        <h2
          className="font-logo text-4xl italic tracking-tight opacity-0 lg:text-5xl"
          style={{
            color: P.text,
            animation: "cabinet-tour-fade-up 0.5s ease-out forwards",
            animationDelay: "180ms",
          }}
        >
          Your <span style={{ color: P.accent }}>single source</span> of truth.
        </h2>
        <p
          className="font-body-serif text-base leading-relaxed opacity-0 lg:text-lg"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.5s ease-out forwards",
            animationDelay: "320ms",
          }}
        >
          Every page, file, and repo — one place your team and your AI both read from.
          Markdown, PDFs, spreadsheets, slides, images, linked repos, embedded apps,
          Google Docs. Mention any of it with{" "}
          <span className="font-mono" style={{ color: P.accent }}>@</span>.
        </p>
      </div>
    </div>
  );
}
