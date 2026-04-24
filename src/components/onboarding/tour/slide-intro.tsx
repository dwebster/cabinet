"use client";

import { MockupSidebar } from "./mockup-sidebar";
import { TOUR_PALETTE as P } from "./palette";

export function SlideIntro() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <span
          className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] opacity-0"
          style={{
            color: P.accent,
            background: P.accentBg,
            border: `1px solid ${P.borderDark}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "60ms",
          }}
        >
          WELCOME
        </span>
        <h2
          className="font-logo text-5xl tracking-tight italic opacity-0 lg:text-6xl"
          style={{
            color: P.text,
            animation: "cabinet-tour-fade-up 0.55s ease-out forwards",
            animationDelay: "160ms",
          }}
        >
          Meet your <span style={{ color: P.accent }}>Cabinet</span>.
        </h2>
        <p
          className="font-body-serif text-lg leading-relaxed opacity-0 lg:text-xl"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.55s ease-out forwards",
            animationDelay: "320ms",
          }}
        >
          Your AI team. Your knowledge base. One place.
        </p>
      </div>

      <div
        className="w-[300px] opacity-0"
        style={{
          animation: "cabinet-tour-pop-in 0.55s ease-out forwards",
          animationDelay: "540ms",
        }}
      >
        <MockupSidebar
          activeTab={null}
          title="Cabinet"
          headerBadge="All"
          hideBody
          tabsPopIn
          viewTransitionName="cabinet-card"
        />
      </div>
    </div>
  );
}
