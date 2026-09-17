import { spawn } from "node:child_process";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { env } from "./env";
import { getChatModel, setChatModel } from "./config";
import { embed, chatCompletionStream, isOllamaReachable, listModels } from "./ollama";
import { loadIndex, retrieveTopK, chunksToSources, invalidateIndex } from "./rag";
import { SYSTEM_PROMPT, buildUserTurn, CLOSING_NOTE } from "./prompt";
import { logAuditEvent, readAuditLog, decryptPayload } from "./audit";
import { requireAdmin } from "./adminAuth";
import type {
  AuditLogItem,
  AuditLogResponseBody,
  ChatStreamEvent,
  HealthResponseBody,
  IngestStreamEvent,
  ModelsResponseBody,
} from "../shared/types";

// Route definitions live here (rather than in index.ts) so tests can drive
// the app with supertest without binding a real port via app.listen.
export const app = express();
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

app.post("/api/models", requireAdmin, async (req, res) => {
  const parsed = setModelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const previousModel = await getChatModel();
  await setChatModel(parsed.data.model);
  void logAuditEvent({ type: "model_change", previousModel, newModel: parsed.data.model });
  res.json({ current: parsed.data.model });
});

app.post("/api/admin/verify", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/admin/audit-log", requireAdmin, async (_req, res) => {
  const entries = await readAuditLog();
  const items: AuditLogItem[] = await Promise.all(
    entries
      .slice(-200)
      .reverse()
      .map(async (entry) => {
        if (entry.type === "chat") {
          const { question, answer } = JSON.parse(await decryptPayload(entry.payload)) as {
            question: string;
            answer: string;
          };
          return {
            id: entry.id,
            timestamp: entry.timestamp,
            type: "chat" as const,
            model: entry.model,
            sourceTitles: entry.sourceTitles,
            question,
            answer,
          };
        }
        return {
          id: entry.id,
          timestamp: entry.timestamp,
          type: "model_change" as const,
          previousModel: entry.previousModel,
          newModel: entry.newModel,
        };
      }),
  );

  const body: AuditLogResponseBody = { entries: items };
  res.json(body);
});

let ingestInProgress = false;

app.post("/api/admin/ingest", requireAdmin, (_req, res) => {
  if (ingestInProgress) {
    res.status(409).json({ error: "An ingestion run is already in progress." });
    return;
  }

  ingestInProgress = true;
  res.setHeader("Content-Type", "application/x-ndjson");
  const send = (event: IngestStreamEvent) => res.write(`${JSON.stringify(event)}\n`);

  const projectRoot = path.resolve(import.meta.dirname, "..");
  const child = spawn("npm", ["run", "ingest"], { cwd: projectRoot });

  // The ingest script's progress bar rewrites its line with \r rather than
  // emitting \n, so split on either to forward each update as its own event.
  let buffer = "";
  const flushLines = (chunk: string) => {
    buffer += chunk;
    let splitIndex: number;
    while ((splitIndex = buffer.search(/[\r\n]/)) !== -1) {
      const line = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 1);
      if (line.trim()) send({ type: "log", line });
    }
  };

  child.stdout.on("data", (data: Buffer) => flushLines(data.toString("utf-8")));
  child.stderr.on("data", (data: Buffer) => flushLines(data.toString("utf-8")));

  child.on("close", (code) => {
    if (buffer.trim()) send({ type: "log", line: buffer.trim() });
    ingestInProgress = false;
    const success = code === 0;
    if (success) invalidateIndex();
    send({ type: "done", success });
    res.end();
  });

  child.on("error", (err) => {
    ingestInProgress = false;
    send({ type: "error", error: err.message });
    res.end();
  });
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
    const sources = chunksToSources(topChunks);
    send({ type: "sources", sources });

    const chatModel = await getChatModel();
    let answer = "";
    for await (const token of chatCompletionStream(messages, chatModel)) {
      answer += token;
      send({ type: "delta", content: token });
    }
    answer += CLOSING_NOTE;
    send({ type: "delta", content: CLOSING_NOTE });
    send({ type: "done" });
    res.end();

    void logAuditEvent({
      type: "chat",
      model: chatModel,
      sourceTitles: sources.map((s) => s.title),
      question: message,
      answer,
    });
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
