import { NextRequest, NextResponse } from "next/server";
import { deleteTask, readTask, updateTask } from "@/lib/agents/task-store";
import type { TaskStatus } from "@/types/tasks";

const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "idle",
  "running",
  "awaiting-input",
  "done",
  "failed",
  "archived",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = new URL(req.url).searchParams.get("cabinetPath") || undefined;
  const task = await readTask(id, cabinetPath);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const cabinetPath =
      typeof body.cabinetPath === "string" ? body.cabinetPath : undefined;

    const patch: Parameters<typeof updateTask>[1] = {};

    if (typeof body.title === "string") {
      patch.title = body.title.trim();
      if (body.titlePinned === true) patch.titlePinned = true;
    }
    if (typeof body.summary === "string") {
      patch.summary = body.summary;
      patch.summaryEditedAt = new Date().toISOString();
    }
    if (typeof body.status === "string" && VALID_STATUSES.has(body.status as TaskStatus)) {
      patch.status = body.status as TaskStatus;
      if (body.status === "done" || body.status === "failed" || body.status === "archived") {
        patch.completedAt = new Date().toISOString();
      } else if (body.status === "running" || body.status === "idle") {
        patch.completedAt = null;
      }
    }
    if (body.runtime && typeof body.runtime === "object") {
      patch.runtime = body.runtime as { contextWindow?: number };
    }

    const updated = await updateTask(id, patch, cabinetPath);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, meta: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = new URL(req.url).searchParams.get("cabinetPath") || undefined;
  const ok = await deleteTask(id, cabinetPath);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
