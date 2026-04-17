import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type Store = typeof import("./task-store");
let store: Store;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-task-store-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  store = await import("./task-store");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("createTask writes task.md + first user turn + artifacts index", async () => {
  const task = await store.createTask({
    title: "Refactor auth",
    trigger: "manual",
    initialPrompt: "Please refactor the login module.",
    agentSlug: "general",
    providerId: "claude-code",
    adapterType: "claude-code-cli",
  });

  assert.equal(task.meta.title, "Refactor auth");
  assert.equal(task.meta.status, "running");
  assert.equal(task.turns.length, 1);
  assert.equal(task.turns[0].role, "user");
  assert.equal(task.turns[0].turn, 1);
  assert.equal(task.turns[0].content, "Please refactor the login module.");
  assert.equal(task.artifactsIndex.filesEdited.length, 0);
});

test("appendTurn agent reply with artifacts updates token totals + index + status", async () => {
  const task = await store.createTask({
    title: "Task with reply",
    trigger: "manual",
    initialPrompt: "Edit auth.",
  });

  const result = await store.appendTurn(task.meta.id, {
    role: "agent",
    content: "Done. Edited login.ts.",
    tokens: { input: 1000, output: 200, cache: 500 },
    artifacts: [
      { kind: "file-edit", path: "src/auth/login.ts", added: 10, removed: 2 },
      { kind: "command", cmd: "npm test", exit: 0, durationMs: 1234 },
    ],
  });

  assert.ok(result, "appendTurn should return result");
  assert.equal(result.task.meta.status, "idle");
  assert.equal(result.task.meta.tokens?.total, 1200);
  assert.equal(result.task.meta.tokens?.cache, 500);
  assert.deepEqual(result.task.artifactsIndex.filesEdited, ["src/auth/login.ts"]);
  assert.equal(result.task.artifactsIndex.commandsRun.length, 1);
});

test("appendTurn agent with awaitingInput flips status", async () => {
  const task = await store.createTask({
    title: "Awaiting demo",
    trigger: "manual",
    initialPrompt: "Build SSO.",
  });

  const result = await store.appendTurn(task.meta.id, {
    role: "agent",
    content: "Should I use SAML or OIDC?",
    tokens: { input: 100, output: 30 },
    awaitingInput: true,
  });

  assert.ok(result);
  assert.equal(result.task.meta.status, "awaiting-input");
});

test("appendTurn agent with non-zero exitCode flips to failed", async () => {
  const task = await store.createTask({
    title: "Failure demo",
    trigger: "manual",
    initialPrompt: "do thing",
  });

  const result = await store.appendTurn(task.meta.id, {
    role: "agent",
    content: "boom",
    exitCode: 1,
    error: "adapter crashed",
  });

  assert.ok(result);
  assert.equal(result.task.meta.status, "failed");
  assert.ok(result.task.meta.completedAt);
});

test("user reply re-arms running state", async () => {
  const task = await store.createTask({
    title: "Continue",
    trigger: "manual",
    initialPrompt: "first",
  });
  await store.appendTurn(task.meta.id, {
    role: "agent",
    content: "ok",
    tokens: { input: 10, output: 5 },
  });
  const result = await store.appendTurn(task.meta.id, {
    role: "user",
    content: "next",
  });
  assert.ok(result);
  assert.equal(result.task.meta.status, "running");
  assert.equal(result.task.turns.length, 3);
});

test("readTask round-trips frontmatter + multi-turn ordering", async () => {
  const task = await store.createTask({
    title: "Round trip",
    trigger: "manual",
    initialPrompt: "p1",
  });
  await store.appendTurn(task.meta.id, { role: "agent", content: "a1", tokens: { input: 10, output: 5 } });
  await store.appendTurn(task.meta.id, { role: "user", content: "p2" });
  await store.appendTurn(task.meta.id, { role: "agent", content: "a2", tokens: { input: 12, output: 6 } });

  const reread = await store.readTask(task.meta.id);
  assert.ok(reread);
  assert.equal(reread.turns.length, 4);
  assert.deepEqual(
    reread.turns.map((t) => `${t.turn}-${t.role}`),
    ["1-user", "2-agent", "3-user", "4-agent"]
  );
});

