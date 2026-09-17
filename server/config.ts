import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

const CONFIG_PATH = path.resolve(import.meta.dirname, "data/runtime-config.json");

interface RuntimeConfig {
  chatModel: string;
}

let cachedConfig: RuntimeConfig | null = null;

async function loadConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    cachedConfig = JSON.parse(raw) as RuntimeConfig;
  } catch {
    cachedConfig = { chatModel: env.chatModel };
  }

  return cachedConfig;
}

export async function getChatModel(): Promise<string> {
  const config = await loadConfig();
  return config.chatModel;
}

export async function setChatModel(model: string): Promise<void> {
  cachedConfig = { chatModel: model };
  await writeFile(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2), "utf-8");
}
