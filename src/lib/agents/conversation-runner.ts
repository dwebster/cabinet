import path from "path";
import { randomUUID } from "crypto";
import type { JobConfig, JobRun, JobPostAction } from "@/types/jobs";
import type { ConversationMeta } from "@/types/conversations";
import { readPage } from "../storage/page-io";
import { DATA_DIR } from "../storage/path-utils";
import {
  defaultAdapterTypeForProvider,
  resolveExecutionProviderId,
} from "./adapters";
import { agentAdapterRegistry } from "./adapters/registry";
import type { AdapterExecutionContext } from "./adapters/types";
import { syncSkillsToTmpdir } from "./adapters/_shared/skills-injection";
import { supportsTerminalResume } from "./adapters/legacy-ids";
import {
  appendAgentTurn,
  appendConversationTranscript,
  appendUserTurn,
  createConversation,
  extractAgentTurnContent,
  finalizeConversation,
  readConversationMeta,
  readConversationTurns,
  readSession,
  updateAgentTurn,
  writeConversationMeta,
  writeSession,
} from "./conversation-store";
import { publishConversationEvent } from "./conversation-events";
import {
  createDaemonSession,
  getDaemonSessionOutput,
  isDaemonSessionAlive,
  pollDaemonSessionUntilDone,
  writeDaemonSessionInput,
} from "./daemon-client";
import { readLibraryPersona } from "./library-manager";
import { readPersona, type AgentPersona } from "./persona-manager";
import { getDefaultProviderId } from "./provider-runtime";
import { looksLikeAwaitingInput } from "./task-heuristics";

export interface ConversationCompletion {
  meta: ConversationMeta;
  output: string;
  status: "completed" | "failed";
}

interface StartConversationInput {
  agentSlug: string;
  title: string;
  trigger: ConversationMeta["trigger"];
  prompt: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  mentionedPaths?: string[];
  jobId?: string;
  jobName?: string;
  scheduledAt?: string;
  cabinetPath?: string;
  cwd?: string;
  timeoutSeconds?: number;
  onComplete?: (completion: ConversationCompletion) => Promise<void> | void;
}

function buildCabinetEpilogueInstructions(): string {
  return [
    "If you need the user to answer a question before you can continue,",
    "wrap that question in `<ask_user>...</ask_user>` tags on its own paragraph.",
    "Cabinet uses this marker to pause the task and highlight the composer.",
    "Do not include the tags around rhetorical questions or code samples.",
    "",
    "At the very end of your chat response (the text you send back to the",
    "user — NOT inside any file you create or edit), include a ```cabinet",
    "block with these fields:",
    "SUMMARY: one short summary line",
    "CONTEXT: optional lightweight memory/context summary",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
    "",
    "This block is metadata for the Cabinet runner only. Never write a",
    "```cabinet ... ``` block inside the body of any .md file you save —",
    "the file should contain only its own content.",
  ].join("\n");
}

function buildKnowledgeBaseScopeInstructions(
  baseCwd: string,
  cabinetPath?: string
): string[] {
  if (cabinetPath) {
    return [
      `Work only inside the cabinet-scoped knowledge base rooted at /data/${cabinetPath}.`,
      `For local filesystem work, treat ${baseCwd} as the root for this run.`,
      "Do not create or modify files in sibling cabinets or the global /data root unless the user explicitly asks.",
    ];
  }

  return [
    "Work in the Cabinet knowledge base rooted at /data.",
    `For local filesystem work, treat ${baseCwd} as the root for this run.`,
  ];
}

function buildDiagramOutputInstructions(): string[] {
  return [
    "If you create Mermaid diagrams, make sure the source is renderable.",
    "Prefer Mermaid edge labels like `A -->|label| B` or `A -.->|label| B` instead of mixed forms such as `A -- \"label\" --> B`.",
  ];
}

function buildAgentContextHeader(persona: AgentPersona | null, agentSlug: string): string {
  if (!persona) {
    return [
      "You are Cabinet's General agent.",
      "Handle the request directly and use the knowledge base as your working area.",
    ].join("\n");
  }

  return [
    persona.body,
    "",
    `You are working as ${persona.name} (${agentSlug}).`,
  ].join("\n");
}

function makeTitle(text: string): string {
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean) || "New conversation";
  return firstLine.slice(0, 80);
}

async function buildMentionContext(mentionedPaths: string[]): Promise<string> {
  if (mentionedPaths.length === 0) return "";

  const chunks = await Promise.all(
    mentionedPaths.map(async (pagePath) => {
      try {
        const page = await readPage(pagePath);
        return `--- ${page.frontmatter.title} (${pagePath}) ---\n${page.content}`;
      } catch {
        return null;
      }
    })
  );

  const valid = chunks.filter(Boolean);
  if (valid.length === 0) return "";

  return `\n\nReferenced pages:\n${valid.join("\n\n")}`;
}

export async function buildManualConversationPrompt(input: {
  agentSlug: string;
  userMessage: string;
  mentionedPaths?: string[];
  cabinetPath?: string;
}): Promise<{
  prompt: string;
  title: string;
  cwd?: string;
  adapterType: string;
  adapterConfig?: Record<string, unknown>;
  providerId: string;
  cabinetPath?: string;
}> {
  const persona = input.agentSlug === "general"
    ? null
    : await readPersona(input.agentSlug, input.cabinetPath);
  const mentionContext = await buildMentionContext(input.mentionedPaths || []);
  const baseCwd = input.cabinetPath ? path.join(DATA_DIR, input.cabinetPath) : DATA_DIR;
  const cwd =
    persona?.workdir && persona.workdir !== "/data"
      ? `${DATA_DIR}/${persona.workdir.replace(/^\/+/, "")}`
      : baseCwd;

  const prompt = [
    buildAgentContextHeader(persona, input.agentSlug),
    "",
    ...buildKnowledgeBaseScopeInstructions(baseCwd, input.cabinetPath),
    "Reflect useful outputs in KB files, not only in terminal text.",
    ...buildDiagramOutputInstructions(),
    buildCabinetEpilogueInstructions(),
    "",
    `User request:\n${input.userMessage}${mentionContext}`,
  ].join("\n");

  const defaultProviderId = getDefaultProviderId();

  return {
    prompt,
    title: makeTitle(input.userMessage),
    cwd,
    adapterType:
      persona?.adapterType ||
      defaultAdapterTypeForProvider(
        resolveExecutionProviderId({
          adapterType: persona?.adapterType,
          providerId: persona?.provider,
          defaultProviderId,
        })
      ),
    adapterConfig: persona?.adapterConfig,
    providerId: resolveExecutionProviderId({
      adapterType: persona?.adapterType,
      providerId: persona?.provider,
      defaultProviderId,
    }),
    cabinetPath: input.cabinetPath,
  };
}

