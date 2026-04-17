import { NextRequest, NextResponse } from "next/server";
import { appendTurn, readTask } from "@/lib/agents/task-store";
import { runTaskTurn } from "@/lib/agents/task-runner";
import type { AppendTurnInput, TurnRole } from "@/types/tasks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const cabinetPath =
      typeof body.cabinetPath === "string" ? body.cabinetPath : undefined;
    const content = typeof body.content === "string" ? body.content : "";
    const role: TurnRole = body.role === "agent" ? "agent" : "user";

    if (!content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const task = await readTask(id, cabinetPath);
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    const input: AppendTurnInput = {
      role,
      content,
      pending: body.pending === true ? true : undefined,
      awaitingInput: body.awaitingInput === true ? true : undefined,
      tokens:
        body.tokens && typeof body.tokens === "object"
          ? (body.tokens as AppendTurnInput["tokens"])
          : undefined,
      artifacts: Array.isArray(body.artifacts)
        ? (body.artifacts as AppendTurnInput["artifacts"])
        : undefined,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      exitCode: typeof body.exitCode === "number" ? body.exitCode : undefined,
      error: typeof body.error === "string" ? body.error : undefined,
    };

    const result = await appendTurn(id, input, cabinetPath);
    if (!result) return NextResponse.json({ error: "task not found" }, { status: 404 });

    // After a user turn, kick off the adapter in the background.
    // We don't await — the UI subscribes to SSE for live updates.
    if (role === "user" && body.skipAgentRun !== true) {
      void runTaskTurn(id, { cabinetPath }).catch((err) => {
        console.error(`[task-runner] ${id} failed`, err);
      });
    }

    return NextResponse.json({ ok: true, turn: result.turn, task: result.task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
