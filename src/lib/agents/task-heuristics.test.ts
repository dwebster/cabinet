import test from "node:test";
import assert from "node:assert/strict";
import { deriveSummary, looksLikeAwaitingInput } from "./task-heuristics";

test("looksLikeAwaitingInput: yes when last line ends with '?'", () => {
  assert.equal(looksLikeAwaitingInput("All set.\n\nShould I proceed?"), true);
});

test("looksLikeAwaitingInput: no when last line is a period", () => {
  assert.equal(looksLikeAwaitingInput("Done. All tests pass."), false);
});

test("looksLikeAwaitingInput: no when question is inside a code fence", () => {
  const content = "Here is the code:\n\n```\nconst a = 1; // is this ok?\n```";
  assert.equal(looksLikeAwaitingInput(content), false);
});

test("looksLikeAwaitingInput: no when content is mostly code", () => {
  const code = "```ts\n" + "const a = 1;\n".repeat(50) + "```";
  const content = `${code}\n\nWhat next?`;
  assert.equal(looksLikeAwaitingInput(content), false);
});

test("looksLikeAwaitingInput: yes when a question comes after a code block", () => {
  const content = "```ts\nconst a = 1;\n```\n\nShould I extract this into a helper?";
  assert.equal(looksLikeAwaitingInput(content), true);
});

test("deriveSummary returns first sentence of latest settled agent turn", () => {
  const summary = deriveSummary({
    turns: [
      { role: "user", content: "do x" },
      { role: "agent", content: "Done. I edited the login module and ran tests." },
    ],
  });
  assert.equal(summary, "Done.");
});

test("deriveSummary falls back to first user turn when no agent turns", () => {
  const summary = deriveSummary({
    turns: [{ role: "user", content: "Refactor the auth module. It needs SSO." }],
  });
  assert.equal(summary, "Refactor the auth module.");
});

test("deriveSummary skips pending agent turns", () => {
  const summary = deriveSummary({
    turns: [
      { role: "user", content: "go" },
      { role: "agent", content: "Finished successfully." },
      { role: "user", content: "again" },
      { role: "agent", content: "Working…", pending: true },
    ],
  });
  assert.equal(summary, "Finished successfully.");
});

test("deriveSummary truncates very long first sentences", () => {
  const long = "A".repeat(500) + ".";
  const summary = deriveSummary({
    turns: [{ role: "agent", content: long }],
  });
  assert.ok(summary);
  assert.ok(summary.length <= 181);
  assert.ok(summary.endsWith("…"));
});
