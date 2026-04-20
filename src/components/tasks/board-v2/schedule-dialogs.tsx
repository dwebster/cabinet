"use client";

import { useState } from "react";
import { HeartPulse, Loader2, Save, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SchedulePicker } from "@/components/mission-control/schedule-picker";
import { NewRoutineDialog } from "@/components/agents/new-routine-dialog";

export interface JobDialogState {
  agentSlug: string;
  agentName: string;
  cabinetPath: string;
  agentRole?: string;
  draft: {
    id: string;
    name: string;
    schedule: string;
    prompt: string;
    enabled: boolean;
  };
}

export interface HeartbeatDialogState {
  agentSlug: string;
  agentName: string;
  cabinetPath: string;
  heartbeat: string;
  active: boolean;
}

/**
 * Thin wrapper around the shared `NewRoutineDialog` so the board-v2
 * schedule view can open the consolidated editor without changing its
 * own API. `onStateChange` is accepted for source-compat but ignored —
 * the inner dialog owns its own draft state.
 */
export function ScheduleJobDialog({
  state,
  onClose,
  onRefresh,
}: {
  state: JobDialogState | null;
  /** Accepted for source-compat; not used (inner dialog owns the draft). */
  onStateChange?: (next: JobDialogState | null) => void;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
}) {
  if (!state) return null;
  return (
    <NewRoutineDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      agent={{
        slug: state.agentSlug,
        name: state.agentName,
        role: state.agentRole,
        cabinetPath: state.cabinetPath,
      }}
      existingJob={state.draft}
      onSaved={() => {
        onClose();
        void onRefresh();
      }}
      onDeleted={() => {
        onClose();
        void onRefresh();
      }}
    />
  );
}

/**
 * Inline heartbeat-editor dialog. Edits the agent persona's heartbeat cron
 * and Active flag. Port of legacy tasks-board.tsx:1800-1838.
 */
export function ScheduleHeartbeatDialog({
  state,
  onStateChange,
  onClose,
  onRefresh,
}: {
  state: HeartbeatDialogState | null;
  onStateChange: (next: HeartbeatDialogState | null) => void;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!state) return null;

  async function runNow() {
    if (!state) return;
    setBusy(true);
    try {
      await fetch(`/api/agents/personas/${state.agentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", cabinetPath: state.cabinetPath }),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!state) return;
    setSaving(true);
    try {
      await fetch(`/api/agents/personas/${state.agentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heartbeat: state.heartbeat,
          active: state.active,
          cabinetPath: state.cabinetPath,
        }),
      });
      onClose();
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-10">
            <DialogTitle className="flex items-center gap-2">
              <HeartPulse className="size-4 text-pink-400" />
              Heartbeat
              <span className="text-[11px] font-normal text-muted-foreground">
                · {state.agentName}
              </span>
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => void runNow()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Zap className="size-3.5" />
              )}
              Run now
            </Button>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Schedule
            </span>
            <SchedulePicker
              value={state.heartbeat}
              onChange={(cron) => onStateChange({ ...state, heartbeat: cron })}
            />
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={state.active}
                onChange={(e) => onStateChange({ ...state, active: e.target.checked })}
                className="h-3.5 w-3.5 cursor-pointer"
              />
              Active
            </label>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => void save()}
                disabled={saving}
              >
                <Save className="size-3.5" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
