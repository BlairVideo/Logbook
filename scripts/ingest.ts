import { writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { extractDocxParagraphs } from "./extractors/docx";
import { extractPdfParagraphs } from "./extractors/pdf";
import { chunkParagraphs, type RawParagraph } from "./chunk";
import { checkGarbled } from "./garbledText";
import { embed } from "../server/ollama";
import type { Chunk, ChunkIndex } from "../shared/types";

const BOOKS_DIR = path.resolve(import.meta.dirname, "../books");
const OUTPUT_PATH = path.resolve(import.meta.dirname, "../server/data/index.json");

const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";
const CHAT_MODEL = process.env.CHAT_MODEL ?? "llama3.1:latest";

interface Document {
  file: string;
  title: string;
  extract: () => Promise<RawParagraph[]>;
}

const documents: Document[] = [
  {
    file: "Blair Employee Handbook 2025-2026.docx",
    title: "Blair Employee Handbook 2025-2026",
    extract: () => extractDocxParagraphs(path.join(BOOKS_DIR, "Blair Employee Handbook 2025-2026.docx")),
  },
  {
    file: "2025 Benefits Guide.pdf",
    title: "2025 Benefits Guide",
    extract: () => extractPdfParagraphs(path.join(BOOKS_DIR, "2025 Benefits Guide.pdf")),
  },
  {
    file: "2026-27_StudentHandbook.pdf",
    title: "2026-27 Student Handbook",
    extract: () => extractPdfParagraphs(path.join(BOOKS_DIR, "2026-27_StudentHandbook.pdf")),
  },
];

function randomSample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < n) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

async function main() {
  const allChunks: Chunk[] = [];
  let hadFailure = false;

  for (const doc of documents) {
    console.log(`\nIngesting: ${doc.title}`);
    const paragraphs = await doc.extract();

    if (paragraphs.length === 0) {
      console.error(`  ERROR: 0 paragraphs extracted from ${doc.file}`);
      hadFailure = true;
      continue;
    }

    const textChunks = chunkParagraphs(paragraphs);
    const lengths = textChunks.map((c) => c.text.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    console.log(
      `  ${textChunks.length} chunks | min ${Math.min(...lengths)} | max ${Math.max(...lengths)} | avg ${avg.toFixed(0)} chars`,
    );

    let garbledCount = 0;
    for (const chunk of textChunks) {
      const { garbled } = checkGarbled(chunk.text);
      if (garbled) garbledCount++;
    }

    if (garbledCount > 0) {
      console.warn(`  ${garbledCount}/${textChunks.length} chunks flagged as possibly garbled`);
    }

    const garbledRatio = garbledCount / textChunks.length;
    if (garbledRatio > 0.2) {
      console.error(
        `  ERROR: ${(garbledRatio * 100).toFixed(0)}% of chunks still garbled after extraction — manual review needed for ${doc.file}`,
      );
      hadFailure = true;
    }

    console.log(`  Sample chunks:`);
    for (const sample of randomSample(textChunks, 3)) {
      console.log(`    ---\n    ${sample.text.slice(0, 300).replace(/\n/g, " ")}`);
    }

    console.log(`  Embedding ${textChunks.length} chunks with ${EMBED_MODEL}...`);
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      let embedding: number[];
      try {
        embedding = await embed(chunk.text, EMBED_MODEL);
      } catch (err) {
        console.warn(
          `  chunk ${i} (${chunk.text.length} chars) exceeded the embedding model's context — retrying truncated`,
        );
        const truncated = chunk.text.slice(0, Math.floor(chunk.text.length * 0.6));
        try {
          embedding = await embed(truncated, EMBED_MODEL);
          chunk.text = truncated;
        } catch {
          console.error(`  ERROR: chunk ${i} could not be embedded even after truncation — skipping`);
          hadFailure = true;
          continue;
        }
      }
      allChunks.push({
        id: `${doc.file}-${i}`,
        text: chunk.text,
        embedding,
        source: { file: doc.file, title: doc.title, page: chunk.page, section: chunk.section },
        charCount: chunk.text.length,
      });
    }
  }

  const index: ChunkIndex = {
    embedModel: EMBED_MODEL,
    dims: allChunks[0]?.embedding.length ?? 0,
    chatModel: CHAT_MODEL,
    createdAt: new Date().toISOString(),
    chunkCount: allChunks.length,
    chunks: allChunks,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(index, null, 2));
  console.log(`\nWrote ${allChunks.length} chunks to ${OUTPUT_PATH}`);

  if (hadFailure) {
    console.error("\nIngestion completed with errors — see above.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
