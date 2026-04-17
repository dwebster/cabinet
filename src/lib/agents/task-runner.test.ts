import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { agentAdapterRegistry } from "./adapters/registry";
import type { AgentExecutionAdapter } from "./adapters/types";

let tempRoot: string;
type Store = typeof import("./task-store");
type Runner = typeof import("./task-runner");
let store: Store;
let runner: Runner;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-task-runner-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  store = await import("./task-store");
  runner = await import("./task-runner");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

interface MockExecution {
  sessionIdSeen: string | null | undefined;
  promptSeen: string;
}

function buildMockAdapter({
  supportsSessionResume,
  response,
  captures,
}: {
  supportsSessionResume: boolean;
  response: { output: string; sessionId?: string | null; exitCode?: number };
  captures: MockExecution[];
}): AgentExecutionAdapter {
  return {
    type: "mock_local",
    name: "Mock Local",
    executionEngine: "structured_cli",
    providerId: "mock",
    supportsSessionResume,
    async testEnvironment() {
      return {
        adapterType: "mock_local",
        status: "pass",
        checks: [],
        testedAt: new Date().toISOString(),
      };
    },
    async execute(ctx) {
      captures.push({
        sessionIdSeen: ctx.sessionId,
        promptSeen: ctx.prompt,
      });
      return {
        exitCode: response.exitCode ?? 0,
        signal: null,
        timedOut: false,
        output: response.output,
        sessionId: response.sessionId ?? "session-returned",
        usage: { inputTokens: 100, outputTokens: 40 },
      };
    },
  };
}

test("runTaskTurn fresh run sends replay prompt and persists session", async () => {
  const captures: MockExecution[] = [];
  agentAdapterRegistry.registerExternal(
    buildMockAdapter({
      supportsSessionResume: true,
      response: { output: "Hi there.", sessionId: "sess-1" },
      captures,
    })
  );

  const task = await store.createTask({
    title: "Resume test 1",
    trigger: "manual",
    initialPrompt: "Hello",
    adapterType: "mock_local",
  });

  await runner.runTaskTurn(task.meta.id);
  const reread = await store.readTask(task.meta.id);

  assert.ok(reread);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].sessionIdSeen, null, "fresh run passes null sessionId");
  assert.match(captures[0].promptSeen, /USER:\s*\n?Hello/);

  const lastTurn = reread.turns[reread.turns.length - 1];
  assert.equal(lastTurn.role, "agent");
  assert.equal(lastTurn.content, "Hi there.");
  assert.equal(lastTurn.pending, undefined);
  assert.equal(lastTurn.tokens?.input, 100);
  assert.equal(reread.session?.resumeId, "sess-1");
  assert.equal(reread.session?.alive, true);
  assert.equal(reread.meta.status, "idle");

  agentAdapterRegistry.unregisterExternal("mock_local");
});

test("runTaskTurn with live session passes --resume session id and only last user message", async () => {
  const captures: MockExecution[] = [];
  agentAdapterRegistry.registerExternal(
    buildMockAdapter({
      supportsSessionResume: true,
      response: { output: "Continuing.", sessionId: "sess-2" },
      captures,
    })
  );

  const task = await store.createTask({
    title: "Resume test 2",
    trigger: "manual",
    initialPrompt: "first",
    adapterType: "mock_local",
  });

  // Simulate an agent reply + live session
  await store.appendTurn(task.meta.id, {
    role: "agent",
    content: "OK.",
    tokens: { input: 10, output: 5 },
  });
  await store.setSessionHandle(task.meta.id, {
    kind: "mock_local",
    resumeId: "sess-1",
    alive: true,
    lastUsedAt: new Date().toISOString(),
  });

  // User sends a follow-up (caller would do this via POST /turns)
  await store.appendTurn(task.meta.id, {
    role: "user",
    content: "second question",
  });

  await runner.runTaskTurn(task.meta.id);

  assert.equal(captures.length, 1);
  assert.equal(captures[0].sessionIdSeen, "sess-1", "resume mode passes old session id");
  assert.equal(
    captures[0].promptSeen,
    "second question",
    "resume mode sends only the latest user message, not replay"
  );

  const reread = await store.readTask(task.meta.id);
  assert.equal(reread?.session?.resumeId, "sess-2");

  agentAdapterRegistry.unregisterExternal("mock_local");
});