test("updateTask patches summary + status, preserves notes body", async () => {
  const task = await store.createTask({
    title: "Patch me",
    trigger: "manual",
    initialPrompt: "x",
  });
  const patched = await store.updateTask(task.meta.id, {
    status: "done",
    summary: "All set.",
    summaryEditedAt: new Date().toISOString(),
  });
  assert.ok(patched);
  assert.equal(patched.status, "done");
  assert.equal(patched.summary, "All set.");
  const reread = await store.readTask(task.meta.id);
  assert.equal(reread?.meta.status, "done");
  assert.equal(reread?.meta.summary, "All set.");
});

test("updateTurn rewrites pending agent turn with final content + tokens", async () => {
  const task = await store.createTask({
    title: "Pending flow",
    trigger: "manual",
    initialPrompt: "go",
  });
  const pending = await store.appendTurn(task.meta.id, {
    role: "agent",
    content: "thinking…",
    pending: true,
  });
  assert.ok(pending);
  const settled = await store.updateTurn(task.meta.id, 2, "agent", {
    content: "Done.",
    pending: false,
    tokens: { input: 200, output: 50 },
    artifacts: [{ kind: "file-create", path: "src/new.ts", added: 12 }],
  });
  assert.ok(settled);
  assert.equal(settled.content, "Done.");
  assert.equal(settled.pending, undefined);
  const reread = await store.readTask(task.meta.id);
  assert.equal(reread?.meta.status, "idle");
  assert.equal(reread?.meta.tokens?.total, 250);
  assert.deepEqual(reread?.artifactsIndex.filesCreated, ["src/new.ts"]);
});

test("setSessionHandle persists session.json", async () => {
  const task = await store.createTask({
    title: "Session demo",
    trigger: "manual",
    initialPrompt: "x",
  });
  await store.setSessionHandle(task.meta.id, {
    kind: "claude-code",
    resumeId: "abc123",
    alive: true,
    lastUsedAt: new Date().toISOString(),
  });
  const reread = await store.readTask(task.meta.id);
  assert.equal(reread?.session?.resumeId, "abc123");
  assert.equal(reread?.session?.alive, true);
});

test("listTaskMetas sorts by lastActivityAt desc and filters by status", async () => {
  // Wipe + recreate to keep this isolated from other tests
  await fs.rm(path.join(tempRoot, ".agents", ".tasks"), { recursive: true, force: true });

  const a = await store.createTask({ title: "A", trigger: "manual", initialPrompt: "1" });
  await new Promise((r) => setTimeout(r, 10));
  const b = await store.createTask({ title: "B", trigger: "manual", initialPrompt: "2" });
  await new Promise((r) => setTimeout(r, 10));
  await store.appendTurn(a.meta.id, {
    role: "agent",
    content: "later",
    tokens: { input: 5, output: 1 },
  });

  const all = await store.listTaskMetas();
  assert.equal(all.length, 2);
  assert.equal(all[0].id, a.meta.id, "A should be first because it was just touched");

  const idleOnly = await store.listTaskMetas({ status: "idle" });
  assert.equal(idleOnly.length, 1);
  assert.equal(idleOnly[0].id, a.meta.id);

  const runningOnly = await store.listTaskMetas({ status: "running" });
  assert.equal(runningOnly.length, 1);
  assert.equal(runningOnly[0].id, b.meta.id);
});

test("deleteTask removes the task directory", async () => {
  const task = await store.createTask({
    title: "Goodbye",
    trigger: "manual",
    initialPrompt: "x",
  });
  const ok = await store.deleteTask(task.meta.id);
  assert.equal(ok, true);
  const reread = await store.readTask(task.meta.id);
  assert.equal(reread, null);
});

test.after(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});
