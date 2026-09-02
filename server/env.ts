import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 5174),
  ollamaHost: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  chatModel: process.env.CHAT_MODEL ?? "gemma3:12b",
  embedModel: process.env.EMBED_MODEL ?? "nomic-embed-text",
  topK: Number(process.env.TOP_K ?? 5),
  // Ollama defaults to a 4096-token context window regardless of what the model
  // supports (llama3.1 supports up to 131072). A 5-chunk RAG prompt plus a few
  // turns of history can exceed 4096 on its own, causing Ollama to silently
  // truncate from the front of the prompt — dropping the system prompt's
  // grounding rules and/or the earliest retrieved excerpts. Must be set
  // explicitly per-request via options.num_ctx.
  chatNumCtx: Number(process.env.CHAT_NUM_CTX ?? 16384),
};
