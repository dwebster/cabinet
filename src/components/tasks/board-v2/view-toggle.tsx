"use client";

import { CalendarRange, KanbanSquare, LayoutList, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BoardViewMode = "kanban" | "list" | "schedule";

const OPTIONS: { key: BoardViewMode; label: string; icon: LucideIcon }[] = [
  { key: "kanban", label: "Kanban", icon: KanbanSquare },
  { key: "list", label: "List", icon: LayoutList },
  { key: "schedule", label: "Schedule", icon: CalendarRange },
];

export function ViewToggle({
  value,
  onChange,
}: {
  value: BoardViewMode;
  onChange: (v: BoardViewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-border/60 p-0.5">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
