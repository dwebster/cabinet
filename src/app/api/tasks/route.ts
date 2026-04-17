import { NextRequest, NextResponse } from "next/server";
import { createTask, listTaskMetas } from "@/lib/agents/task-store";
import type { TaskStatus, TaskTrigger } from "@/types/tasks";

const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "idle",
  "running",
  "awaiting-input",
  "done",
  "failed",
  "archived",
]);

const VALID_TRIGGERS: ReadonlySet<TaskTrigger> = new Set(["manual", "job", "heartbeat"]);

function pickStatus(value: string | null): TaskStatus | undefined {
  if (!value) return undefined;
  return VALID_STATUSES.has(value as TaskStatus) ? (value as TaskStatus) : undefined;
}

function pickTrigger(value: string | null): TaskTrigger | undefined {
  if (!value) return undefined;
  return VALID_TRIGGERS.has(value as TaskTrigger) ? (value as TaskTrigger) : undefined;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cabinetPath = searchParams.get("cabinetPath") || undefined;
  const status = pickStatus(searchParams.get("status"));
  const trigger = pickTrigger(searchParams.get("trigger"));
  const agentSlug = searchParams.get("agent") || undefined;
  const limit = Number.parseInt(searchParams.get("limit") || "200", 10);

  const tasks = await listTaskMetas({
    cabinetPath,
    status,
    trigger,
    agentSlug,
    limit: Number.isFinite(limit) ? limit : 200,
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const initialPrompt =
      typeof body.initialPrompt === "string" ? body.initialPrompt.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!initialPrompt) {
      return NextResponse.json({ error: "initialPrompt is required" }, { status: 400 });
    }

    const triggerValue = typeof body.trigger === "string" ? body.trigger : "manual";
    const trigger = pickTrigger(triggerValue) ?? "manual";

    const task = await createTask({
      title,
      initialPrompt,
      trigger,
      agentSlug: typeof body.agentSlug === "string" ? body.agentSlug : undefined,
      cabinetPath: typeof body.cabinetPath === "string" ? body.cabinetPath : undefined,
      providerId: typeof body.providerId === "string" ? body.providerId : undefined,
      adapterType: typeof body.adapterType === "string" ? body.adapterType : undefined,
      adapterConfig:
        body.adapterConfig && typeof body.adapterConfig === "object"
          ? (body.adapterConfig as Record<string, unknown>)
          : undefined,
      runtime:
        body.runtime && typeof body.runtime === "object"
          ? (body.runtime as { contextWindow?: number })
          : undefined,
      mentionedPaths: Array.isArray(body.mentionedPaths)
        ? body.mentionedPaths.filter((v): v is string => typeof v === "string")
        : undefined,
      jobId: typeof body.jobId === "string" ? body.jobId : undefined,
      jobName: typeof body.jobName === "string" ? body.jobName : undefined,
    });

    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