test("runTaskTurn with replay-only adapter concatenates full history", async () => {
  const captures: MockExecution[] = [];
  agentAdapterRegistry.registerExternal(
    buildMockAdapter({
      supportsSessionResume: false,
      response: { output: "Replay reply." },
      captures,
    })
  );

  const task = await store.createTask({
    title: "Replay test",
    trigger: "manual",
    initialPrompt: "one",
    adapterType: "mock_local",
  });
  await store.appendTurn(task.meta.id, {
    role: "agent",
    content: "two",
    tokens: { input: 5, output: 2 },
  });
  await store.appendTurn(task.meta.id, { role: "user", content: "three" });

  await runner.runTaskTurn(task.meta.id);

  assert.equal(captures[0].sessionIdSeen, null);
  assert.match(captures[0].promptSeen, /USER:\s*\n?one/);
  assert.match(captures[0].promptSeen, /ASSISTANT:\s*\n?two/);
  assert.match(captures[0].promptSeen, /USER:\s*\n?three/);

  agentAdapterRegistry.unregisterExternal("mock_local");
});

test("runTaskTurn flips to awaiting-input when agent reply ends with a question", async () => {
  const captures: MockExecution[] = [];
  agentAdapterRegistry.registerExternal(
    buildMockAdapter({
      supportsSessionResume: true,
      response: { output: "I can do that. Should I use SAML or OIDC?" },
      captures,
    })
  );

  const task = await store.createTask({
    title: "Awaiting input via heuristic",
    trigger: "manual",
    initialPrompt: "add SSO",
    adapterType: "mock_local",
  });

  await runner.runTaskTurn(task.meta.id);
  const reread = await store.readTask(task.meta.id);

  assert.equal(reread?.meta.status, "awaiting-input");
  const lastTurn = reread!.turns[reread!.turns.length - 1];
  assert.equal(lastTurn.awaitingInput, true);

  agentAdapterRegistry.unregisterExternal("mock_local");
});

test("runTaskTurn auto-generates a rolling summary after agent reply", async () => {
  const captures: MockExecution[] = [];
  agentAdapterRegistry.registerExternal(
    buildMockAdapter({
      supportsSessionResume: true,
      response: { output: "Refactored the login module. All 24 tests pass." },
      captures,
    })
  );

  const task = await store.createTask({
    title: "Summary test",
    trigger: "manual",
    initialPrompt: "refactor login",
    adapterType: "mock_local",
  });

  await runner.runTaskTurn(task.meta.id);
  const reread = await store.readTask(task.meta.id);

  assert.equal(reread?.meta.summary, "Refactored the login module.");

  agentAdapterRegistry.unregisterExternal("mock_local");
});

test("runTaskTurn skips summary auto-update when user edited it recently", async () => {
  const captures: MockExecution[] = [];
  agentAdapterRegistry.registerExternal(
    buildMockAdapter({
      supportsSessionResume: true,
      response: { output: "New agent reply here." },
      captures,
    })
  );

  const task = await store.createTask({
    title: "Skip auto-summary",
    trigger: "manual",
    initialPrompt: "go",
    adapterType: "mock_local",
  });

  // User manually sets a summary just now
  await store.updateTask(task.meta.id, {
    summary: "My manual summary",
    summaryEditedAt: new Date().toISOString(),
  });

  await runner.runTaskTurn(task.meta.id);
  const reread = await store.readTask(task.meta.id);
  assert.equal(reread?.meta.summary, "My manual summary", "user edit wins");

  agentAdapterRegistry.unregisterExternal("mock_local");
});

test("runTaskTurn with failing adapter marks turn + task as failed", async () => {
  const captures: MockExecution[] = [];
  agentAdapterRegistry.registerExternal(
    buildMockAdapter({
      supportsSessionResume: true,
      response: { output: "boom", exitCode: 1, sessionId: null },
      captures,
    })
  );

  const task = await store.createTask({
    title: "Failure test",
    trigger: "manual",
    initialPrompt: "break it",
    adapterType: "mock_local",
  });

  await runner.runTaskTurn(task.meta.id);
  const reread = await store.readTask(task.meta.id);

  assert.equal(reread?.meta.status, "failed");
  const lastTurn = reread!.turns[reread!.turns.length - 1];
  assert.equal(lastTurn.role, "agent");
  assert.equal(lastTurn.exitCode, 1);

  agentAdapterRegistry.unregisterExternal("mock_local");
});
