import type { ChatMessage, ChatResponseBody, HealthResponseBody } from "../../shared/types";

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<ChatResponseBody> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function checkHealth(): Promise<HealthResponseBody> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
  return res.json();
}
