"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import {
  artifactPathToTreePath,
  inferPageTypeFromPath,
  pageTypeColor,
  pageTypeIcon,
  type PageTypeKind,
} from "@/lib/ui/page-type-icons";
import { cn } from "@/lib/utils";
import type { Turn } from "@/types/tasks";

interface PageMetaEntry {
  path: string;
  title: string;
  type: PageTypeKind;
}

function basename(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] || p;
}

function directory(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts.slice(0, -1).join(" / ");
}

function usePageMeta(paths: string[]): Map<string, PageMetaEntry> {
  const [meta, setMeta] = useState<Map<string, PageMetaEntry>>(new Map());
  const key = paths.slice().sort().join("|");

  useEffect(() => {
    if (paths.length === 0) {
      setMeta(new Map());
      return;
    }
    let cancelled = false;
    fetch("/api/kb/pages/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paths }),
    })
      .then((r) => r.json())
      .then((data: { entries?: PageMetaEntry[] }) => {
        if (cancelled) return;
        const next = new Map<string, PageMetaEntry>();
        for (const entry of data.entries ?? []) {
          next.set(entry.path, entry);
        }
        setMeta(next);
      })
      .catch(() => {
        if (!cancelled) setMeta(new Map());
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return meta;
}

export function ArtifactsList({ turns }: { turns: Turn[] }) {
  const setSection = useAppStore((s) => s.setSection);
  const selectPage = useTreeStore((s) => s.selectPage);
  const loadPage = useEditorStore((s) => s.loadPage);
  const paths = useMemo(() => {
    const seen = new Set<string>();
    for (const t of turns) {
      for (const a of t.artifacts ?? []) {
        if (a.kind === "file-edit" || a.kind === "file-create" || a.kind === "page-edit") {
          seen.add(a.path);
        }
      }
    }
    return [...seen];
  }, [turns]);

  const meta = usePageMeta(paths);

  if (paths.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        No KB pages touched yet — they&rsquo;ll appear as the agent writes files.
      </div>
    );
  }

  return (
    <div className="space-y-2 px-6 py-6">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        KB pages
        <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
          {paths.length}
        </span>
      </div>
      {paths.map((path) => {
        const entry = meta.get(path);
        const kind = entry?.type ?? inferPageTypeFromPath(path);
        const Icon = pageTypeIcon(kind);
        const color = pageTypeColor(kind);
        const title = entry?.title ?? basename(path);
        const dir = directory(path);
        return (
          <button
            key={path}
            type="button"
            onClick={() => {
              const treePath = artifactPathToTreePath(path);
              selectPage(treePath);
              setSection({ type: "page" });
              void loadPage(treePath);
            }}
            className="group flex w-full items-center gap-3 rounded-md bg-card px-3 py-2.5 text-left ring-1 ring-border/60 transition-colors hover:bg-muted/40"
          >
            <Icon className={cn("size-4 shrink-0", color)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">
                {title}
              </div>
              <div className="truncate text-[11px] text-muted-foreground/80">
                {dir || path}
              </div>
            </div>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
          </button>
        );
      })}
    </div>
  );
}
