import type {
  AppendTurnInput,
  Task,
  TaskMeta,
  UpdateTaskInput,
} from "@/types/tasks";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // body not JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchTask(id: string, cabinetPath?: string): Promise<Task> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const url = `/api/tasks/${encodeURIComponent(id)}${params.size ? `?${params}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await jsonOrThrow<{ task: Task }>(res);
  return data.task;
}

export async function postTurn(
  id: string,
  input: AppendTurnInput,
  cabinetPath?: string
): Promise<{ turn: Task["turns"][number]; task: Task }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, cabinetPath }),
  });
  return jsonOrThrow(res);
}

export async function patchTask(
  id: string,
  patch: UpdateTaskInput,
  cabinetPath?: string
): Promise<{ meta: TaskMeta }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...patch, cabinetPath }),
  });
  return jsonOrThrow(res);
}

export async function createTaskRequest(input: {
  title: string;
  initialPrompt: string;
  cabinetPath?: string;
  agentSlug?: string;
}): Promise<Task> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trigger: "manual", ...input }),
  });
  const data = await jsonOrThrow<{ task: Task }>(res);
  return data.task;
}
