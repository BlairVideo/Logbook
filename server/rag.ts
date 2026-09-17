import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Chunk, ChunkIndex, SourceRef } from "../shared/types";

const INDEX_PATH = path.resolve(import.meta.dirname, "data/index.json");

let cachedIndex: ChunkIndex | null = null;

export async function loadIndex(): Promise<ChunkIndex> {
  if (cachedIndex) return cachedIndex;

  const raw = await readFile(INDEX_PATH, "utf-8");
  cachedIndex = JSON.parse(raw) as ChunkIndex;
  return cachedIndex;
}

// Called after a successful re-ingest so the next chat picks up the fresh
// index immediately instead of requiring a server restart.
export function invalidateIndex(): void {
  cachedIndex = null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Empirically, on-topic Blair policy questions score ~0.5-0.7 against this corpus
// while unrelated questions top out around ~0.38 — this threshold keeps clearly
// irrelevant chunks (and their citations) out of the response entirely.
const RELEVANCE_THRESHOLD = 0.45;

export async function retrieveTopK(queryEmbedding: number[], k: number): Promise<Chunk[]> {
  const index = await loadIndex();

  return index.chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .filter((r) => r.score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.chunk);
}

export function chunksToSources(chunks: Chunk[]): SourceRef[] {
  const seen = new Set<string>();
  const sources: SourceRef[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.source.title}::${chunk.source.page ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ title: chunk.source.title, page: chunk.source.page });
  }

  return sources;
}
