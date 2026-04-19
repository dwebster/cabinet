"use client";

/**
 * Thin client helpers for the v2 task board's write actions. Each maps to a
 * PATCH on /api/agents/conversations/[id]. Server shape is defined in
 * src/app/api/agents/conversations/[id]/route.ts.
 */

type PatchBody = {
  archived?: boolean;
  archivedAt?: string | null;
  boardOrder?: number;
};

async function patchConversation(
  id: string,
  body: PatchBody,
  cabinetPath?: string
): Promise<void> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(`/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`conversation PATCH ${id} failed: ${res.status} ${text}`);
  }
}

export async function archiveConversation(id: string, cabinetPath?: string): Promise<void> {
  await patchConversation(id, { archived: true }, cabinetPath);
}

export async function restoreConversation(id: string, cabinetPath?: string): Promise<void> {
  await patchConversation(id, { archived: false }, cabinetPath);
}

export async function setConversationBoardOrder(
  id: string,
  boardOrder: number,
  cabinetPath?: string
): Promise<void> {
  await patchConversation(id, { boardOrder }, cabinetPath);
}

/**
 * Stops a live conversation. Backed by `PATCH { action: "stop" }` which
 * kills the daemon session and finalizes the conversation as failed.
 */
export async function stopConversation(id: string, cabinetPath?: string): Promise<void> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(`/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`stop ${id} failed: ${res.status} ${text}`);
  }
}

/**
 * Restarts a finalized conversation by spawning a fresh run from its
 * original prompt. Returns the new conversation meta.
 * Backed by `PATCH { action: "restart" }`.
 */
export async function restartConversation(
  id: string,
  cabinetPath?: string
): Promise<{ conversation: { id: string; cabinetPath?: string } }> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(`/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restart" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`restart ${id} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { conversation: { id: string; cabinetPath?: string } };
}
