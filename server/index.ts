import express from "express";
import { z } from "zod";
import { env } from "./env";
import { embed, chatCompletion, isOllamaReachable } from "./ollama";
import { loadIndex, retrieveTopK, chunksToSources } from "./rag";
import { SYSTEM_PROMPT, buildUserTurn } from "./prompt";
import type { ChatResponseBody, HealthResponseBody } from "../shared/types";

const app = express();
app.use(express.json());

const chatRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
});

app.get("/api/health", async (_req, res) => {
  const [ollamaReachable, index] = await Promise.all([
    isOllamaReachable(),
    loadIndex().catch(() => null),
  ]);

  const body: HealthResponseBody = {
    ok: ollamaReachable && index !== null,
    chatModel: env.chatModel,
    embedModel: env.embedModel,
    indexedChunks: index?.chunkCount ?? 0,
    ollamaReachable,
  };

  res.json(body);
});

app.post("/api/chat", async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, history = [] } = parsed.data;

  try {
    const queryEmbedding = await embed(message);
    const topChunks = await retrieveTopK(queryEmbedding, env.topK);

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.slice(-6),
      { role: "user" as const, content: buildUserTurn(message, topChunks) },
    ];

    const answer = await chatCompletion(messages);
    const body: ChatResponseBody = { answer, sources: chunksToSources(topChunks) };
    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to reach Ollama or the policy index." });
  }
});

app.listen(env.port, () => {
  console.log(`Logbook API listening on http://localhost:${env.port}`);
});
