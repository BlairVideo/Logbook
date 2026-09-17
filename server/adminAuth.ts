import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { env } from "./env";

const DATA_DIR = path.resolve(import.meta.dirname, "data");
const KEY_PATH = path.join(DATA_DIR, "admin-key.txt");

let cachedKey: string | null = null;

async function getAdminKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  if (env.adminKey) {
    cachedKey = env.adminKey;
    return cachedKey;
  }

  await mkdir(DATA_DIR, { recursive: true });

  try {
    cachedKey = (await readFile(KEY_PATH, "utf-8")).trim();
    return cachedKey;
  } catch {
    const generated = randomBytes(18).toString("base64url");
    await writeFile(KEY_PATH, generated, { mode: 0o600 });
    cachedKey = generated;
    return cachedKey;
  }
}

// Surfaced once at startup so whoever runs the server locally (the HR admin)
// can retrieve the passphrase without digging through server/data by hand.
export async function announceAdminKey(): Promise<void> {
  const key = await getAdminKey();
  if (!env.adminKey) {
    console.log(`\nAdmin passphrase (also saved to server/data/admin-key.txt): ${key}\n`);
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const provided = req.header("x-admin-key");
  const expected = await getAdminKey();

  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Admin passphrase required." });
    return;
  }

  next();
}
