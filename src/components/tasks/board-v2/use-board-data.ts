"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { conversationMetaToTaskMeta } from "@/lib/agents/conversation-to-task-view";
import type { ConversationMeta } from "@/types/conversations";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetOverview, CabinetAgentSummary, CabinetJobSummary, CabinetVisibilityMode } from "@/types/cabinets";
import { deriveLane, laneSort, type LaneKey } from "./lane-rules";

interface Options {
  cabinetPath: string;
  visibilityMode?: CabinetVisibilityMode;
}

export interface BoardData {
  overview: CabinetOverview | null;
  /** Raw conversations (source of truth for tasks + schedule list). */
  conversations: ConversationMeta[];
  /** Derived UI tasks (one per conversation). */
  tasks: TaskMeta[];
  /** Kanban lane buckets. */
  byLane: Record<LaneKey, TaskMeta[]>;
  /** Agent lookup for pill rendering. */
  agentsBySlug: Map<string, CabinetAgentSummary>;
  /** Scheduled jobs (for Schedule view). */
  jobs: CabinetJobSummary[];
  loading: boolean;
  refreshing: boolean;
  now: number;
  refresh: () => Promise<void>;
}

/** Re-derive lanes every 60s so the "Just Finished ≤1h" boundary sweeps. */
const NOW_TICK_MS = 60_000;

export function useBoardData({ cabinetPath, visibilityMode = "own" }: Options): BoardData {
  const [overview, setOverview] = useState<CabinetOverview | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mountedRef = useRef(true);

  const refreshOverview = useCallback(async () => {
    const params = new URLSearchParams({ path: cabinetPath });
    if (visibilityMode !== "own") params.set("visibilityMode", visibilityMode);
    const res = await fetch(`/api/cabinets/overview?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("overview fetch failed");
    const data = (await res.json()) as CabinetOverview;
    if (mountedRef.current) setOverview(data);
  }, [cabinetPath, visibilityMode]);

  const refreshConversations = useCallback(async () => {
    const params = new URLSearchParams({ cabinetPath, limit: "400" });
    if (visibilityMode !== "own") params.set("visibilityMode", visibilityMode);
    const res = await fetch(`/api/agents/conversations?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("conversations fetch failed");
    const data = (await res.json()) as { conversations: ConversationMeta[] };
    if (mountedRef.current) setConversations(data.conversations ?? []);
  }, [cabinetPath, visibilityMode]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshOverview(), refreshConversations()]);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [refreshOverview, refreshConversations]);

  // Initial load + SSE subscription + tick
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    Promise.all([refreshOverview(), refreshConversations()])
      .catch((err) => {
        console.error("[board-v2] initial load failed", err);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    const es = new EventSource("/api/agents/conversations/events");
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as { type?: string };
        if (!event.type || event.type === "ping") return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void refreshConversations();
        }, 200);
      } catch {
        // ignore malformed events
      }
    };

    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    const tick = setInterval(() => setNow(Date.now()), NOW_TICK_MS);

    return () => {
      mountedRef.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      es.close();
      window.removeEventListener("focus", onFocus);
      clearInterval(tick);
    };
  }, [refresh, refreshOverview, refreshConversations]);

  const tasks = useMemo(() => conversations.map(conversationMetaToTaskMeta), [conversations]);

  // Bucket `now` to the minute so byLane memo is stable between ticks.
  const nowBucket = Math.floor(now / NOW_TICK_MS);

  const byLane = useMemo(() => {
    const map: Record<LaneKey, TaskMeta[]> = {
      inbox: [], needs: [], running: [], done: [], archive: [],
    };
    for (const t of tasks) {
      map[deriveLane(t, now)].push(t);
    }
    for (const lane of Object.keys(map) as LaneKey[]) {
      map[lane].sort(laneSort(lane));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, nowBucket]);

  const agentsBySlug = useMemo(() => {
    const m = new Map<string, CabinetAgentSummary>();
    for (const agent of overview?.agents ?? []) m.set(agent.slug, agent);
    return m;
  }, [overview]);

  return {
    overview,
    conversations,
    tasks,
    byLane,
    agentsBySlug,
    jobs: overview?.jobs ?? [],
    loading,
    refreshing,
    now,
    refresh,
  };
}
