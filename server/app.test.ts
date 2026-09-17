import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const ADMIN_KEY = "test-admin-key";

vi.mock("./env", () => ({
  env: { adminKey: ADMIN_KEY, topK: 5, embedModel: "mock-embed" },
}));

vi.mock("./ollama", () => ({
  embed: vi.fn(async () => [1, 0, 0]),
  chatCompletionStream: vi.fn(async function* () {
    yield "Hello";
    yield " there";
  }),
  isOllamaReachable: vi.fn(async () => true),
  listModels: vi.fn(async () => ["command-r7b", "gemma3:12b"]),
}));

vi.mock("./rag", () => ({
  loadIndex: vi.fn(async () => ({ chunkCount: 42 })),
  retrieveTopK: vi.fn(async () => [{ id: "c1", text: "excerpt", source: { title: "Handbook", page: 3 } }]),
  chunksToSources: vi.fn(() => [{ title: "Handbook", page: 3 }]),
  invalidateIndex: vi.fn(),
}));

vi.mock("./config", () => ({
  getChatModel: vi.fn(async () => "command-r7b"),
  setChatModel: vi.fn(async () => undefined),
}));

vi.mock("./audit", () => ({
  logAuditEvent: vi.fn(async () => undefined),
  readAuditLog: vi.fn(async () => []),
  decryptPayload: vi.fn(async () => JSON.stringify({ question: "q", answer: "a" })),
}));

type FakeChild = EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };

const { spawnMock, getLastChild, resetLastChild } = vi.hoisted(() => {
  let last: FakeChild | null = null;
  const spawnMock = vi.fn(() => {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    last = child;
    return child;
  });
  return {
    spawnMock,
    getLastChild: (): FakeChild | null => last,
    resetLastChild: () => {
      last = null;
    },
  };
});

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

async function waitForChild(): Promise<FakeChild> {
  for (let i = 0; i < 100; i++) {
    const child = getLastChild();
    if (child) return child;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("spawn() was never called");
}

// supertest's Test object doesn't actually dispatch the request until it's
// awaited/`.then()`-ed, which is too late here: we need the request in
// flight *before* driving the fake child process. `.end()` dispatches
// immediately and reports completion via callback instead.
function sendNow(test: request.Test): Promise<request.Response> {
  return new Promise((resolve, reject) => {
    test.end((err, res) => (err ? reject(err) : resolve(res)));
  });
}

async function collectNdjson(res: { text: string }): Promise<unknown[]> {
  return res.text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLastChild();
});

describe("GET /api/health", () => {
  it("reports reachability and index size without requiring admin auth", async () => {
    const { app } = await import("./app");
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      chatModel: "command-r7b",
      embedModel: "mock-embed",
      indexedChunks: 42,
      ollamaReachable: true,
    });
  });
});

describe("GET /api/models", () => {
  it("lists models without requiring admin auth", async () => {
    const { app } = await import("./app");
    const res = await request(app).get("/api/models");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ models: ["command-r7b", "gemma3:12b"], current: "command-r7b" });
  });
});

describe("POST /api/models (admin-gated)", () => {
  it("rejects with 401 when no admin key is provided", async () => {
    const { app } = await import("./app");
    const { setChatModel } = await import("./config");

    const res = await request(app).post("/api/models").send({ model: "gemma3:12b" });

    expect(res.status).toBe(401);
    expect(setChatModel).not.toHaveBeenCalled();
  });

  it("rejects with 401 for a wrong admin key", async () => {
    const { app } = await import("./app");
    const res = await request(app)
      .post("/api/models")
      .set("x-admin-key", "wrong-key")
      .send({ model: "gemma3:12b" });

    expect(res.status).toBe(401);
  });

  it("switches the model and logs an audit event with the correct key", async () => {
    const { app } = await import("./app");
    const { setChatModel } = await import("./config");
    const { logAuditEvent } = await import("./audit");

    const res = await request(app)
      .post("/api/models")
      .set("x-admin-key", ADMIN_KEY)
      .send({ model: "gemma3:12b" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ current: "gemma3:12b" });
    expect(setChatModel).toHaveBeenCalledWith("gemma3:12b");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "model_change", newModel: "gemma3:12b" }),
    );
  });

  it("rejects an invalid body even with a correct admin key", async () => {
    const { app } = await import("./app");
    const res = await request(app).post("/api/models").set("x-admin-key", ADMIN_KEY).send({});

    expect(res.status).toBe(400);
  });
});

