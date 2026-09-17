import express from "express";
import { z } from "zod";
import { env } from "./env";
import { getChatModel, setChatModel } from "./config";
import { embed, chatCompletionStream, isOllamaReachable, listModels } from "./ollama";
import { loadIndex, retrieveTopK, chunksToSources } from "./rag";
import { SYSTEM_PROMPT, buildUserTurn, CLOSING_NOTE } from "./prompt";
import type { ChatStreamEvent, HealthResponseBody, ModelsResponseBody } from "../shared/types";

const app = express();
app.use(express.json());

const chatRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
});

const setModelRequestSchema = z.object({
  model: z.string().min(1),
});

app.get("/api/health", async (_req, res) => {
  const [ollamaReachable, index, chatModel] = await Promise.all([
    isOllamaReachable(),
    loadIndex().catch(() => null),
    getChatModel(),
  ]);

  const body: HealthResponseBody = {
    ok: ollamaReachable && index !== null,
    chatModel,
    embedModel: env.embedModel,
    indexedChunks: index?.chunkCount ?? 0,
    ollamaReachable,
  };

  res.json(body);
});

app.get("/api/models", async (_req, res) => {
  try {
    const [models, current] = await Promise.all([listModels(), getChatModel()]);
    const body: ModelsResponseBody = { models, current };
    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to reach Ollama." });
  }
});

app.post("/api/models", async (req, res) => {
  const parsed = setModelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  await setChatModel(parsed.data.model);
  res.json({ current: parsed.data.model });
});

app.post("/api/chat", async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, history = [] } = parsed.data;

  const send = (event: ChatStreamEvent) => res.write(`${JSON.stringify(event)}\n`);

  try {
    const queryEmbedding = await embed(message);
    const topChunks = await retrieveTopK(queryEmbedding, env.topK);

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.slice(-6),
      { role: "user" as const, content: buildUserTurn(message, topChunks) },
    ];

    res.setHeader("Content-Type", "application/x-ndjson");
    send({ type: "sources", sources: chunksToSources(topChunks) });

    for await (const token of chatCompletionStream(messages, await getChatModel())) {
      send({ type: "delta", content: token });
    }
    send({ type: "delta", content: CLOSING_NOTE });
    send({ type: "done" });
    res.end();
  } catch (err) {
    console.error(err);
    if (res.headersSent) {
      send({ type: "error", error: "Failed to reach Ollama or the policy index." });
      res.end();
    } else {
      res.status(502).json({ error: "Failed to reach Ollama or the policy index." });
    }
  }
});

app.listen(env.port, () => {
  console.log(`Logbook API listening on http://localhost:${env.port}`);
});
