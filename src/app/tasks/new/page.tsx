"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskRequest } from "@/lib/agents/task-client";

export default function NewTaskPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const task = await createTaskRequest({
        title: title.trim(),
        initialPrompt: prompt.trim(),
      });
      router.push(`/tasks/${encodeURIComponent(task.meta.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border/70 px-6 py-3">
        <Link
          href="/"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-[14px] font-semibold tracking-tight">New task</h1>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-6 py-10">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this task about?"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            First message
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want the agent to do…"
            rows={8}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-foreground/30"
          />
        </div>

        {error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            ⌘↵ to create · the agent runtime is wired in a later phase
          </p>
          <Button
            onClick={submit}
            disabled={busy || !title.trim() || !prompt.trim()}
            className="gap-1.5"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
            Create task
          </Button>
        </div>
      </main>
    </div>
  );
}
