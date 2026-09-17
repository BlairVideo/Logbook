import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

const DATA_DIR = path.resolve(import.meta.dirname, "data");
const KEY_PATH = path.join(DATA_DIR, "audit-key.bin");
const LOG_PATH = path.join(DATA_DIR, "audit-log.jsonl");

const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

// The audit log records question/answer content, which may include PII an
// employee volunteers in their question (per CLAUDE.md's "no unencrypted
// PII at rest" mandate). Everything else about a chat turn (timestamp,
// model, retrieved source titles) is useful to filter/review without
// decrypting, so only the question/answer text is encrypted.
async function getKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  if (env.auditLogKey) {
    const fromEnv = Buffer.from(env.auditLogKey, "hex");
    if (fromEnv.length !== 32) {
      throw new Error("AUDIT_LOG_KEY must be a 64-character hex string (32 bytes).");
    }
    cachedKey = fromEnv;
    return cachedKey;
  }

  await mkdir(DATA_DIR, { recursive: true });

  try {
    cachedKey = await readFile(KEY_PATH);
    return cachedKey;
  } catch {
    const generated = randomBytes(32);
    await writeFile(KEY_PATH, generated, { mode: 0o600 });
    cachedKey = generated;
    return cachedKey;
  }
}

interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

async function encrypt(plaintext: string): Promise<EncryptedPayload> {
  const key = await getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

export async function decryptPayload(payload: EncryptedPayload): Promise<string> {
  const key = await getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf-8");
}

interface ChatAuditEvent {
  type: "chat";
  model: string;
  sourceTitles: string[];
  question: string;
  answer: string;
}

interface ModelChangeAuditEvent {
  type: "model_change";
  previousModel: string;
  newModel: string;
}

export type AuditEvent = ChatAuditEvent | ModelChangeAuditEvent;

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: AuditEvent["type"];
  model?: string;
  previousModel?: string;
  newModel?: string;
  sourceTitles?: string[];
  payload: EncryptedPayload;
}

// Best-effort: an audit logging failure should never break the chat response
// itself, so callers fire-and-forget this and only log failures to stderr.
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });

    const entry: AuditLogEntry =
      event.type === "chat"
        ? {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            type: "chat",
            model: event.model,
            sourceTitles: event.sourceTitles,
            payload: await encrypt(JSON.stringify({ question: event.question, answer: event.answer })),
          }
        : {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            type: "model_change",
            previousModel: event.previousModel,
            newModel: event.newModel,
            payload: await encrypt(JSON.stringify({})),
          };

    await appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

export async function readAuditLog(): Promise<AuditLogEntry[]> {
  try {
    const raw = await readFile(LOG_PATH, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AuditLogEntry);
  } catch {
    return [];
  }
}
