"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ScheduleCalendar,
  type CalendarMode,
} from "@/components/cabinets/schedule-calendar";
import { ScheduleList } from "@/components/cabinets/schedule-list";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";

type ScheduleSubView = "calendar" | "list";

/**
 * Thin v2 wrapper around the existing ScheduleCalendar + ScheduleList primitives
 * (reused from tasks-board.tsx). Phase 1 keeps controls minimal — no density
 * slider, no visible-hours dropdown, no fullscreen, no filter dropdowns.
 */
export function ScheduleView({
  agents,
  jobs,
  conversations,
  onConversationClick,
}: {
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  conversations: ConversationMeta[];
  onConversationClick: (id: string) => void;
}) {
  const [sub, setSub] = useState<ScheduleSubView>("calendar");
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());

  // ScheduleCalendar uses this map to de-duplicate cron-scheduled events
  // whose manual run already exists (key: `${agentSlug}|${cronExpr}|${time}`).
  // We just pass a map keyed by `${agentSlug}|${conversationId}` so any
  // collisions are graceful; the calendar's dedup is a best-effort filter.
  const scheduledConversationsMap = useMemo(() => {
    const m = new Map<string, ConversationMeta>();
    for (const c of conversations) m.set(`${c.agentSlug}|${c.id}`, c);
    return m;
  }, [conversations]);

  function navigate(direction: -1 | 0 | 1) {
    if (direction === 0) {
      setAnchor(new Date());
      return;
    }
    setAnchor((prev) => {
      const next = new Date(prev);
      if (mode === "day") next.setDate(next.getDate() + direction);
      else if (mode === "week") next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  }

  const label = useMemo(() => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    if (mode === "day") {
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    if (mode === "month") {
      return `${months[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }
    const s = new Date(anchor);
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return s.getMonth() === e.getMonth()
      ? `${months[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
      : `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}`;
  }, [anchor, mode]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
        <div className="flex items-center rounded-lg border border-border/60 p-0.5">
          <SubButton
            active={sub === "calendar"}
            onClick={() => setSub("calendar")}
            icon={Calendar}
            label="Calendar"
          />
          <SubButton
            active={sub === "list"}
            onClick={() => setSub("list")}
            icon={LayoutList}
            label="List"
          />
        </div>

        {sub === "calendar" && (
          <>
            <div className="flex items-center rounded-lg border border-border/60 p-0.5">
              {(["day", "week", "month"] as CalendarMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                    mode === m
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate(0)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <span className="text-[13px] font-medium text-foreground">{label}</span>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {sub === "calendar" ? (
          <ScheduleCalendar
            mode={mode}
            anchor={anchor}
            agents={agents}
            jobs={jobs}
            manualConversations={conversations}
            scheduledConversations={scheduledConversationsMap}
            onEventClick={(ev) => {
              if (ev.sourceType === "manual" && ev.conversationId) {
                onConversationClick(ev.conversationId);
              }
            }}
            onDayClick={(date) => {
              setMode("day");
              setAnchor(date);
            }}
          />
        ) : (
          <div className="mx-auto w-full max-w-3xl p-4">
            <ScheduleList
              agents={agents}
              jobs={jobs}
              manualConversations={conversations}
              onManualClick={(c) => onConversationClick(c.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SubButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Calendar;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