export async function buildEditorConversationPrompt(input: {
  pagePath: string;
  userMessage: string;
  mentionedPaths?: string[];
  cabinetPath?: string;
}): Promise<{
  prompt: string;
  title: string;
  cwd?: string;
  mentionedPaths: string[];
  adapterType: string;
  adapterConfig?: Record<string, unknown>;
  providerId: string;
}> {
  const persona =
    (await readPersona("editor", input.cabinetPath)) ||
    (await readPersona("editor")) ||
    (await readLibraryPersona("editor", input.cabinetPath));
  const combinedMentionedPaths = Array.from(
    new Set([input.pagePath, ...(input.mentionedPaths || [])])
  );
  const mentionContext = await buildMentionContext(combinedMentionedPaths);
  const baseCwd = input.cabinetPath ? path.join(DATA_DIR, input.cabinetPath) : DATA_DIR;
  const cwd =
    persona?.workdir && persona.workdir !== "/data"
      ? `${DATA_DIR}/${persona.workdir.replace(/^\/+/, "")}`
      : baseCwd;

  const prompt = [
    buildAgentContextHeader(persona, "editor"),
    "",
    `You are editing the page at /data/${input.pagePath}.`,
    `Prefer making the requested changes directly in ${input.pagePath} unless the task clearly belongs in another KB file.`,
    "Do not assume the target is markdown. Follow the actual file type and Cabinet structure when choosing what to edit.",
    ...buildKnowledgeBaseScopeInstructions(baseCwd, input.cabinetPath),
    "Edit KB files directly and reflect useful outputs in the KB, not only in terminal text.",
    ...buildDiagramOutputInstructions(),
    buildCabinetEpilogueInstructions(),
    "",
    `User request:\n${input.userMessage}${mentionContext}`,
  ].join("\n");

  const defaultProviderId = getDefaultProviderId();

  return {
    prompt,
    title: makeTitle(input.userMessage),
    cwd,
    mentionedPaths: combinedMentionedPaths,
    adapterType:
      persona?.adapterType ||
      defaultAdapterTypeForProvider(
        resolveExecutionProviderId({
          adapterType: persona?.adapterType,
          providerId: persona?.provider,
          defaultProviderId,
        })
      ),
    adapterConfig: persona?.adapterConfig,
    providerId: resolveExecutionProviderId({
      adapterType: persona?.adapterType,
      providerId: persona?.provider,
      defaultProviderId,
    }),
  };
}

