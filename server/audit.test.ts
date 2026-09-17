import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (p: string) => {
    if (!store.has(p)) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    return store.get(p) as string;
  }),
  writeFile: vi.fn(async (p: string, data: string) => {
    store.set(p, String(data));
  }),
  appendFile: vi.fn(async (p: string, data: string) => {
    store.set(p, (store.get(p) ?? "") + String(data));
  }),
}));

// A fixed 32-byte (64 hex char) key so tests never touch a real key file.
vi.mock("./env", () => ({
  env: { auditLogKey: "11".repeat(32) },
}));

beforeEach(() => {
  store.clear();
  vi.resetModules();
});

describe("audit log encryption", () => {
  it("round-trips question/answer text through encrypt and decrypt", async () => {
    const { logAuditEvent, readAuditLog, decryptPayload } = await import("./audit");

    await logAuditEvent({
      type: "chat",
      model: "command-r7b",
      sourceTitles: ["Employee Handbook"],
      question: "How many sick days do I get?",
      answer: "You get 40 hours per year.",
    });

    const entries = await readAuditLog();
    expect(entries).toHaveLength(1);

    const decrypted = JSON.parse(await decryptPayload(entries[0].payload));
    expect(decrypted).toEqual({
      question: "How many sick days do I get?",
      answer: "You get 40 hours per year.",
    });
  });

  it("never stores the plaintext question/answer anywhere in the log file", async () => {
    const { logAuditEvent } = await import("./audit");

    await logAuditEvent({
      type: "chat",
      model: "command-r7b",
      sourceTitles: [],
      question: "a very specific and sensitive question",
      answer: "a very specific and sensitive answer",
    });

    const raw = [...store.values()].join("\n");
    expect(raw).not.toContain("sensitive question");
    expect(raw).not.toContain("sensitive answer");
  });

  it("stores model-change metadata in cleartext for filtering without decryption", async () => {
    const { logAuditEvent, readAuditLog } = await import("./audit");

    await logAuditEvent({ type: "model_change", previousModel: "gemma3:4b", newModel: "command-r7b" });

    const [entry] = await readAuditLog();
    expect(entry.type).toBe("model_change");
    expect(entry.previousModel).toBe("gemma3:4b");
    expect(entry.newModel).toBe("command-r7b");
  });

  it("rejects a tampered ciphertext instead of returning corrupted plaintext", async () => {
    const { logAuditEvent, readAuditLog, decryptPayload } = await import("./audit");

    await logAuditEvent({
      type: "chat",
      model: "command-r7b",
      sourceTitles: [],
      question: "q",
      answer: "a",
    });

    const [entry] = await readAuditLog();
    const tampered = {
      ...entry.payload,
      ciphertext: entry.payload.ciphertext.slice(0, -2) + (entry.payload.ciphertext.endsWith("00") ? "ff" : "00"),
    };

    await expect(decryptPayload(tampered)).rejects.toThrow();
  });

  it("appends multiple entries and reads them back in order", async () => {
    const { logAuditEvent, readAuditLog } = await import("./audit");

    await logAuditEvent({ type: "model_change", previousModel: "a", newModel: "b" });
    await logAuditEvent({ type: "model_change", previousModel: "b", newModel: "c" });

    const entries = await readAuditLog();
    expect(entries.map((e) => (e.type === "model_change" ? e.newModel : undefined))).toEqual(["b", "c"]);
  });

  it("returns an empty array when no log file exists yet", async () => {
    const { readAuditLog } = await import("./audit");
    expect(await readAuditLog()).toEqual([]);
  });
});
