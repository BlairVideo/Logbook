import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 5174),
  ollamaHost: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  chatModel: process.env.CHAT_MODEL ?? "llama3.1:latest",
  embedModel: process.env.EMBED_MODEL ?? "nomic-embed-text",
  topK: Number(process.env.TOP_K ?? 5),
};
