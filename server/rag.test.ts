import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chunk, ChunkIndex } from "../shared/types";

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (p: string) => {
    if (!store.has(p)) {
      const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      throw err;
    }
    return store.get(p) as string;
  }),
}));

function makeChunk(id: string, embedding: number[], title = "Handbook", page = 1): Chunk {
  return {
    id,
    text: `text for ${id}`,
    embedding,
    source: { file: "handbook.pdf", title, page },
    charCount: 10,
  };
}

async function setIndex(chunks: Chunk[]) {
  const index: ChunkIndex = {
    embedModel: "nomic-embed-text",
    dims: chunks[0]?.embedding.length ?? 0,
    chatModel: "command-r7b",
    createdAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks,
  };
  // Path must match rag.ts's INDEX_PATH resolution; the mocked readFile
  // ignores the actual path value beyond using it as a store key, and rag.ts
  // always requests the same resolved path, so any stable key works.
  const { default: path } = await import("node:path");
  const key = path.resolve(import.meta.dirname, "data/index.json");
  store.set(key, JSON.stringify(index));
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", async () => {
    const { cosineSimilarity } = await import("./rag");
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", async () => {
    const { cosineSimilarity } = await import("./rag");
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", async () => {
    const { cosineSimilarity } = await import("./rag");
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("matches a hand-computed value for a non-trivial pair", async () => {
    const { cosineSimilarity } = await import("./rag");
    // [1,0] vs [1,1]: dot=1, |a|=1, |b|=sqrt(2) => 1/sqrt(2)
    expect(cosineSimilarity([1, 0], [1, 1])).toBeCloseTo(1 / Math.sqrt(2));
  });
});

describe("retrieveTopK", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it("excludes chunks below the relevance threshold", async () => {
    await setIndex([
      makeChunk("relevant", [1, 0, 0]),
      makeChunk("irrelevant", [0, 1, 0]),
    ]);
    const { retrieveTopK } = await import("./rag");

    const results = await retrieveTopK([1, 0, 0], 5);

    expect(results.map((c) => c.id)).toEqual(["relevant"]);
  });

  it("orders results by descending similarity", async () => {
    await setIndex([
      makeChunk("best", [1, 0, 0]),
      makeChunk("second", [0.9, 0.436, 0]), // close to [1,0,0] but not identical
    ]);
    const { retrieveTopK } = await import("./rag");

    const results = await retrieveTopK([1, 0, 0], 5);

    expect(results.map((c) => c.id)).toEqual(["best", "second"]);
  });

  it("limits results to k", async () => {
    await setIndex([
      makeChunk("a", [1, 0, 0]),
      makeChunk("b", [1, 0.01, 0]),
      makeChunk("c", [1, 0.02, 0]),
    ]);
    const { retrieveTopK } = await import("./rag");

    const results = await retrieveTopK([1, 0, 0], 2);

    expect(results).toHaveLength(2);
  });

  it("returns an empty array when nothing clears the relevance threshold", async () => {
    await setIndex([makeChunk("unrelated", [0, 1, 0])]);
    const { retrieveTopK } = await import("./rag");

    const results = await retrieveTopK([1, 0, 0], 5);

    expect(results).toEqual([]);
  });
});

describe("chunksToSources", () => {
  it("deduplicates by title + page, keeping first-seen order", async () => {
    const { chunksToSources } = await import("./rag");
    const chunks = [
      makeChunk("a", [1, 0], "Handbook", 5),
      makeChunk("b", [1, 0], "Handbook", 5),
      makeChunk("c", [1, 0], "Handbook", 6),
      makeChunk("d", [1, 0], "Benefits Guide", 5),
    ];

    expect(chunksToSources(chunks)).toEqual([
      { title: "Handbook", page: 5 },
      { title: "Handbook", page: 6 },
      { title: "Benefits Guide", page: 5 },
    ]);
  });

  it("returns an empty array for no chunks", async () => {
    const { chunksToSources } = await import("./rag");
    expect(chunksToSources([])).toEqual([]);
  });
});
