"use client";

import { FilePenLine, FilePlus, FileText, Hammer, TerminalSquare } from "lucide-react";
import type { Turn, TurnArtifact as Artifact } from "@/types/tasks";

function FilePath({ path }: { path: string }) {
  const idx = path.lastIndexOf("/");
  const dir = idx >= 0 ? path.slice(0, idx + 1) : "";
  const name = idx >= 0 ? path.slice(idx + 1) : path;
  return (
    <span className="min-w-0 truncate text-[13px]">
      {dir ? <span className="text-muted-foreground/70">{dir}</span> : null}
      <span className="font-medium text-foreground">{name}</span>
    </span>
  );
}

function summarize(artifacts: Artifact[]) {
  const filesEdited = new Set<string>();
  const filesCreated = new Set<string>();
  const commands: Artifact[] = [];
  const tools: Artifact[] = [];
  const pages: Artifact[] = [];
  for (const a of artifacts) {
    if (a.kind === "file-edit") filesEdited.add(a.path);
    else if (a.kind === "file-create") filesCreated.add(a.path);
    else if (a.kind === "command") commands.push(a);
    else if (a.kind === "tool-call") tools.push(a);
    else if (a.kind === "page-edit") pages.push(a);
  }
  return { filesEdited, filesCreated, commands, tools, pages };
}

function Section({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export function ArtifactsList({ turns }: { turns: Turn[] }) {
  const all: Artifact[] = turns.flatMap((t) => t.artifacts ?? []);
  const { filesEdited, filesCreated, commands, tools, pages } = summarize(all);

  if (all.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        No artifacts yet — they&rsquo;ll appear as the agent works.
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 py-6">
      <Section title="Files edited" count={filesEdited.size} icon={FilePenLine}>
        {[...filesEdited].map((p) => (
          <div
            key={p}
            className="flex items-center gap-2.5 rounded-md bg-card px-3 py-2 ring-1 ring-border/60"
          >
            <FilePenLine className="size-4 shrink-0 text-amber-500" />
            <FilePath path={p} />
          </div>
        ))}
      </Section>

      <Section title="Files created" count={filesCreated.size} icon={FilePlus}>
        {[...filesCreated].map((p) => (
          <div
            key={p}
            className="flex items-center gap-2.5 rounded-md bg-card px-3 py-2 ring-1 ring-border/60"
          >
            <FilePlus className="size-4 shrink-0 text-emerald-500" />
            <FilePath path={p} />
          </div>
        ))}
      </Section>

      <Section title="KB pages touched" count={pages.length} icon={FileText}>
        {pages.map((a, i) =>
          a.kind === "page-edit" ? (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md bg-card px-3 py-2 ring-1 ring-border/60"
            >
              <FileText className="size-4 shrink-0 text-blue-500" />
              <span className="min-w-0 truncate text-[13px]">
                <span className="font-medium text-foreground">{a.title}</span>
                <span className="ml-1.5 text-muted-foreground/70">{a.path}</span>
              </span>
            </div>
          ) : null
        )}
      </Section>

      <Section title="Commands run" count={commands.length} icon={TerminalSquare}>
        {commands.map((a, i) =>
          a.kind === "command" ? (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md bg-card px-3 py-2 ring-1 ring-border/60"
            >
              <TerminalSquare className="size-4 shrink-0 text-sky-500" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground/90">
                {a.cmd}
              </span>
              <span
                className={`ml-auto tabular-nums text-[12px] ${a.exit === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
              >
                {a.exit === 0 ? "✓" : "✗"} {(a.durationMs / 1000).toFixed(2)}s
              </span>
            </div>
          ) : null
        )}
      </Section>

      <Section title="Tool calls" count={tools.length} icon={Hammer}>
        {tools.map((a, i) =>
          a.kind === "tool-call" ? (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md bg-card px-3 py-2 ring-1 ring-border/60"
            >
              <Hammer className="size-4 shrink-0 text-violet-500" />
              <span className="min-w-0 truncate text-[13px]">
                <span className="font-medium text-foreground">{a.tool}</span>
                <span className="ml-1.5 text-muted-foreground/80">{a.target}</span>
              </span>
            </div>
          ) : null
        )}
      </Section>
    </div>
  );
}
