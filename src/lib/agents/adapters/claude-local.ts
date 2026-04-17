import { claudeCodeProvider } from "../providers/claude-code";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  createClaudeStreamAccumulator,
  consumeClaudeStreamJson,
  flushClaudeStreamJson,
} from "./claude-stream";
import type { AgentExecutionAdapter } from "./types";
import { ADAPTER_RUNTIME_PATH, runChildProcess } from "./utils";

function readStringConfig(
  config: Record<string, unknown>,
  key: string
): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildClaudeArgs(
  config: Record<string, unknown>,
  resumeSessionId?: string | null
): string[] {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else {
    args.push("--no-session-persistence");
  }

  const model = readStringConfig(config, "model");
  if (model) {
    args.push("--model", model);
  }

  const effort =
    readStringConfig(config, "effort") ||
    readStringConfig(config, "reasoningEffort");
  if (effort) {
    args.push("--effort", effort);
  }

  const systemPrompt = readStringConfig(config, "systemPrompt");
  if (systemPrompt) {
    args.push("--system-prompt", systemPrompt);
  }

  const appendSystemPrompt = readStringConfig(config, "appendSystemPrompt");
  if (appendSystemPrompt) {
    args.push("--append-system-prompt", appendSystemPrompt);
  }

  return args;
}

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || null
  );
}

export const claudeLocalAdapter: AgentExecutionAdapter = {
  type: "claude_local",
  name: "Claude Local",
  description:
    "Structured Claude Code execution using print mode and streaming JSON. Intended to replace the PTY prompt-injection path for detached Cabinet runs.",
  providerId: claudeCodeProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: true,
  models: claudeCodeProvider.models,
  effortLevels: claudeCodeProvider.effortLevels,
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "claude_local",
      await claudeCodeProvider.healthCheck(),
      claudeCodeProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(claudeCodeProvider);
    const args = buildClaudeArgs(ctx.config, ctx.sessionId ?? null);
    const accumulator = createClaudeStreamAccumulator();

    await ctx.onMeta?.({
      adapterType: ctx.adapterType,
      command,
      commandArgs: args,
      cwd: ctx.cwd,
      env: {
        PATH: ADAPTER_RUNTIME_PATH,
      },
    });

    const result = await runChildProcess(command, args, {
      cwd: ctx.cwd,
      stdin: ctx.prompt,
      timeoutMs: ctx.timeoutMs,
      onSpawn: ctx.onSpawn,
      onStdout: (chunk) => {
        const display = consumeClaudeStreamJson(accumulator, chunk);
        if (!display) return;
        void ctx.onLog("stdout", display);
      },
      onStderr: (chunk) => {
        if (!chunk) return;
        void ctx.onLog("stderr", chunk);
      },
    });

    const trailingDisplay = flushClaudeStreamJson(accumulator);
    if (trailingDisplay) {
      await ctx.onLog("stdout", trailingDisplay);
    }

    const output = accumulator.streamedText || accumulator.finalText || null;
    const summaryLine = output ? firstNonEmptyLine(output)?.slice(0, 300) || null : null;

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        result.exitCode === 0
          ? null
          : result.stderr.trim() || output || "Claude local execution failed.",
      usage: accumulator.usage,
      sessionId: accumulator.sessionId,
      provider: claudeCodeProvider.id,
      model: accumulator.model,
      billingType: accumulator.billingType || "subscription",
      summary: summaryLine,
      output,
    };
  },
};
