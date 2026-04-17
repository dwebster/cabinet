import { createHash, randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { discoverCabinetPaths } from "../cabinets/discovery";
import { DATA_DIR, sanitizeFilename } from "../storage/path-utils";
import {
  deleteFileOrDir,
  ensureDirectory,
  fileExists,
  listDirectory,
  readFileContent,
  writeFileContent,
} from "../storage/fs-operations";
import type {
  AppendTurnInput,
  ArtifactsIndex,
  CreateTaskInput,
  ListTasksFilters,
  SessionHandle,
  Task,
  TaskMeta,
  TaskTokens,
  Turn,
  TurnArtifact,
  TurnMeta,
  UpdateTaskInput,
} from "../../types/tasks";
import { publishTaskEvent } from "./task-events";

const TASKS_DIR_NAME = path.join(".agents", ".tasks");

function tasksDirFor(cabinetPath?: string): string {
  return cabinetPath
    ? path.join(DATA_DIR, cabinetPath, TASKS_DIR_NAME)
    : path.join(DATA_DIR, TASKS_DIR_NAME);
}

function taskDir(id: string, cabinetPath?: string): string {
  return path.join(tasksDirFor(cabinetPath), id);
}

function taskFilePath(id: string, cabinetPath?: string): string {
  return path.join(taskDir(id, cabinetPath), "task.md");
}

function turnsDir(id: string, cabinetPath?: string): string {
  return path.join(taskDir(id, cabinetPath), "turns");
}

function sessionFilePath(id: string, cabinetPath?: string): string {
  return path.join(taskDir(id, cabinetPath), "session.json");
}

function artifactsIndexPath(id: string, cabinetPath?: string): string {
  return path.join(taskDir(id, cabinetPath), "artifacts.json");
}

function eventsLogPath(id: string, cabinetPath?: string): string {
  return path.join(taskDir(id, cabinetPath), "events.log");
}

function turnFilePath(
  id: string,
  cabinetPath: string | undefined,
  turn: number,
  role: "user" | "agent"
): string {
  const padded = String(turn).padStart(3, "0");
  return path.join(turnsDir(id, cabinetPath), `${padded}-${role}.md`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function shortId(): string {
  return randomBytes(6).toString("base64url");
}

function cabinetScopeSegment(cabinetPath?: string): string {
  const normalized = cabinetPath?.trim() || "__root__";
  return createHash("sha1").update(normalized).digest("hex").slice(0, 6);
}

export function buildTaskId(input: {
  agentSlug?: string;
  cabinetPath?: string;
  now?: Date;
}): string {
  const now = input.now || new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").replace("Z", "");
  const slug = sanitizeFilename(input.agentSlug || "task") || "task";
  return `${ts}-${cabinetScopeSegment(input.cabinetPath)}-${slug}-${shortId()}`;
}

const EMPTY_INDEX: ArtifactsIndex = {
  filesEdited: [],
  filesCreated: [],
  commandsRun: [],
  pagesTouched: [],
  toolCalls: 0,
  generatedAt: new Date(0).toISOString(),
};

function rebuildArtifactsIndex(turns: Turn[]): ArtifactsIndex {
  const filesEdited = new Set<string>();
  const filesCreated = new Set<string>();
  const commandsRun: ArtifactsIndex["commandsRun"] = [];
  const pagesTouched = new Map<string, string>();
  let toolCalls = 0;

  for (const turn of turns) {
    for (const artifact of turn.artifacts ?? []) {
      switch (artifact.kind) {
        case "file-edit":
          filesEdited.add(artifact.path);
          break;
        case "file-create":
          filesCreated.add(artifact.path);
          break;
        case "command":
          commandsRun.push({
            cmd: artifact.cmd,
            exit: artifact.exit,
            durationMs: artifact.durationMs,
          });
          break;
        case "tool-call":
          toolCalls += 1;
          break;
        case "page-edit":
          pagesTouched.set(artifact.path, artifact.title);
          break;
      }
    }
  }

  return {
    filesEdited: [...filesEdited],
    filesCreated: [...filesCreated],
    commandsRun,
    pagesTouched: [...pagesTouched.entries()].map(([p, title]) => ({ path: p, title })),
    toolCalls,
    generatedAt: nowIso(),
  };
}

function tokensFromTurns(turns: Turn[]): TaskTokens {
  let input = 0;
  let output = 0;
  let cache = 0;
  for (const turn of turns) {
    if (!turn.tokens) continue;
    input += turn.tokens.input;
    output += turn.tokens.output;
    cache += turn.tokens.cache ?? 0;
  }
  return {
    input,
    output,
    cache,
    total: input + output,
  };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.map((v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? stripUndefined(v as Record<string, unknown>)
          : v
      );
    } else if (value && typeof value === "object") {
      out[key] = stripUndefined(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function metaToFrontmatter(meta: TaskMeta, notes: string): string {
  return matter.stringify(notes ?? "", stripUndefined(meta as unknown as Record<string, unknown>));
}

function frontmatterToMeta(raw: string, fallbackId: string): { meta: TaskMeta; notes: string } {
  const parsed = matter(raw);
  const data = parsed.data as Partial<TaskMeta>;
  const meta: TaskMeta = {
    id: data.id || fallbackId,
    title: data.title || "Untitled task",
    summary: data.summary,
    status: (data.status as TaskMeta["status"]) || "idle",
    trigger: (data.trigger as TaskMeta["trigger"]) || "manual",
    agentSlug: data.agentSlug,
    cabinetPath: data.cabinetPath,
    providerId: data.providerId,
    adapterType: data.adapterType,
    adapterConfig: data.adapterConfig,
    runtime: data.runtime,
    tokens: data.tokens,
    createdAt: data.createdAt || nowIso(),
    startedAt: data.startedAt || data.createdAt || nowIso(),
    lastActivityAt: data.lastActivityAt,
    completedAt: data.completedAt,
    jobId: data.jobId,
    jobName: data.jobName,
    mentionedPaths: data.mentionedPaths || [],
    titlePinned: data.titlePinned,
    summaryEditedAt: data.summaryEditedAt,
  };
  return { meta, notes: parsed.content.trim() };
}

function turnFrontmatterToMeta(raw: string, fallbackId: string, fallbackTurn: number): { meta: TurnMeta; content: string } {
  const parsed = matter(raw);
  const data = parsed.data as Partial<TurnMeta>;
  const meta: TurnMeta = {
    id: data.id || fallbackId,
    turn: data.turn ?? fallbackTurn,
    role: (data.role as TurnMeta["role"]) || "user",
    ts: data.ts || nowIso(),
    sessionId: data.sessionId,
    tokens: data.tokens,
    awaitingInput: data.awaitingInput,
    pending: data.pending,
    exitCode: data.exitCode,
    error: data.error,
    artifacts: data.artifacts as TurnArtifact[] | undefined,
  };
  return { meta, content: parsed.content.trim() };
}

function turnToFile(meta: TurnMeta, content: string): string {
  const normalized: TurnMeta = {
    ...meta,
    pending: meta.pending ? true : undefined,
    awaitingInput: meta.awaitingInput ? true : undefined,
  };
  return matter.stringify(content, stripUndefined(normalized as unknown as Record<string, unknown>));
}

async function readSessionHandle(id: string, cabinetPath?: string): Promise<SessionHandle | null> {
  const file = sessionFilePath(id, cabinetPath);
  if (!(await fileExists(file))) return null;
  try {
    return JSON.parse(await readFileContent(file)) as SessionHandle;
  } catch {
    return null;
  }
}

async function writeSessionHandle(
  id: string,
  cabinetPath: string | undefined,
  handle: SessionHandle
): Promise<void> {
  await ensureDirectory(taskDir(id, cabinetPath));
  await writeFileContent(sessionFilePath(id, cabinetPath), JSON.stringify(handle, null, 2));
}

async function writeArtifactsIndex(
  id: string,
  cabinetPath: string | undefined,
  index: ArtifactsIndex
): Promise<void> {
  await writeFileContent(artifactsIndexPath(id, cabinetPath), JSON.stringify(index, null, 2));
}

async function appendEventLog(
  id: string,
  cabinetPath: string | undefined,
  line: string
): Promise<void> {
  await ensureDirectory(taskDir(id, cabinetPath));
  await fs.appendFile(eventsLogPath(id, cabinetPath), `${line}\n`, "utf-8");
}

async function listTurnFiles(id: string, cabinetPath?: string): Promise<string[]> {
  const dir = turnsDir(id, cabinetPath);
  if (!(await fileExists(dir))) return [];
  const entries = await listDirectory(dir);
  return entries
    .filter((e) => !e.isDirectory && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
}

export async function ensureTasksDir(cabinetPath?: string): Promise<void> {
  await ensureDirectory(tasksDirFor(cabinetPath));
}

async function resolveTaskCabinetPath(
  id: string,
  cabinetPath?: string
): Promise<string | null> {
  if (typeof cabinetPath === "string") {
    return (await fileExists(taskFilePath(id, cabinetPath))) ? cabinetPath : null;
  }
  if (await fileExists(taskFilePath(id, undefined))) return undefined as unknown as string;
  for (const candidate of await discoverCabinetPaths()) {
    if (await fileExists(taskFilePath(id, candidate))) {
      return candidate;
    }
  }
  return null;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const cabinetPath = input.cabinetPath;
  await ensureTasksDir(cabinetPath);

  const startedAt = input.startedAt || nowIso();
  const id = buildTaskId({
    agentSlug: input.agentSlug,
    cabinetPath,
    now: new Date(startedAt),
  });

  const dir = taskDir(id, cabinetPath);
  await ensureDirectory(dir);
  await ensureDirectory(turnsDir(id, cabinetPath));

  const meta: TaskMeta = {
    id,
    title: input.title,
    status: "running",
    trigger: input.trigger,
    agentSlug: input.agentSlug,
    cabinetPath,
    providerId: input.providerId,
    adapterType: input.adapterType,
    adapterConfig: input.adapterConfig,
    runtime: input.runtime,
    tokens: { input: 0, output: 0, cache: 0, total: 0 },
    createdAt: startedAt,
    startedAt,
    lastActivityAt: startedAt,
    jobId: input.jobId,
    jobName: input.jobName,
    mentionedPaths: input.mentionedPaths || [],
  };

  const firstTurn: TurnMeta = {
    id: shortId(),
    turn: 1,
    role: "user",
    ts: startedAt,
  };

  await Promise.all([
    writeFileContent(taskFilePath(id, cabinetPath), metaToFrontmatter(meta, "")),
    writeFileContent(
      turnFilePath(id, cabinetPath, 1, "user"),
      turnToFile(firstTurn, input.initialPrompt)
    ),
    writeArtifactsIndex(id, cabinetPath, EMPTY_INDEX),
    appendEventLog(
      id,
      cabinetPath,
      JSON.stringify({ type: "task.updated", ts: startedAt, payload: { status: "running" } })
    ),
  ]);

  publishTaskEvent({
    type: "task.updated",
    taskId: id,
    cabinetPath,
    payload: { kind: "created", status: "running" },
  });

  return readTask(id, cabinetPath) as Promise<Task>;
}

export async function readTask(id: string, cabinetPath?: string): Promise<Task | null> {
  const resolvedCabinet = await resolveTaskCabinetPath(id, cabinetPath);
  if (resolvedCabinet === null) return null;
  const cp = resolvedCabinet as string | undefined;

  const file = taskFilePath(id, cp);
  if (!(await fileExists(file))) return null;

  const raw = await readFileContent(file);
  const { meta, notes } = frontmatterToMeta(raw, id);
  if (!meta.cabinetPath && typeof cp === "string") meta.cabinetPath = cp;

  const turnFiles = await listTurnFiles(id, cp);
  const turns: Turn[] = await Promise.all(
    turnFiles.map(async (filename, index) => {
      const fullPath = path.join(turnsDir(id, cp), filename);
      const fileRaw = await readFileContent(fullPath);
      const fallbackTurn = Number.parseInt(filename.slice(0, 3), 10) || index + 1;
      const { meta: turnMeta, content } = turnFrontmatterToMeta(fileRaw, shortId(), fallbackTurn);
      return { ...turnMeta, content };
    })
  );

  const session = await readSessionHandle(id, cp);
  let artifactsIndex: ArtifactsIndex = EMPTY_INDEX;
  if (await fileExists(artifactsIndexPath(id, cp))) {
    try {
      artifactsIndex = JSON.parse(await readFileContent(artifactsIndexPath(id, cp))) as ArtifactsIndex;
    } catch {
      artifactsIndex = rebuildArtifactsIndex(turns);
    }
  } else {
    artifactsIndex = rebuildArtifactsIndex(turns);
  }

  return { meta, notes, turns, session, artifactsIndex };
}

export async function updateTask(
  id: string,
  patch: UpdateTaskInput,
  cabinetPath?: string
): Promise<TaskMeta | null> {
  const task = await readTask(id, cabinetPath);
  if (!task) return null;
  const cp = task.meta.cabinetPath;

  const merged: TaskMeta = {
    ...task.meta,
    ...patch,
    completedAt: patch.completedAt === null ? undefined : patch.completedAt ?? task.meta.completedAt,
    runtime: patch.runtime ?? task.meta.runtime,
    tokens: patch.tokens ?? task.meta.tokens,
    lastActivityAt: patch.lastActivityAt ?? nowIso(),
  };

  await writeFileContent(taskFilePath(id, cp), metaToFrontmatter(merged, task.notes));
  await appendEventLog(
    id,
    cp,
    JSON.stringify({ type: "task.updated", ts: nowIso(), payload: patch })
  );
  publishTaskEvent({
    type: "task.updated",
    taskId: id,
    cabinetPath: cp,
    payload: patch as Record<string, unknown>,
  });
  return merged;
}

export async function appendTurn(
  id: string,
  input: AppendTurnInput,
  cabinetPath?: string
): Promise<{ task: Task; turn: Turn } | null> {
  const task = await readTask(id, cabinetPath);
  if (!task) return null;
  const cp = task.meta.cabinetPath;

  const nextNumber = (task.turns[task.turns.length - 1]?.turn ?? 0) + 1;
  const ts = input.ts || nowIso();

  const turnMeta: TurnMeta = {
    id: shortId(),
    turn: nextNumber,
    role: input.role,
    ts,
    sessionId: input.sessionId,
    tokens: input.tokens,
    awaitingInput: input.awaitingInput,
    pending: input.pending,
    exitCode: input.exitCode,
    error: input.error,
    artifacts: input.artifacts,
  };

  const filePath = turnFilePath(id, cp, nextNumber, input.role);
  await ensureDirectory(turnsDir(id, cp));
  await writeFileContent(filePath, turnToFile(turnMeta, input.content));

  const turn: Turn = { ...turnMeta, content: input.content };
  const allTurns = [...task.turns, turn];

  const updatedMeta: TaskMeta = {
    ...task.meta,
    lastActivityAt: ts,
    tokens: tokensFromTurns(allTurns),
  };

  // Auto-status transitions on agent turn append
  if (input.role === "agent" && !input.pending) {
    if (input.error || (typeof input.exitCode === "number" && input.exitCode !== 0)) {
      updatedMeta.status = "failed";
      updatedMeta.completedAt = ts;
    } else if (input.awaitingInput) {
      updatedMeta.status = "awaiting-input";
    } else if (task.meta.status !== "done" && task.meta.status !== "archived") {
      updatedMeta.status = "idle";
    }
  } else if (input.role === "user") {
    // user reply re-arms running state if there's an agent expected next
    updatedMeta.status = "running";
  }

  await writeFileContent(taskFilePath(id, cp), metaToFrontmatter(updatedMeta, task.notes));
  const newIndex = rebuildArtifactsIndex(allTurns);
  await writeArtifactsIndex(id, cp, newIndex);
  await appendEventLog(
    id,
    cp,
    JSON.stringify({ type: "turn.appended", ts, payload: { turn: turnMeta.turn, role: input.role } })
  );
  publishTaskEvent({
    type: "turn.appended",
    taskId: id,
    cabinetPath: cp,
    payload: {
      turn: turnMeta.turn,
      role: input.role,
      status: updatedMeta.status,
    },
  });

  return {
    task: { ...task, meta: updatedMeta, turns: allTurns, artifactsIndex: newIndex },
    turn,
  };
}

export async function updateTurn(
  id: string,
  turnNumber: number,
  role: "user" | "agent",
  patch: Partial<AppendTurnInput>,
  cabinetPath?: string
): Promise<Turn | null> {
  const task = await readTask(id, cabinetPath);
  if (!task) return null;
  const cp = task.meta.cabinetPath;

  const filePath = turnFilePath(id, cp, turnNumber, role);
  if (!(await fileExists(filePath))) return null;

  const existingRaw = await readFileContent(filePath);
  const { meta: existingMeta, content: existingContent } = turnFrontmatterToMeta(
    existingRaw,
    shortId(),
    turnNumber
  );

  const mergedAwaiting = patch.awaitingInput ?? existingMeta.awaitingInput;
  const mergedPending = patch.pending ?? existingMeta.pending;
  const newMeta: TurnMeta = {
    ...existingMeta,
    sessionId: patch.sessionId ?? existingMeta.sessionId,
    tokens: patch.tokens ?? existingMeta.tokens,
    awaitingInput: mergedAwaiting ? true : undefined,
    pending: mergedPending ? true : undefined,
    exitCode: patch.exitCode ?? existingMeta.exitCode,
    error: patch.error ?? existingMeta.error,
    artifacts: patch.artifacts ?? existingMeta.artifacts,
    ts: patch.ts ?? existingMeta.ts,
  };
  const newContent = patch.content ?? existingContent;

  await writeFileContent(filePath, turnToFile(newMeta, newContent));

  const allTurns = task.turns.map((t) =>
    t.turn === turnNumber && t.role === role ? { ...newMeta, content: newContent } : t
  );

  const updatedMeta: TaskMeta = {
    ...task.meta,
    lastActivityAt: nowIso(),
    tokens: tokensFromTurns(allTurns),
  };

  if (role === "agent" && newMeta.pending !== true) {
    if (newMeta.error || (typeof newMeta.exitCode === "number" && newMeta.exitCode !== 0)) {
      updatedMeta.status = "failed";
      updatedMeta.completedAt = nowIso();
    } else if (newMeta.awaitingInput) {
      updatedMeta.status = "awaiting-input";
    } else if (task.meta.status === "running") {
      updatedMeta.status = "idle";
    }
  }

  await writeFileContent(taskFilePath(id, cp), metaToFrontmatter(updatedMeta, task.notes));
  await writeArtifactsIndex(id, cp, rebuildArtifactsIndex(allTurns));
  await appendEventLog(
    id,
    cp,
    JSON.stringify({ type: "turn.updated", ts: nowIso(), payload: { turn: turnNumber, role } })
  );
  publishTaskEvent({
    type: "turn.updated",
    taskId: id,
    cabinetPath: cp,
    payload: {
      turn: turnNumber,
      role,
      status: updatedMeta.status,
    },
  });

  return { ...newMeta, content: newContent };
}

export async function setSessionHandle(
  id: string,
  handle: SessionHandle,
  cabinetPath?: string
): Promise<void> {
  const task = await readTask(id, cabinetPath);
  if (!task) return;
  await writeSessionHandle(id, task.meta.cabinetPath, handle);
}

export async function deleteTask(id: string, cabinetPath?: string): Promise<boolean> {
  const task = await readTask(id, cabinetPath);
  if (!task) return false;
  const cp = task.meta.cabinetPath;
  await deleteFileOrDir(taskDir(id, cp));
  publishTaskEvent({ type: "task.deleted", taskId: id, cabinetPath: cp });
  return true;
}

export async function listTaskMetas(filters: ListTasksFilters = {}): Promise<TaskMeta[]> {
  const cabinetPaths = filters.cabinetPath
    ? [filters.cabinetPath]
    : [undefined as unknown as string, ...(await discoverCabinetPaths())];

  const groups = await Promise.all(
    cabinetPaths.map(async (cabinetPath) => {
      const dir = tasksDirFor(cabinetPath);
      if (!(await fileExists(dir))) return [] as TaskMeta[];
      const entries = await listDirectory(dir);
      const metas = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory)
          .map(async (entry) => {
            const filePath = taskFilePath(entry.name, cabinetPath);
            if (!(await fileExists(filePath))) return null;
            try {
              const raw = await readFileContent(filePath);
              const { meta } = frontmatterToMeta(raw, entry.name);
              if (!meta.cabinetPath && cabinetPath) meta.cabinetPath = cabinetPath;
              return meta;
            } catch {
              return null;
            }
          })
      );
      return metas.filter(Boolean) as TaskMeta[];
    })
  );

  const flat = groups.flat();
  const seen = new Set<string>();
  const deduped = flat.filter((meta) => {
    if (seen.has(meta.id)) return false;
    seen.add(meta.id);
    return true;
  });
  const filtered = deduped.filter((meta) => {
    if (filters.status && meta.status !== filters.status) return false;
    if (filters.trigger && meta.trigger !== filters.trigger) return false;
    if (filters.agentSlug && meta.agentSlug !== filters.agentSlug) return false;
    return true;
  });
  filtered.sort(
    (a, b) =>
      new Date(b.lastActivityAt || b.startedAt).getTime() -
      new Date(a.lastActivityAt || a.startedAt).getTime()
  );
  return filtered.slice(0, filters.limit ?? 200);
}
