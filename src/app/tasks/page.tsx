import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { listConversationMetas } from "@/lib/agents/conversation-store";
import { conversationMetaToTaskMeta } from "@/lib/agents/conversation-to-task-view";
import { TaskList } from "@/components/tasks/conversation/task-list";
import { TasksBoardV2 } from "@/components/tasks/board-v2";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ board?: string; cabinet?: string }>;

export default async function TasksIndexPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const useV2 = params.board === "v2";

  if (useV2) {
    return (
      <div className="h-screen">
        <TasksBoardV2
          cabinetPath={params.cabinet ?? "."}
          standalone
        />
      </div>
    );
  }

  const conversations = await listConversationMetas({ limit: 500 });
  const tasks = conversations.map(conversationMetaToTaskMeta);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border/70 px-6 py-3">
        <Link
          href="/"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="flex-1 text-[14px] font-semibold tracking-tight">Tasks</h1>
        <Link
          href="/tasks?board=v2"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Try v2 board
        </Link>
        <Link
          href="/tasks/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Plus className="size-3.5" />
          New task
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <TaskList tasks={tasks} />
      </main>
    </div>
  );
}