export async function startConversationRun(
  input: StartConversationInput
): Promise<ConversationMeta> {
  const resolvedProviderId = input.providerId || getDefaultProviderId();
  const resolvedAdapterType =
    input.adapterType || defaultAdapterTypeForProvider(resolvedProviderId);

  // Skills injection: read the persona's `skills:` list and materialize each
  // into a managed tmpdir. The resulting `skillsDir` + slug list are merged
  // into adapterConfig so (a) adapters can forward the dir to the CLI (e.g.
  // Claude `--add-dir`), and (b) the task viewer can display which skills
  // were attached to this run. No-op when the persona has no skills or the
  // catalog is empty.
  const skillsPersona =
    input.agentSlug && input.agentSlug !== "general"
      ? await readPersona(input.agentSlug, input.cabinetPath)
      : null;
  // We defer the actual symlink materialization until we know the meta.id.
  // For now, capture the slug list we'll attach.
  const requestedSkillSlugs = skillsPersona?.skills?.length
    ? skillsPersona.skills
    : null;
  const baseAdapterConfig: Record<string, unknown> | undefined = requestedSkillSlugs
    ? { ...(input.adapterConfig || {}), skills: requestedSkillSlugs }
    : input.adapterConfig;

  const meta = await createConversation({
    agentSlug: input.agentSlug,
    cabinetPath: input.cabinetPath,
    title: input.title,
    trigger: input.trigger,
    prompt: input.prompt,
    providerId: resolvedProviderId,
    adapterType: resolvedAdapterType,
    adapterConfig: baseAdapterConfig,
    mentionedPaths: input.mentionedPaths,
    jobId: input.jobId,
    jobName: input.jobName,
    scheduledAt: input.scheduledAt,
  });

  const skillsSync = requestedSkillSlugs
    ? syncSkillsToTmpdir(meta.id, requestedSkillSlugs)
    : null;
  const spawnAdapterConfig: Record<string, unknown> | undefined = skillsSync
    ? {
        ...(baseAdapterConfig || {}),
        skillsDir: skillsSync.dir,
        skills: skillsSync.resolved.map((entry) => entry.slug),
      }
    : baseAdapterConfig;

  try {
    await createDaemonSession({
      id: meta.id,
      prompt: input.prompt,
      providerId: resolvedProviderId,
      adapterType: resolvedAdapterType,
      adapterConfig: spawnAdapterConfig,
      cwd: input.cwd,
      timeoutSeconds: input.timeoutSeconds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start daemon session";
    await appendConversationTranscript(meta.id, `${message}\n`);
    await finalizeConversation(meta.id, {
      status: "failed",
      output: message,
      exitCode: 1,
    });
    throw error;
  }

  if (input.onComplete) {
    void waitForConversationCompletion(meta.id, input.onComplete);
  }

  return meta;
}

export async function waitForConversationCompletion(
  conversationId: string,
  onComplete?: (completion: ConversationCompletion) => Promise<void> | void
): Promise<ConversationCompletion> {
  const deadline = Date.now() + 15 * 60 * 1000;
  let lastOutputLength = 0;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 700));

    try {
      const data = await getDaemonSessionOutput(conversationId);

      // Live-streaming — broadcast a task.updated whenever the daemon's
      // transcript grew since the last poll. This is the only mechanism the
      // SSE subscribers have to learn about first-turn progress, because the
      // daemon process's in-memory event bus can't reach Next.js subscribers.
      const outputLen = (data.output ?? "").length;
      if (outputLen > lastOutputLength) {
        lastOutputLength = outputLen;
        publishConversationEvent({
          type: "task.updated",
          taskId: conversationId,
          payload: { streaming: true },
        });
      }

      if (data.status === "running") {
        continue;
      }

      const normalizedStatus = data.status === "completed" ? "completed" : "failed";
      const currentMeta = await readConversationMeta(conversationId);
      const finalMeta =
        currentMeta?.status === "running"
          ? await finalizeConversation(conversationId, {
              status: normalizedStatus,
              output: data.output,
              exitCode: normalizedStatus === "completed" ? 0 : 1,
              tokens: data.adapterUsage
                ? {
                    input: data.adapterUsage.inputTokens,
                    output: data.adapterUsage.outputTokens,
                    cache: data.adapterUsage.cachedInputTokens,
                    total:
                      data.adapterUsage.inputTokens + data.adapterUsage.outputTokens,
                  }
                : undefined,
              errorKind: data.adapterErrorKind ?? undefined,
              errorHint: data.adapterErrorHint ?? undefined,
              errorRetryAfterSec: data.adapterErrorRetryAfterSec ?? undefined,
            })
          : currentMeta;

      if (!finalMeta) {
        throw new Error(`Conversation ${conversationId} disappeared during completion`);
      }

      // Always publish a terminal task.updated on the Next.js side. The
      // daemon process may have beaten us to finalizeConversation (where the
      // event is normally fired), but its in-memory event bus can't reach
      // Next.js SSE subscribers — so we re-announce here unconditionally.
      publishConversationEvent({
        type: "task.updated",
        taskId: conversationId,
        cabinetPath: finalMeta.cabinetPath,
        payload: {
          status: finalMeta.status,
          artifactPaths: finalMeta.artifactPaths,
        },
      });

      const completion = {
        meta: finalMeta,
        output: data.output,
        status: normalizedStatus,
      } satisfies ConversationCompletion;

      if (onComplete) {
        await onComplete(completion);
      }

      return completion;
    } catch {
      // Retry until timeout. The daemon can briefly 404 while cleaning up.
    }
  }

  const finalMeta = await finalizeConversation(conversationId, {
    status: "failed",
    output: "Conversation timed out while waiting for completion.",
    exitCode: 124,
  });

  if (!finalMeta) {
    throw new Error(`Conversation ${conversationId} timed out and no metadata was found`);
  }

  const completion = {
    meta: finalMeta,
    output: "Conversation timed out while waiting for completion.",
    status: "failed",
  } satisfies ConversationCompletion;

  if (onComplete) {
    await onComplete(completion);
  }

  return completion;
}

function substituteTemplateVars(text: string, job: JobConfig): string {
  const now = new Date();
  return text
    .replace(/\{\{date\}\}/g, now.toISOString().split("T")[0])
    .replace(/\{\{datetime\}\}/g, now.toISOString())
    .replace(/\{\{job\.name\}\}/g, job.name)
    .replace(/\{\{job\.id\}\}/g, job.id)
    .replace(/\{\{job\.workdir\}\}/g, job.workdir || "/data");
}

async function processPostActions(
  actions: JobPostAction[] | undefined,
  job: JobConfig
): Promise<void> {
  if (!actions || actions.length === 0) return;

  for (const action of actions) {
    try {
      if (action.action === "git_commit") {
        const simpleGit = (await import("simple-git")).default;
        const git = simpleGit(DATA_DIR);
        await git.add(".");
        await git.commit(
          substituteTemplateVars(
            action.message || `Job ${job.name} completed {{date}}`,
            job
          )
        );
      }
    } catch (error) {
      console.error(`Post-action ${action.action} failed:`, error);
    }
  }
}

export async function startJobConversation(
  job: JobConfig,
  options: { scheduledAt?: string } = {}
): Promise<JobRun> {
  const persona = job.agentSlug ? await readPersona(job.agentSlug, job.cabinetPath) : null;
  const defaultProviderId = getDefaultProviderId();
  const jobPrompt = substituteTemplateVars(job.prompt, job);
  const baseCwd = job.cabinetPath ? path.join(DATA_DIR, job.cabinetPath) : DATA_DIR;
  const cwd =
    job.workdir && job.workdir !== "/data" && job.workdir !== "/"
      ? path.join(baseCwd, job.workdir.replace(/^\/+/, ""))
      : persona?.workdir && persona.workdir !== "/data" && persona.workdir !== "/"
        ? path.join(baseCwd, persona.workdir.replace(/^\/+/, ""))
        : baseCwd;

  const prompt = [
    buildAgentContextHeader(persona, job.agentSlug || "agent"),
    "",
    "This is a scheduled or manual Cabinet job.",
    ...buildKnowledgeBaseScopeInstructions(baseCwd, job.cabinetPath),
    "Reflect the results in KB files whenever useful.",
    ...buildDiagramOutputInstructions(),
    buildCabinetEpilogueInstructions(),
    "",
    `Job instructions:\n${jobPrompt}`,
  ].join("\n");

  const meta = await startConversationRun({
    agentSlug: job.agentSlug || "agent",
    title: job.name,
    trigger: "job",
    prompt,
    adapterType:
      job.adapterType ||
      persona?.adapterType ||
      defaultAdapterTypeForProvider(
        resolveExecutionProviderId({
          adapterType: job.adapterType || persona?.adapterType,
          providerId: job.provider || persona?.provider,
          defaultProviderId,
        })
      ),
    adapterConfig: job.adapterConfig || persona?.adapterConfig,
    providerId: resolveExecutionProviderId({
      adapterType: job.adapterType || persona?.adapterType,
      providerId: job.provider || persona?.provider,
      defaultProviderId,
    }),
    jobId: job.id,
    jobName: job.name,
    scheduledAt: options.scheduledAt,
    cabinetPath: job.cabinetPath,
    cwd,
    timeoutSeconds: job.timeout || 600,
    onComplete: async (completion) => {
      if (completion.status === "completed") {
        await processPostActions(job.on_complete, job);
      } else {
        await processPostActions(job.on_failure, job);
      }
    },
  });

  return {
    id: meta.id,
    jobId: job.id,
    status: "running",
    startedAt: meta.startedAt,
    output: "",
  };
}

