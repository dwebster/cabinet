const FENCE_RE = /```[\s\S]*?```/g;

/**
 * Best-effort detection: does this agent reply look like it's waiting on a user answer?
 *
 * Heuristic: the last non-empty, non-code-fenced line ends with a question mark,
 * and the output isn't dominated by code or long output.
 */
export function looksLikeAwaitingInput(content: string): boolean {
  if (!content) return false;
  const stripped = content.replace(FENCE_RE, "").trim();
  if (!stripped) return false;
  // If >70% of the content is inside fenced code, it's probably just showing code.
  const fenceLen = (content.match(FENCE_RE) || []).reduce((a, b) => a + b.length, 0);
  if (fenceLen / Math.max(content.length, 1) > 0.7) return false;

  const lines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] || "";
  return last.endsWith("?");
}

/**
 * Derive a short rolling summary for a task. v1 is a heuristic:
 * - If the latest settled agent turn has content, use its first sentence (≤160 chars).
 * - Otherwise, fall back to the first user turn's first sentence.
 *
 * Keep this pure + synchronous so we can swap in an LLM-backed version later without
 * changing call sites.
 */
export function deriveSummary(input: {
  turns: { role: "user" | "agent"; content: string; pending?: boolean }[];
  existingSummary?: string;
}): string | undefined {
  const settled = input.turns.filter((t) => !t.pending);
  const lastAgent = [...settled].reverse().find((t) => t.role === "agent");
  const firstUser = settled.find((t) => t.role === "user");

  const source = lastAgent?.content?.trim() || firstUser?.content?.trim();
  if (!source) return input.existingSummary;

  const firstSentence = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();

  if (!firstSentence) return input.existingSummary;
  if (firstSentence.length <= 180) return firstSentence;
  return `${firstSentence.slice(0, 160).trim()}…`;
}
