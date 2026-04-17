"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getScheduleEvents,
  getViewRange,
  getAgentColor,
  type ScheduleEvent,
} from "@/lib/agents/cron-compute";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ─── Constants ─── */

const HOUR_HEIGHT = 56; // px per hour row
const PILL_HEIGHT = 22;
const DOT_SIZE = 10; // crowded-slot circles
const DOT_ROW_HEIGHT = DOT_SIZE + 4;
const MAX_PILLS_MULTIDAY = 2;
const MAX_PILLS_MONTH = 3;
const VISIBLE_START_HOUR = 5; // 5 AM
const VISIBLE_END_HOUR = 23; // 11 PM
const TOTAL_HOURS = VISIBLE_END_HOUR - VISIBLE_START_HOUR;
const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ─── Helpers ─── */

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ─── Types ─── */

export type CalendarMode = "day" | "week" | "month";

interface ScheduleCalendarProps {
  mode: CalendarMode;
  anchor: Date;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  fullscreen?: boolean;
  onEventClick: (event: ScheduleEvent) => void;
  onDayClick: (date: Date) => void;
}

/* ─── Event pill ─── */

function EventPill({
  event,
  onClick,
  showTime,
  wide,
}: {
  event: ScheduleEvent;
  onClick: () => void;
  showTime?: boolean;
  wide?: boolean;
}) {
  const color = getAgentColor(event.agentSlug);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${event.label} · ${event.agentName} · ${formatTime(event.time)}`}
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 text-left transition-all",
        "hover:ring-1 hover:ring-foreground/20 hover:shadow-sm",
        !event.enabled && "opacity-40"
      )}
      style={{
        height: PILL_HEIGHT,
        backgroundColor: event.enabled ? color.bg : undefined,
        color: event.enabled ? color.text : undefined,
      }}
    >
      <span className="shrink-0 text-[10px] leading-none">{event.agentEmoji}</span>
      <span className={cn("truncate text-[10px] font-medium", wide && "text-[11px]")}>
        {event.label}
      </span>
      {showTime && (
        <span className="ml-auto shrink-0 text-[9px] opacity-70">
          {formatTime(event.time)}
        </span>
      )}
    </button>
  );
}

/* ─── Event dot (crowded slots) ─── */

function EventDot({
  event,
  onClick,
  now,
  size = DOT_SIZE,
}: {
  event: ScheduleEvent;
  onClick: () => void;
  now: Date;
  size?: number;
}) {
  const color = getAgentColor(event.agentSlug);
  const isPast = event.time.getTime() < now.getTime();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            aria-label={`${event.label} · ${formatTime(event.time)}`}
            className={cn(
              "shrink-0 rounded-full outline-none transition-all",
              "hover:ring-2 hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40",
              !event.enabled && "opacity-40"
            )}
            style={{
              width: size,
              height: size,
              backgroundColor: event.enabled ? color.bg : "transparent",
              borderWidth: event.enabled ? 0 : 1,
              borderStyle: "dashed",
              borderColor: color.bg,
            }}
          />
        }
      />
      <TooltipContent className="flex flex-col items-start gap-0.5 px-2.5 py-1.5 text-left">
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <span>{event.agentEmoji}</span>
          <span>{event.label}</span>
        </div>
        <div className="text-[10px] text-background/70">
          {event.agentName} · {formatTime(event.time)}
          {isPast ? " · past" : " · upcoming"}
          {!event.enabled && " · disabled"}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/* ─── Week / Day view ─── */

function TimeGridView({
  events,
  days,
  fullscreen,
  onEventClick,
}: {
  events: ScheduleEvent[];
  days: Date[];
  fullscreen?: boolean;
  onEventClick: (event: ScheduleEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const isMultiDay = days.length > 1;

  // Update current time
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Auto-scroll to current hour
  useEffect(() => {
    const hour = new Date().getHours();
    const target = Math.max(0, (hour - VISIBLE_START_HOUR - 1) * HOUR_HEIGHT);
    scrollRef.current?.scrollTo({ top: target, behavior: "smooth" });
  }, [days[0]?.getTime()]);

  // Group events by day column → per 15-min slot
  // Week (multi-day): slots with too many events collapse into dots.
  // Day (single): always render pills, expand column vertically if needed so nothing overlaps.
  const maxPills = isMultiDay ? MAX_PILLS_MULTIDAY : Number.POSITIVE_INFINITY;
  const dayColumns = useMemo(() => {
    return days.map((day) => {
      const dayEvents = events.filter((e) => isSameDay(e.time, day));

      // Group events by 15-min slot to handle overlaps
      const slotMap = new Map<number, ScheduleEvent[]>();
      for (const e of dayEvents) {
        const slotKey = Math.floor((e.time.getHours() * 60 + e.time.getMinutes()) / 15);
        if (!slotMap.has(slotKey)) slotMap.set(slotKey, []);
        slotMap.get(slotKey)!.push(e);
      }

      type Bucket =
        | { mode: "pills"; top: number; events: ScheduleEvent[] }
        | { mode: "dots"; top: number; events: ScheduleEvent[] };

      const buckets: Bucket[] = [];
      for (const [, slotEvents] of slotMap) {
        const first = slotEvents[0];
        const hour = first.time.getHours();
        const minute = first.time.getMinutes();
        const top = (hour - VISIBLE_START_HOUR) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
        const sorted = [...slotEvents].sort(
          (a, b) => a.time.getTime() - b.time.getTime()
        );
        if (sorted.length > maxPills) {
          buckets.push({ mode: "dots", top, events: sorted });
        } else {
          buckets.push({ mode: "pills", top, events: sorted });
        }
      }

      // Day view: walk buckets in time order and shift later ones down so tall
      // stacks never overlap the next slot. Single column, so horizontal overlap
      // isn't an option — grow vertically.
      let columnHeight = TOTAL_HOURS * HOUR_HEIGHT;
      if (!isMultiDay) {
        buckets.sort((a, b) => a.top - b.top);
        let cursor = 0;
        for (const b of buckets) {
          if (b.top < cursor) b.top = cursor;
          const count = b.events.length;
          const h =
            b.mode === "pills"
              ? count * PILL_HEIGHT + Math.max(0, count - 1) * 2
              : DOT_ROW_HEIGHT;
          cursor = b.top + h + 4;
        }
        columnHeight = Math.max(columnHeight, cursor);
      }

      return { day, buckets, columnHeight };
    });
  }, [days, events, maxPills, isMultiDay]);

  const gridHeight = Math.max(
    TOTAL_HOURS * HOUR_HEIGHT,
    ...dayColumns.map((c) => c.columnHeight)
  );

  // Current time position
  const nowTop = (now.getHours() - VISIBLE_START_HOUR) * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT;
  const showNowLine = now.getHours() >= VISIBLE_START_HOUR && now.getHours() < VISIBLE_END_HOUR;
  const todayIndex = days.findIndex((d) => isSameDay(d, now));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Column headers */}
      <div
        className="grid border-b border-border/50 bg-muted/20"
        style={{ gridTemplateColumns: isMultiDay ? `56px repeat(${days.length}, 1fr)` : "56px 1fr" }}
      >
        <div className="border-r border-border/30 px-2 py-2" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, now);
          return (
            <div
              key={i}
              className={cn(
                "border-r border-border/30 px-2 py-2 text-center last:border-r-0",
                isToday && "bg-amber-500/[0.06]"
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {DAY_NAMES_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}
              </div>
              <div
                className={cn(
                  "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                )}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: isMultiDay ? `56px repeat(${days.length}, 1fr)` : "56px 1fr",
            height: gridHeight,
          }}
        >
          {/* Hour labels column */}
          <div className="relative border-r border-border/30">
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-[10px] tabular-nums text-muted-foreground/50"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {formatHour(VISIBLE_START_HOUR + i)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dayColumns.map(({ day, buckets }, colIdx) => {
            const isToday = isSameDay(day, now);
            return (
              <div
                key={colIdx}
                className={cn(
                  "relative border-r border-border/30 last:border-r-0",
                  isToday && "bg-amber-500/[0.03]"
                )}
              >
                {/* Hour grid lines */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-border/20"
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}

                {/* Event buckets */}
                {buckets.map((bucket, bIdx) => {
                  if (bucket.top < 0) return null;
                  if (bucket.mode === "pills") {
                    return (
                      <div
                        key={bIdx}
                        className="absolute left-0.5 right-0.5 flex flex-col gap-[2px]"
                        style={{ top: bucket.top }}
                      >
                        {bucket.events.map((event) => (
                          <EventPill
                            key={event.id}
                            event={event}
                            onClick={() => onEventClick(event)}
                            showTime={!isMultiDay}
                            wide={!isMultiDay}
                          />
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={bIdx}
                      className="absolute left-0.5 right-0.5 flex flex-wrap items-start gap-[3px]"
                      style={{ top: bucket.top, minHeight: DOT_ROW_HEIGHT }}
                    >
                      {bucket.events.map((event) => (
                        <EventDot
                          key={event.id}
                          event={event}
                          onClick={() => onEventClick(event)}
                          now={now}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Current time line */}
          {showNowLine && todayIndex >= 0 && (
            <div
              className="pointer-events-none absolute z-10"
              style={{
                top: nowTop,
                left: isMultiDay ? `calc(56px + ${(todayIndex / days.length) * 100}% * ${days.length} / ${days.length})` : 56,
                right: 0,
              }}
            >
              {/* Full-width red line spanning today column to the right */}
            </div>
          )}
        </div>

        {/* Current time red line (spans full width for visibility) */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute left-[56px] right-0 z-10"
            style={{ top: nowTop }}
          >
            <div className="h-px w-full bg-red-500/60" />
            <div className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Month view ─── */

function MonthView({
  events,
  anchor,
  onEventClick,
  onDayClick,
}: {
  events: ScheduleEvent[];
  anchor: Date;
  onEventClick: (event: ScheduleEvent) => void;
  onDayClick: (date: Date) => void;
}) {
  const now = new Date();
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Build calendar grid (start on Monday)
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon=0
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;

  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, month, 1 - startDow + i);
    cells.push(d);
  }

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const key = `${e.time.getFullYear()}-${e.time.getMonth()}-${e.time.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  // Collapse high-frequency events per day
  function getDayDisplay(day: Date) {
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const dayEvents = eventsByDay.get(key) || [];

    // Group by source to detect high-frequency
    const bySource = new Map<string, ScheduleEvent[]>();
    for (const e of dayEvents) {
      if (!bySource.has(e.sourceId)) bySource.set(e.sourceId, []);
      bySource.get(e.sourceId)!.push(e);
    }

    const display: { event: ScheduleEvent; count?: number }[] = [];
    for (const [, sourceEvents] of bySource) {
      if (sourceEvents.length > 8) {
        display.push({ event: sourceEvents[0], count: sourceEvents.length });
      } else {
        for (const e of sourceEvents) display.push({ event: e });
      }
    }

    display.sort((a, b) => a.event.time.getTime() - b.event.time.getTime());
    return display;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-border/50 bg-muted/20">
        {DAY_NAMES_SHORT.map((name) => (
          <div
            key={name}
            className="border-r border-border/30 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 last:border-r-0"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, now);
          const display = getDayDisplay(day);
          const maxShow = MAX_PILLS_MONTH;

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDayClick(day);
                }
              }}
              className={cn(
                "min-h-[90px] cursor-pointer border-b border-r border-border/20 p-1.5 text-left transition-colors last:border-r-0",
                "hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30",
                !isCurrentMonth && "opacity-40",
                isToday && "bg-amber-500/[0.05]"
              )}
            >
              <div
                className={cn(
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                )}
              >
                {day.getDate()}
              </div>
              {display.length > maxShow ? (
                <div
                  className="flex flex-wrap items-start gap-[3px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {display.map(({ event, count }) => (
                    <div key={event.id} className="relative">
                      <EventDot
                        event={event}
                        onClick={() => onEventClick(event)}
                        now={now}
                      />
                      {count && count > 1 && (
                        <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-foreground/80 px-1 text-[7px] font-bold leading-[10px] text-background">
                          {count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {display.map(({ event, count }) => {
                    const color = getAgentColor(event.agentSlug);
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium",
                          !event.enabled && "opacity-40"
                        )}
                        style={{
                          backgroundColor: event.enabled ? color.bg : undefined,
                          color: event.enabled ? color.text : undefined,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                      >
                        <span className="shrink-0 text-[8px]">{event.agentEmoji}</span>
                        <span className="truncate">
                          {event.label}
                          {count ? ` (${count}x)` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/* ─── Main calendar component ─── */

export function ScheduleCalendar({
  mode,
  anchor,
  agents,
  jobs,
  fullscreen,
  onEventClick,
  onDayClick,
}: ScheduleCalendarProps) {
  const { start, end } = useMemo(() => getViewRange(mode, anchor), [mode, anchor]);

  const events = useMemo(
    () => getScheduleEvents(agents, jobs, start, end),
    [agents, jobs, start, end]
  );

  // Build day list for week/day views
  const days = useMemo(() => {
    if (mode === "month") return [];
    const result: Date[] = [];
    const cursor = new Date(start);
    while (cursor < end) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [mode, start, end]);

  if (mode === "month") {
    return (
      <TooltipProvider delay={120}>
        <MonthView
          events={events}
          anchor={anchor}
          onEventClick={onEventClick}
          onDayClick={onDayClick}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delay={120}>
      <TimeGridView
        events={events}
        days={days}
        fullscreen={fullscreen}
        onEventClick={onEventClick}
      />
    </TooltipProvider>
  );
}
