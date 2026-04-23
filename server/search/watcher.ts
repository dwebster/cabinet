import chokidar, { type FSWatcher } from "chokidar";
import path from "path";
import { DATA_DIR, isHiddenEntry } from "../../src/lib/storage/path-utils";
import { buildPageRecord, SearchIndex, virtualPathFor } from "./index-builder";

export interface WatcherOptions {
  onIndexing?: () => void;
  onIndexed?: (info: { path: string; kind: "add" | "change" | "remove" }) => void;
}

const DEBOUNCE_MS = 150;

function insideHiddenDir(fsPath: string): boolean {
  const rel = fsPath.slice(DATA_DIR.length).replace(/^\//, "");
  const segments = rel.split("/");
  segments.pop();
  return segments.some((seg) => isHiddenEntry(seg));
}

export function startWatcher(
  index: SearchIndex,
  opts: WatcherOptions = {}
): FSWatcher {
  const watcher = chokidar.watch(DATA_DIR, {
    ignoreInitial: true,
    ignored: (p: string) => {
      const rel = p.slice(DATA_DIR.length).replace(/^\//, "");
      if (!rel) return false;
      const segments = rel.split("/");
      for (const seg of segments) {
        if (isHiddenEntry(seg)) return true;
      }
      const leaf = segments[segments.length - 1];
      // Only follow directories and *.md files into chokidar's stat pipeline.
      if (leaf.includes(".") && !leaf.endsWith(".md")) return true;
      return false;
    },
  });

  const pending = new Map<string, { kind: "add" | "change" | "remove"; timer: NodeJS.Timeout }>();

  const schedule = (fsPath: string, kind: "add" | "change" | "remove") => {
    const existing = pending.get(fsPath);
    if (existing) clearTimeout(existing.timer);
    opts.onIndexing?.();
    const timer = setTimeout(() => {
      pending.delete(fsPath);
      void process(fsPath, kind);
    }, DEBOUNCE_MS);
    pending.set(fsPath, { kind, timer });
  };

  const process = async (fsPath: string, kind: "add" | "change" | "remove") => {
    if (insideHiddenDir(fsPath)) return;
    const virtualPath = virtualPathFor(fsPath);
    if (!virtualPath) return;

    if (kind === "remove") {
      index.remove(virtualPath);
      opts.onIndexed?.({ path: virtualPath, kind });
      return;
    }

    const record = await buildPageRecord(fsPath, virtualPath);
    if (!record) return;
    if (kind === "add") index.add(record);
    else index.update(record);
    opts.onIndexed?.({ path: virtualPath, kind });
  };

  watcher.on("add", (p) => schedule(p, "add"));
  watcher.on("change", (p) => schedule(p, "change"));
  watcher.on("unlink", (p) => schedule(p, "remove"));

  return watcher;
}