// ---------------------------------------------------------------------------
// Multi-turn continuation
//
// continueConversationRun appends a user turn, then invokes the adapter
// via the cabinet-daemon (default) or in-process (tests / fallback) to
// produce an agent turn. Reuses all existing prompt builders so the
// agent still writes KB files via the SUMMARY / CONTEXT / ARTIFACT
// trailer, cabinet-scoped cwd, persona, diagram rules, etc.
//
// The daemon path is durable against Next.js reloads + route handler
// teardown. The in-process path is used when CABINET_TASK_RUNNER is set
// to "inprocess" or when not running inside Next.js (e.g. unit tests).
// ---------------------------------------------------------------------------

export interface ContinueConversationInput {
  userMessage: string;
  mentionedPaths?: string[];
  cabinetPath?: string;
  timeoutMs?: number;
  /** Per-turn runtime override. Applied only to this follow-up. */
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
}

async function runContinueInProcess(input: {
  adapter: import("./adapters/types").AgentExecutionAdapter;
  conversationId: string;
  pendingTurnNumber: number;
  cp: string | undefined;
  cwd: string;
  canResume: boolean;
  sessionResumeId: string | null;
  sessionParams: Record<string, unknown> | null;
  adapterConfig: Record<string, unknown>;
  prompt: string;
  replayPrompt: string;
  timeoutMs: number;
  isSessionExpiredError: (errorMessage?: string | null) => boolean;
}): Promise<ConversationMeta | null> {
  const {
    adapter,
    conversationId,
    pendingTurnNumber,
    cp,
    cwd,
    canResume,
    sessionResumeId,
    sessionParams,
    adapterConfig,
    prompt,
    replayPrompt,
    timeoutMs,
    isSessionExpiredError,
  } = input;

  const logChunks: string[] = [];
  let lastFlushAt = 0;
  let flushInFlight: Promise<unknown> | null = null;

  const flushStreamedContent = async () => {
    const now = Date.now();
    if (now - lastFlushAt < 700) return;
    if (flushInFlight) return;
    lastFlushAt = now;
    const accumulated = logChunks.join("").trim();
    if (!accumulated) return;
    const partial = extractAgentTurnContent(accumulated) || accumulated;
    flushInFlight = updateAgentTurn(
      conversationId,
      pendingTurnNumber,
      { content: partial, pending: true },
      cp
    )
      .catch(() => null)
      .finally(() => {
        flushInFlight = null;
      });
    await flushInFlight;
  };

  const stderrChunks: string[] = [];
  const executeWithPrompt = async (
    effectivePrompt: string,
    effectiveSessionId: string | null,
    effectiveSessionParams: Record<string, unknown> | null
  ) => {
    logChunks.length = 0;
    stderrChunks.length = 0;
    const execCtx: AdapterExecutionContext = {
      runId: randomUUID(),
      adapterType: adapter.type,
      config: adapterConfig,
      prompt: effectivePrompt,
      cwd,
      timeoutMs,
      sessionId: effectiveSessionId,
      sessionParams: effectiveSessionParams,
      onLog: async (stream, chunk) => {
        if (stream === "stderr") {
          stderrChunks.push(chunk);
          return;
        }
        logChunks.push(chunk);
        void flushStreamedContent();
      },
    };
    return adapter.execute!(execCtx);
  };

  let resumeOutcome: "resumed" | "replayed" | "failed" = canResume
    ? "resumed"
    : "replayed";
  let resumeReason: string | undefined;

  try {
    let result = await executeWithPrompt(
      prompt,
      canResume ? sessionResumeId : null,
      canResume ? sessionParams : null
    );

    if (
      canResume &&
      (result.exitCode !== 0 || !!result.errorMessage) &&
      isSessionExpiredError(result.errorMessage)
    ) {
      await writeSession(
        conversationId,
        { kind: adapter.type, alive: false, lastUsedAt: new Date().toISOString() },
        cp
      );
      await updateAgentTurn(
        conversationId,
        pendingTurnNumber,
        { content: "Session expired, retrying with full context…", pending: true },
        cp
      );
      resumeOutcome = "replayed";
      resumeReason = "session expired — replayed with full history";
      result = await executeWithPrompt(replayPrompt, null, null);
    }

    const rawOutput =
      (result.output && result.output.trim()) || logChunks.join("").trim() || "";
    const finalText = rawOutput
      ? extractAgentTurnContent(rawOutput) || rawOutput
      : "(no response)";
    const failed =
      result.exitCode !== 0 || !!result.errorMessage || result.timedOut;
    const awaitingInput = !failed && looksLikeAwaitingInput(finalText);

    if (failed) {
      resumeOutcome = "failed";
    }

    // Classify failure via the adapter. Falls back to "unknown" if the
    // adapter doesn't implement classifyError (shouldn't happen post-G10).
    let classified:
      | import("../../types/conversations").ConversationErrorClassification
      | null = null;
    if (failed && adapter.classifyError) {
      try {
        classified = adapter.classifyError(
          stderrChunks.join("") || result.errorMessage || "",
          result.exitCode ?? null
        );
      } catch {
        classified = { kind: "unknown" };
      }
    }

    await updateAgentTurn(
      conversationId,
      pendingTurnNumber,
      {
        content: failed
          ? `${finalText}\n\n_${result.errorMessage || "Adapter failed."}_`
          : rawOutput || finalText,
        pending: false,
        awaitingInput,
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
      cp
    );

    // Persist session codec blob + resume id. G8: this is what unlocks
    // resume for providers whose session state isn't just a single string.
    if (!failed && (result.sessionId || result.sessionParams)) {
      let codecBlob: Record<string, unknown> | null = null;
      let displayId: string | undefined;
      try {
        codecBlob =
          adapter.sessionCodec && result.sessionParams
            ? adapter.sessionCodec.serialize(result.sessionParams)
            : null;
        displayId =
          adapter.sessionCodec?.getDisplayId?.(result.sessionParams ?? {}) ||
          (result.sessionDisplayId ?? undefined);
      } catch {
        codecBlob = null;
      }
      await writeSession(
        conversationId,
        {
          kind: adapter.type,
          resumeId: result.sessionId ?? undefined,
          alive: !result.clearSession,
          lastUsedAt: new Date().toISOString(),
          codecBlob,
          displayId,
        },
        cp
      );
    } else if (result.clearSession) {
      await writeSession(
        conversationId,
        { kind: adapter.type, alive: false, lastUsedAt: new Date().toISOString() },
        cp
      );
    }

    // Write classified error + resume attempt to meta.
    const metaNow = await readConversationMeta(conversationId, cp);
    if (metaNow) {
      const next: ConversationMeta = {
        ...metaNow,
        adapterType: adapter.type,
        providerId: adapter.providerId ?? metaNow.providerId,
        adapterConfig,
        lastResumeAttempt: {
          at: new Date().toISOString(),
          result: resumeOutcome,
          reason: resumeReason,
        },
      };
      if (failed && classified) {
        next.errorKind = classified.kind;
        next.errorHint = classified.hint;
        next.errorRetryAfterSec = classified.retryAfterSec;
      } else if (!failed) {
        next.errorKind = undefined;
        next.errorHint = undefined;
        next.errorRetryAfterSec = undefined;
      }
      await writeConversationMeta(next);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown adapter error";
    await updateAgentTurn(
      conversationId,
      pendingTurnNumber,
      {
        content: `_Adapter crashed: ${message}_`,
        pending: false,
        exitCode: 1,
        error: message,
      },
      cp
    );
  }

  return readConversationMeta(conversationId, cp);
}

function serializeTurnHistory(
  turns: { role: "user" | "agent"; content: string; pending?: boolean }[]
): string {
  const parts: string[] = [];
  for (const t of turns) {
    if (t.pending) continue;
    const role = t.role === "user" ? "user" : "assistant";
    parts.push(`<turn-${role}>\n${t.content.trim()}\n</turn-${role}>`);
  }
  return parts.join("\n\n");
}

async function buildContinuationPrompt(options: {
  mode: "resume" | "replay";
  meta: ConversationMeta;
  userMessage: string;
  mentionedPaths: string[];
  persona: AgentPersona | null;
  baseCwd: string;
  priorTurns: { role: "user" | "agent"; content: string; pending?: boolean }[];
}): Promise<string> {
  const mentionContext = await buildMentionContext(options.mentionedPaths);

  if (options.mode === "resume") {
    // Live session: persona + scope already live in the adapter's context.
    return [
      buildCabinetEpilogueInstructions(),
      mentionContext.trim(),
      "",
      `User follow-up:\n${options.userMessage}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  // Replay: cold start; rebuild the full agent context and append history.
  return [
    buildAgentContextHeader(options.persona, options.meta.agentSlug),
    "",
    ...buildKnowledgeBaseScopeInstructions(options.baseCwd, options.meta.cabinetPath),
    "Reflect useful outputs in KB files, not only in terminal text.",
    ...buildDiagramOutputInstructions(),
    buildCabinetEpilogueInstructions(),
    "",
    "Prior conversation (for context, do not re-output):",
    serializeTurnHistory(options.priorTurns),
    "",
    `User follow-up:\n${options.userMessage}${mentionContext}`,
  ].join("\n");
}

export async function continueConversationRun(
  conversationId: string,
  input: ContinueConversationInput
): Promise<ConversationMeta | null> {
  const meta = await readConversationMeta(conversationId, input.cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || input.cabinetPath;

  // 1. Record the user turn immediately.
  await appendUserTurn(
    conversationId,
    {
      content: input.userMessage,
      mentionedPaths: input.mentionedPaths,
    },
    cp
  );

  // 2. Resolve adapter, honoring per-turn runtime override (§9 of PRD).
  //    When the user switches runtime mid-conversation, the new adapter takes
  //    over for this turn; session resume is only valid when we stay on the
  //    same adapter, so a switch forces replay mode.
  const turnOverride: {
    providerId?: string;
    adapterType?: string;
    model?: string;
    effort?: string;
  } = {
    providerId: input.providerId,
    adapterType: input.adapterType,
    model: input.model,
    effort: input.effort,
  };
  const runtimeSwitched =
    !!turnOverride.adapterType && turnOverride.adapterType !== meta.adapterType;
  const adapterType =
    turnOverride.adapterType ||
    meta.adapterType ||
    defaultAdapterTypeForProvider(meta.providerId);
  const adapter = agentAdapterRegistry.get(adapterType);

  // Legacy PTY adapters don't implement adapter.execute — they delegate the
  // whole conversation to the daemon's PTY session machinery. For terminal-mode
  // continuations we prefer SAME-PROCESS continue: if the existing PTY is
  // still alive (CLI is in its REPL), inject the new prompt via stdin so the
  // user sees the response stream into the same xterm buffer without losing
  // in-memory CLI state. If the PTY has already exited, fall back to spawning
  // a fresh session under the same session id.
  if (adapter && adapter.executionEngine === "legacy_pty_cli") {
    const legacyPersona =
      meta.agentSlug && meta.agentSlug !== "general"
        ? await readPersona(meta.agentSlug, cp)
        : null;
    const legacyBaseCwd = cp ? path.join(DATA_DIR, cp) : DATA_DIR;
    const legacyCwd =
      legacyPersona?.workdir && legacyPersona.workdir !== "/data"
        ? `${DATA_DIR}/${legacyPersona.workdir.replace(/^\/+/, "")}`
        : legacyBaseCwd;

    // 1. Try same-process continue: stdin-inject into the existing PTY.
    const alive = await isDaemonSessionAlive(conversationId);
    if (alive) {
      const wrote = await writeDaemonSessionInput(
        conversationId,
        input.userMessage,
        { appendEnter: true }
      );
      if (wrote) {
        return readConversationMeta(conversationId, cp);
      }
    }

    // 2. Fallback: spawn a fresh PTY under the same session id.
    //    Two recovery paths depending on the CLI's capabilities:
    //    (a) Native resume — provider supports --resume/--session AND we
    //        captured its session id last run. Pass it as adapterSessionId;
    //        CLI rehydrates internally. The user prompt is the raw message.
    //    (b) Prompt-level replay — provider has no resume contract OR the
    //        session id wasn't captured. Prepend the prior conversation to
    //        the user message so the CLI still has context (at the cost of
    //        more input tokens). This is what native mode already does for
    //        structured adapters via `buildContinuationPrompt({ mode: "replay" })`.
    const priorSession = await readSession(conversationId, cp);
    const legacyResumeId =
      priorSession?.resumeId && priorSession.resumeId.trim()
        ? priorSession.resumeId.trim()
        : null;
    const canNativeResume =
      supportsTerminalResume(meta.providerId) && !!legacyResumeId;

    let effectivePrompt = input.userMessage;
    if (!canNativeResume) {
      const priorTurns = (await readConversationTurns(conversationId, cp))
        .filter((t) => !t.pending)
        .map((t) => ({ role: t.role, content: t.content, pending: t.pending }));
      if (priorTurns.length > 0) {
        effectivePrompt = await buildContinuationPrompt({
          mode: "replay",
          meta,
          userMessage: input.userMessage,
          mentionedPaths: input.mentionedPaths || [],
          persona: legacyPersona,
          baseCwd: legacyBaseCwd,
          priorTurns,
        });
      }
    }

    try {
      await createDaemonSession({
        id: conversationId,
        prompt: effectivePrompt,
        providerId: meta.providerId,
        adapterType,
        adapterConfig: meta.adapterConfig,
        cwd: legacyCwd,
        timeoutSeconds: undefined,
        adapterSessionId: canNativeResume ? legacyResumeId : null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to restart PTY session";
      await appendAgentTurn(
        conversationId,
        {
          content: message,
          exitCode: 1,
          error: "pty_restart_failed",
        },
        cp
      );
    }
    return readConversationMeta(conversationId, cp);
  }

  if (!adapter || !adapter.execute) {
    await appendAgentTurn(
      conversationId,
      {
        content: `Adapter \`${adapterType}\` is not available for structured conversation runs.`,
        exitCode: 1,
        error: "adapter_unavailable",
      },
      cp
    );
    return readConversationMeta(conversationId, cp);
  }

  // Per-turn adapterConfig: merge base meta.adapterConfig with any override.
  const turnAdapterConfig: Record<string, unknown> = {
    ...(runtimeSwitched ? {} : meta.adapterConfig || {}),
  };
  if (turnOverride.model) turnAdapterConfig.model = turnOverride.model;
  if (turnOverride.effort) turnAdapterConfig.effort = turnOverride.effort;

  // 3. Session handle + mode selection. Rehydrate codec blob into
  //    `sessionParams` so adapters like Cursor/OpenCode/Pi can resume in
  //    their native shape (G8).
  const session = await readSession(conversationId, cp);
  const rehydratedSessionParams =
    !runtimeSwitched && session && adapter.sessionCodec && session.codecBlob
      ? adapter.sessionCodec.deserialize(session.codecBlob)
      : null;
  const canResume =
    !runtimeSwitched &&
    !!adapter.supportsSessionResume &&
    !!session?.alive &&
    (!!session?.resumeId || !!rehydratedSessionParams);

  // 4. Rebuild persona context for replay mode
  const persona =
    meta.agentSlug && meta.agentSlug !== "general"
      ? await readPersona(meta.agentSlug, cp)
      : null;
  const baseCwd = cp ? path.join(DATA_DIR, cp) : DATA_DIR;
  const cwd =
    persona?.workdir && persona.workdir !== "/data"
      ? `${DATA_DIR}/${persona.workdir.replace(/^\/+/, "")}`
      : baseCwd;

  // 5. Build prompts for both modes — resume uses the lightweight shape,
  //    but we keep the replay prompt ready as a fallback in case the
  //    adapter reports its session expired.
  const allTurnsForReplay = (await readConversationTurns(conversationId, cp))
    .filter((t) => !t.pending)
    .map((t) => ({ role: t.role, content: t.content, pending: t.pending }));

  const replayPrompt = await buildContinuationPrompt({
    mode: "replay",
    meta,
    userMessage: input.userMessage,
    mentionedPaths: input.mentionedPaths || [],
    persona,
    baseCwd,
    priorTurns: allTurnsForReplay,
  });

  const prompt = canResume
    ? await buildContinuationPrompt({
        mode: "resume",
        meta,
        userMessage: input.userMessage,
        mentionedPaths: input.mentionedPaths || [],
        persona,
        baseCwd,
        priorTurns: [],
      })
    : replayPrompt;

  // 6. Create the pending agent turn
  const pending = await appendAgentTurn(
    conversationId,
    { content: "Working on it…", pending: true },
    cp
  );
  if (!pending) return meta;
  const pendingTurnNumber = pending.turn;

  const isSessionExpiredError = (errorMessage?: string | null): boolean => {
    if (!errorMessage) return false;
    const lower = errorMessage.toLowerCase();
    return (
      lower.includes("no conversation found") ||
      lower.includes("session id") ||
      lower.includes("session not found") ||
      lower.includes("invalid session") ||
      lower.includes("session expired")
    );
  };

  const useDaemon =
    process.env.CABINET_TASK_RUNNER !== "inprocess" &&
    !!process.env.NEXT_RUNTIME; // only when running inside Next.js server

  if (!useDaemon) {
    return await runContinueInProcess({
      adapter,
      conversationId,
      pendingTurnNumber,
      cp,
      cwd,
      canResume,
      sessionResumeId: session?.resumeId ?? null,
      sessionParams: rehydratedSessionParams,
      adapterConfig: turnAdapterConfig,
      prompt,
      replayPrompt,
      timeoutMs: input.timeoutMs ?? 10 * 60 * 1000,
      isSessionExpiredError,
    });
  }

  // 7. Route through the daemon so the run survives Next.js reloads and
  //    Node process death. The daemon buffers stdout; we poll every 700ms
  //    and stream the accumulated text into the pending turn.
  const executeViaDaemon = async (
    effectivePrompt: string,
    effectiveSessionId: string | null,
    effectiveSessionParams: Record<string, unknown> | null
  ): Promise<{
    status: "completed" | "failed";
    output: string;
    errorMessage?: string;
    adapterSessionId?: string | null;
    adapterSessionParams?: Record<string, unknown> | null;
    adapterUsage?: {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
    } | null;
    adapterErrorKind?:
      | import("../../types/conversations").ConversationErrorKind
      | null;
    adapterErrorHint?: string | null;
    adapterErrorRetryAfterSec?: number | null;
  }> => {
    const runId = `${conversationId}::t${pendingTurnNumber}::${randomUUID()}`;
    try {
      await createDaemonSession({
        id: runId,
        prompt: effectivePrompt,
        providerId: adapter.providerId ?? meta.providerId,
        adapterType: adapter.type,
        adapterConfig: turnAdapterConfig,
        cwd,
        timeoutSeconds: Math.max(
          60,
          Math.ceil((input.timeoutMs ?? 10 * 60 * 1000) / 1000)
        ),
        adapterSessionId: effectiveSessionId,
        adapterSessionParams: effectiveSessionParams,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "failed", output: "", errorMessage: message };
    }

    try {
      const result = await pollDaemonSessionUntilDone(runId, {
        intervalMs: 700,
        deadlineMs: input.timeoutMs ?? 15 * 60 * 1000,
        onPartial: (output) => {
          const partial =
            extractAgentTurnContent(output) || output.trim();
          if (!partial) return;
          void updateAgentTurn(
            conversationId,
            pendingTurnNumber,
            { content: partial, pending: true },
            cp
          ).catch(() => null);
        },
      });
      const status = result.status === "completed" ? "completed" : "failed";
      return {
        status,
        output: result.output,
        errorMessage: status === "failed" ? result.output || "Adapter failed." : undefined,
        adapterSessionId: result.adapterSessionId,
        adapterSessionParams: result.adapterSessionParams,
        adapterUsage: result.adapterUsage,
        adapterErrorKind: result.adapterErrorKind,
        adapterErrorHint: result.adapterErrorHint,
        adapterErrorRetryAfterSec: result.adapterErrorRetryAfterSec,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "failed", output: "", errorMessage: message };
    }
  };

  let resumeOutcome: "resumed" | "replayed" | "failed" = canResume
    ? "resumed"
    : "replayed";
  let resumeReason: string | undefined = runtimeSwitched
    ? `switched runtime to ${adapter.type} — replayed with full history`
    : undefined;

  try {
    let result = await executeViaDaemon(
      prompt,
      canResume ? session!.resumeId! : null,
      canResume ? rehydratedSessionParams : null
    );

    // Fallback: session expired (Claude --resume failed). Retry in replay
    // mode with full history.
    if (
      canResume &&
      result.status === "failed" &&
      isSessionExpiredError(result.errorMessage || result.output)
    ) {
      await writeSession(
        conversationId,
        {
          kind: adapter.type,
          alive: false,
          lastUsedAt: new Date().toISOString(),
        },
        cp
      );
      await updateAgentTurn(
        conversationId,
        pendingTurnNumber,
        { content: "Session expired, retrying with full context…", pending: true },
        cp
      );
      resumeOutcome = "replayed";
      resumeReason = "session expired — replayed with full history";
      result = await executeViaDaemon(replayPrompt, null, null);
    }

    const rawOutput = (result.output || "").trim();
    const finalText = rawOutput
      ? extractAgentTurnContent(rawOutput) || rawOutput
      : "(no response)";
    const failed = result.status !== "completed";
    const awaitingInput = !failed && looksLikeAwaitingInput(finalText);

    if (failed) {
      resumeOutcome = "failed";
    }

    // Re-finalize the conversation via finalizeConversation so we pick up
    // the daemon-side transcript + parsed cabinet block + artifacts +
    // summary + contextSummary (same path startConversationRun uses).
    const finalized = await finalizeConversation(
      conversationId,
      {
        status: failed ? "failed" : "completed",
        exitCode: failed ? 1 : 0,
        output: rawOutput,
        tokens: result.adapterUsage
          ? {
              input: result.adapterUsage.inputTokens,
              output: result.adapterUsage.outputTokens,
              cache: result.adapterUsage.cachedInputTokens,
              total:
                result.adapterUsage.inputTokens + result.adapterUsage.outputTokens,
            }
          : undefined,
        errorKind: result.adapterErrorKind ?? undefined,
        errorHint: result.adapterErrorHint ?? undefined,
        errorRetryAfterSec: result.adapterErrorRetryAfterSec ?? undefined,
      },
      cp
    );

    await updateAgentTurn(
      conversationId,
      pendingTurnNumber,
      {
        content: failed
          ? `${finalText}\n\n_${result.errorMessage || "Adapter failed."}_`
          : finalText,
        pending: false,
        awaitingInput,
        tokens: result.adapterUsage
          ? {
              input: result.adapterUsage.inputTokens,
              output: result.adapterUsage.outputTokens,
              cache: result.adapterUsage.cachedInputTokens,
            }
          : undefined,
        exitCode: failed ? 1 : undefined,
        error: failed ? result.errorMessage : undefined,
        // Carry the KB artifacts from the finalized meta so the turn's
        // artifact list matches what parseCabinetBlock extracted.
        artifacts: finalized?.artifactPaths ?? undefined,
      },
      cp
    );

    // Persist codec blob + resume handle (G8).
    if (!failed && (result.adapterSessionId || result.adapterSessionParams)) {
      let codecBlob: Record<string, unknown> | null = null;
      let displayId: string | undefined;
      try {
        codecBlob =
          adapter.sessionCodec && result.adapterSessionParams
            ? adapter.sessionCodec.serialize(result.adapterSessionParams)
            : null;
        displayId = adapter.sessionCodec?.getDisplayId?.(
          result.adapterSessionParams ?? {}
        ) || undefined;
      } catch {
        codecBlob = null;
      }
      await writeSession(
        conversationId,
        {
          kind: adapter.type,
          resumeId: result.adapterSessionId ?? undefined,
          alive: true,
          lastUsedAt: new Date().toISOString(),
          codecBlob,
          displayId,
        },
        cp
      );
    }

    // Record resume/replay outcome + persist the per-turn runtime snapshot.
    const metaNow = await readConversationMeta(conversationId, cp);
    if (metaNow) {
      const next: ConversationMeta = {
        ...metaNow,
        adapterType: adapter.type,
        providerId: adapter.providerId ?? metaNow.providerId,
        adapterConfig: turnAdapterConfig,
        lastResumeAttempt: {
          at: new Date().toISOString(),
          result: resumeOutcome,
          reason: resumeReason,
        },
      };
      await writeConversationMeta(next);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown adapter error";
    await updateAgentTurn(
      conversationId,
      pendingTurnNumber,
      {
        content: `_Adapter crashed: ${message}_`,
        pending: false,
        exitCode: 1,
        error: message,
      },
      cp
    );
  }

  return readConversationMeta(conversationId, cp);
}

// ---------------------------------------------------------------------------
// Compact
//
// Collapses prior turns into a single digest turn and kills the adapter
// session handle so the next continue starts a fresh session with only the
// digest for context. Freeing up context window without losing task state.
// ---------------------------------------------------------------------------

export interface CompactConversationInput {
  cabinetPath?: string;
  timeoutMs?: number;
}

export async function compactConversation(
  conversationId: string,
  input: CompactConversationInput = {}
): Promise<ConversationMeta | null> {
  const meta = await readConversationMeta(conversationId, input.cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || input.cabinetPath;

  const turns = await readConversationTurns(conversationId, cp);
  if (turns.length === 0) return meta;

  const adapterType = meta.adapterType || defaultAdapterTypeForProvider(meta.providerId);
  const adapter = agentAdapterRegistry.get(adapterType);

  if (!adapter || !adapter.execute) {
    return meta;
  }

  // Build the compact prompt: full history + instruction to produce a digest.
  const history = serializeTurnHistory(
    turns.map((t) => ({ role: t.role, content: t.content, pending: t.pending }))
  );
  const compactPrompt = [
    "You are compacting a long task conversation into a concise digest.",
    "Produce ONE agent turn that captures:",
    "- the original user goal in one sentence",
    "- what has been done so far (bullet list, ≤8 items)",
    "- open questions or decisions still pending",
    "- relevant KB paths that were created/updated",
    "",
    "Keep it under 200 words. Do NOT restate the full content of prior turns.",
    "End with a short ```cabinet block (SUMMARY only).",
    "",
    "Prior conversation:",
    history,
  ].join("\n");

  const baseCwd = cp ? path.join(DATA_DIR, cp) : DATA_DIR;

  // Append a pending compaction turn so the UI shows progress.
  const pending = await appendAgentTurn(
    conversationId,
    { content: "Compacting…", pending: true },
    cp
  );
  if (!pending) return meta;

  const logChunks: string[] = [];
  const ctx: AdapterExecutionContext = {
    runId: randomUUID(),
    adapterType: adapter.type,
    config: meta.adapterConfig || {},
    prompt: compactPrompt,
    cwd: baseCwd,
    timeoutMs: input.timeoutMs ?? 3 * 60 * 1000,
    sessionId: null,
    onLog: async (stream, chunk) => {
      if (stream === "stdout") logChunks.push(chunk);
    },
  };

  try {
    const result = await adapter.execute(ctx);
    const rawOutput =
      (result.output && result.output.trim()) || logChunks.join("").trim() || "";
    const digest = rawOutput
      ? extractAgentTurnContent(rawOutput) || rawOutput
      : "Compaction produced no digest.";

    await updateAgentTurn(
      conversationId,
      pending.turn,
      {
        content: `**Compacted digest**\n\n${digest}`,
        pending: false,
        tokens: result.usage
          ? {
              input: result.usage.inputTokens,
              output: result.usage.outputTokens,
              cache: result.usage.cachedInputTokens,
            }
          : undefined,
      },
      cp
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown compact error";
    await updateAgentTurn(
      conversationId,
      pending.turn,
      {
        content: `_Compaction failed: ${message}_`,
        pending: false,
        exitCode: 1,
        error: message,
      },
      cp
    );
    return readConversationMeta(conversationId, cp);
  }

  // Kill the session so the next continue replays from the digest only.
  await writeSession(
    conversationId,
    {
      kind: adapter.type,
      alive: false,
      lastUsedAt: new Date().toISOString(),
    },
    cp
  );

  return readConversationMeta(conversationId, cp);
}
