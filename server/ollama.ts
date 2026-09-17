import { env } from "./env";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function embed(text: string, model = env.embedModel): Promise<number[]> {
  const res = await fetch(`${env.ollamaHost}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text, keep_alive: env.chatKeepAlive }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embeddings request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

interface OllamaChatStreamLine {
  message?: { content: string };
  done: boolean;
}

// Streams response tokens as they're generated instead of waiting for the full
// answer, so the UI can start showing text immediately (retrieval already
// happened, so sources are known before the first token even arrives).
export async function* chatCompletionStream(
  messages: OllamaMessage[],
  model = env.chatModel,
): AsyncGenerator<string> {
  const res = await fetch(`${env.ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      keep_alive: env.chatKeepAlive,
      options: { num_ctx: env.chatNumCtx },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama chat request failed: ${res.status} ${await res.text()}`);
  }

  if (!res.body) {
    throw new Error("Ollama chat response had no body to stream");
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

      const parsed = JSON.parse(line) as OllamaChatStreamLine;
      if (parsed.message?.content) yield parsed.message.content;
      if (parsed.done) return;
    }
  }
}

export async function isOllamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${env.ollamaHost}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${env.ollamaHost}/api/tags`);

  if (!res.ok) {
    throw new Error(`Ollama tags request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { models: { name: string }[] };
  return data.models.map((m) => m.name);
}
