"use client";

import type {
  CreateConversationRequest,
  CreateConversationResponse,
} from "@/types/conversations";

function getErrorMessage(
  fallback: string,
  payload: unknown
): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return payload.error;
  }

  return fallback;
}

export async function createConversation(
  request: CreateConversationRequest,
  errorMessage = "Failed to start conversation"
): Promise<CreateConversationResponse> {
  const response = await fetch("/api/agents/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const payload = (await response.json().catch(() => null)) as
    | CreateConversationResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(getErrorMessage(errorMessage, payload));
  }

  if (!payload || typeof payload !== "object" || !("conversation" in payload)) {
    throw new Error(errorMessage);
  }

  return payload as CreateConversationResponse;
}
