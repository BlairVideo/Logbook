import type {
  ChatMessage,
  ChatStreamEvent,
  HealthResponseBody,
  ModelsResponseBody,
  SourceRef,
} from "../../shared/types";

export interface StreamChatHandlers {
  onSources: (sources: SourceRef[]) => void;
  onDelta: (content: string) => void;
}

export async function streamChatMessage(
  message: string,
  history: ChatMessage[],
  handlers: StreamChatHandlers,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed with status ${res.status}`);
  }

  if (!res.body) {
    throw new Error("Response had no body to stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;

      const event = JSON.parse(line) as ChatStreamEvent;
      if (event.type === "sources") handlers.onSources(event.sources);
      else if (event.type === "delta") handlers.onDelta(event.content);
      else if (event.type === "error") throw new Error(event.error);
    }
  }
}

export async function checkHealth(): Promise<HealthResponseBody> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
  return res.json();
}

export async function listModels(): Promise<ModelsResponseBody> {
  const res = await fetch("/api/models");
  if (!res.ok) throw new Error(`Failed to list models with status ${res.status}`);
  return res.json();
}

export async function setChatModel(model: string): Promise<{ current: string }> {
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed with status ${res.status}`);
  }

  return res.json();
}
