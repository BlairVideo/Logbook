import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (p: string) => {
    if (!store.has(p)) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    return store.get(p) as string;
  }),
  writeFile: vi.fn(async (p: string, data: string) => {
    store.set(p, String(data));
  }),
}));

vi.mock("./env", () => ({
  env: { chatModel: "default-model" },
}));

beforeEach(() => {
  store.clear();
  vi.resetModules();
});

describe("chat model config", () => {
  it("falls back to the configured default when no runtime config exists yet", async () => {
    const { getChatModel } = await import("./config");
    expect(await getChatModel()).toBe("default-model");
  });

  it("returns the updated model immediately after setChatModel, from cache", async () => {
    const { getChatModel, setChatModel } = await import("./config");

    await setChatModel("gemma3:12b");

    expect(await getChatModel()).toBe("gemma3:12b");
  });

  it("persists the model choice so it survives a fresh module load (simulated restart)", async () => {
    const { setChatModel } = await import("./config");
    await setChatModel("gemma3:12b");

    vi.resetModules();
    const { getChatModel } = await import("./config");

    expect(await getChatModel()).toBe("gemma3:12b");
  });
});