describe("POST /api/chat", () => {
  it("streams sources, then deltas, then done, and logs the full turn", async () => {
    const { app } = await import("./app");
    const { logAuditEvent } = await import("./audit");

    const res = await request(app).post("/api/chat").send({ message: "How many sick days?" });

    expect(res.status).toBe(200);
    const events = await collectNdjson(res);

    expect(events[0]).toEqual({ type: "sources", sources: [{ title: "Handbook", page: 3 }] });
    expect(events.some((e) => (e as { type: string }).type === "delta")).toBe(true);
    expect(events[events.length - 1]).toEqual({ type: "done" });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat",
        model: "command-r7b",
        question: "How many sick days?",
        sourceTitles: ["Handbook"],
      }),
    );
  });

  it("rejects an empty message with 400", async () => {
    const { app } = await import("./app");
    const res = await request(app).post("/api/chat").send({ message: "" });
    expect(res.status).toBe(400);
  });

  it("does not require admin auth", async () => {
    const { app } = await import("./app");
    const res = await request(app).post("/api/chat").send({ message: "hi there" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/verify", () => {
  it("returns 401 without a key and 200 with the right one", async () => {
    const { app } = await import("./app");

    const unauthed = await request(app).post("/api/admin/verify");
    expect(unauthed.status).toBe(401);

    const authed = await request(app).post("/api/admin/verify").set("x-admin-key", ADMIN_KEY);
    expect(authed.status).toBe(200);
    expect(authed.body).toEqual({ ok: true });
  });
});

describe("GET /api/admin/audit-log", () => {
  it("rejects without admin auth", async () => {
    const { app } = await import("./app");
    const res = await request(app).get("/api/admin/audit-log");
    expect(res.status).toBe(401);
  });

  it("decrypts chat entries for display when authorized", async () => {
    const { app } = await import("./app");
    const { readAuditLog } = await import("./audit");
    vi.mocked(readAuditLog).mockResolvedValueOnce([
      {
        id: "1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "chat",
        model: "command-r7b",
        sourceTitles: ["Handbook"],
        payload: { iv: "x", authTag: "y", ciphertext: "z" },
      },
    ]);

    const res = await request(app).get("/api/admin/audit-log").set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([
      {
        id: "1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "chat",
        model: "command-r7b",
        sourceTitles: ["Handbook"],
        question: "q",
        answer: "a",
      },
    ]);
  });
});

describe("POST /api/admin/ingest", () => {
  it("rejects without admin auth", async () => {
    const { app } = await import("./app");
    const res = await request(app).post("/api/admin/ingest");
    expect(res.status).toBe(401);
  });

  it("streams log lines and reports success, invalidating the index", async () => {
    const { app } = await import("./app");
    const { invalidateIndex } = await import("./rag");

    const reqPromise = sendNow(request(app).post("/api/admin/ingest").set("x-admin-key", ADMIN_KEY));

    const child = await waitForChild();
    child.stdout.emit("data", Buffer.from("Found 5 document(s)\n"));
    child.stdout.emit("data", Buffer.from("embedding [####] 1/1 (100%)\r"));
    child.emit("close", 0);

    const res = await reqPromise;
    const events = await collectNdjson(res);

    expect(events).toContainEqual({ type: "log", line: "Found 5 document(s)" });
    expect(events).toContainEqual({ type: "log", line: "embedding [####] 1/1 (100%)" });
    expect(events[events.length - 1]).toEqual({ type: "done", success: true });
    expect(invalidateIndex).toHaveBeenCalledOnce();
  });

  it("reports failure and does not invalidate the index on a non-zero exit code", async () => {
    const { app } = await import("./app");
    const { invalidateIndex } = await import("./rag");

    const reqPromise = sendNow(request(app).post("/api/admin/ingest").set("x-admin-key", ADMIN_KEY));
    const child = await waitForChild();
    child.emit("close", 1);

    const res = await reqPromise;
    const events = await collectNdjson(res);

    expect(events[events.length - 1]).toEqual({ type: "done", success: false });
    expect(invalidateIndex).not.toHaveBeenCalled();
  });

  it("rejects a concurrent run with 409 while one is already in progress", async () => {
    const { app } = await import("./app");

    const firstReq = sendNow(request(app).post("/api/admin/ingest").set("x-admin-key", ADMIN_KEY));
    const child = await waitForChild();

    const secondRes = await request(app).post("/api/admin/ingest").set("x-admin-key", ADMIN_KEY);
    expect(secondRes.status).toBe(409);

    // Let the first run finish so it doesn't leak into other tests.
    child.emit("close", 0);
    await firstReq;
  });
});
