import { env } from "./env";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function embed(text: string, model = env.embedModel): Promise<number[]> {
  const res = await fetch(`${env.ollamaHost}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embeddings request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export async function chatCompletion(
  messages: OllamaMessage[],
  model = env.chatModel,
): Promise<string> {
  const res = await fetch(`${env.ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { num_ctx: env.chatNumCtx },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama chat request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
}

export async function isOllamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${env.ollamaHost}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}
