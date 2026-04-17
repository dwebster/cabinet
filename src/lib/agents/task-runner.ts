import path from "path";
import { randomUUID } from "crypto";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { agentAdapterRegistry, defaultAdapterTypeForProvider } from "./adapters/registry";
import type { AdapterExecutionContext } from "./adapters/types";
import {
  appendTurn,
  readTask,
  setSessionHandle,
  updateTask,
  updateTurn,
} from "./task-store";
import { deriveSummary, looksLikeAwaitingInput } from "./task-heuristics";
import type { Task, Turn } from "@/types/tasks";

interface RunTaskTurnOptions {
  cabinetPath?: string;
}

function pickAdapterType(task: Task): string {
  if (task.meta.adapterType) return task.meta.adapterType;
  return defaultAdapterTypeForProvider(task.meta.providerId);
}

function resolveCwd(task: Task): string {
  const cabinetPath = task.meta.cabinetPath;
  return cabinetPath ? path.join(DATA_DIR, cabinetPath) : DATA_DIR;
}

function buildReplayPrompt(turns: Turn[]): string {
  const blocks: string[] = [];
  for (const turn of turns) {
    if (turn.pending) continue;
    const role = turn.role === "user" ? "USER" : "ASSISTANT";
    blocks.push(`${role}:\n${turn.content.trim()}`);
  }
  return blocks.join("\n\n---\n\n");
}

function lastUserMessage(turns: Turn[]): string | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role === "user") return turn.content;
  }
  return null;
}

export async function runTaskTurn(
  taskId: string,
  options: RunTaskTurnOptions = {}
): Promise<void> {
  const task = await readTask(taskId, options.cabinetPath);
  if (!task) {
    return;
  }

  const adapterType = pickAdapterType(task);
  const adapter = agentAdapterRegistry.get(adapterType);
  if (!adapter || !adapter.execute) {
    await updateTask(
      taskId,
      { status: "failed" },
      options.cabinetPath
    );
    await appendTurn(
      taskId,
      {
        role: "agent",
        content: `Adapter \`${adapterType}\` is not available for structured task runs.`,
        exitCode: 1,
        error: "adapter_unavailable",
      },
      options.cabinetPath
    );
    return;
  }

  // Build the prompt per adapter capability
  let prompt: string;
  let resumeId: string | null = null;
  if (adapter.supportsSessionResume && task.session?.alive && task.session.resumeId) {
    // Resume mode — only send the latest user message
    resumeId = task.session.resumeId;
    prompt = lastUserMessage(task.turns) || "";
  } else {
    // Fresh or replay mode — concatenate full history
    prompt = buildReplayPrompt(task.turns);
  }

  if (!prompt.trim()) {
    return;
  }

  // Append a pending agent turn
  const pending = await appendTurn(
    taskId,
    {
      role: "agent",
      content: "Working on it…",
      pending: true,
    },
    options.cabinetPath
  );
  if (!pending) return;
  const pendingTurnNumber = pending.turn.turn;

  const logChunks: string[] = [];
  const ctx: AdapterExecutionContext = {
    runId: randomUUID(),
    adapterType: adapter.type,
    config: task.meta.adapterConfig || {},
    prompt,
    cwd: resolveCwd(task),
    timeoutMs: 10 * 60 * 1000,
    sessionId: resumeId,
    onLog: async (stream, chunk) => {
      if (stream === "stdout") logChunks.push(chunk);
    },
  };

  try {
    const result = await adapter.execute(ctx);

    const finalText =
      (result.output && result.output.trim()) ||
      logChunks.join("").trim() ||
      "(no response)";

    const failed =
      result.exitCode !== 0 ||
      !!result.errorMessage ||
      result.timedOut;

    const awaitingInput = !failed && looksLikeAwaitingInput(finalText);

    await updateTurn(
      taskId,
      pendingTurnNumber,
      "agent",
      {
        content: failed
          ? `${finalText}\n\n_${result.errorMessage || "Adapter failed."}_`
          : finalText,
        pending: false,
        awaitingInput: awaitingInput ? true : undefined,
        tokens: result.usage
          ? {
              input: result.usage.inputTokens,
              output: result.usage.outputTokens,
              cache: result.usage.cachedInputTokens,
            }
          : undefined,
        sessionId: result.sessionId || undefined,
        exitCode: failed ? result.exitCode ?? 1 : undefined,
        error: failed ? result.errorMessage ?? undefined : undefined,
      },
      options.cabinetPath
    );

    // Rolling summary — skip if user edited it within the last 5 minutes.
    const refreshed = await readTask(taskId, options.cabinetPath);
    if (refreshed) {
      const lastEdit = refreshed.meta.summaryEditedAt
        ? new Date(refreshed.meta.summaryEditedAt).getTime()
        : 0;
      const userTouchedRecently = Date.now() - lastEdit < 5 * 60 * 1000;
      if (!userTouchedRecently) {
        const nextSummary = deriveSummary({
          turns: refreshed.turns,
          existingSummary: refreshed.meta.summary,
        });
        if (nextSummary && nextSummary !== refreshed.meta.summary) {
          await updateTask(
            taskId,
            { summary: nextSummary },
            options.cabinetPath
          );
        }
      }
    }

    if (result.sessionId) {
      await setSessionHandle(
        taskId,
        {
          kind: adapter.type,
          resumeId: result.sessionId,
          alive: !result.clearSession,
          lastUsedAt: new Date().toISOString(),
        },
        options.cabinetPath
      );
    } else if (result.clearSession) {
      await setSessionHandle(
        taskId,
        { kind: adapter.type, alive: false, lastUsedAt: new Date().toISOString() },
        options.cabinetPath
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown adapter error";
    await updateTurn(
      taskId,
      pendingTurnNumber,
      "agent",
      {
        content: `_Adapter crashed: ${message}_`,
        pending: false,
        exitCode: 1,
        error: message,
      },
      options.cabinetPath
    );
  }
}
