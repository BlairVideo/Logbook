import { readdir, writeFile } from "node:fs/promises";
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

const EXTRACTORS: Record<string, (filePath: string) => Promise<RawParagraph[]>> = {
  ".docx": extractDocxParagraphs,
  ".pdf": extractPdfParagraphs,
};

interface Document {
  file: string;
  title: string;
  extract: () => Promise<RawParagraph[]>;
}

// OCR fallback (see extractors/pdf.ts) occasionally mangles a table's column
// headers while still recovering the cell values correctly. Rather than let a
// manual data fix get silently reverted the next time this file is
// re-ingested, known-bad OCR outputs are corrected here, right after
// extraction. Verified against the source PDF (Blair_Benefits Guide 2026.pdf,
// pages 34-35): the table is PLAN | FAMILY PRICE | INDIVIDUAL PRICE.
const KNOWN_TEXT_CORRECTIONS: { pattern: RegExp; replacement: string }[] = [
  {
    pattern:
      /\[pan \| ramiy RICE INDIVIDUAL PRICE\nLegalShield\* \$8\.75 Bi-weekly\nIDShield \$8\.75 Bi-weekly \$4\.59 Bi-weekly\nCombined \$16\.11 Bi-weekly ~~ \$13\.34 Bi-weekly/,
    replacement: `PLAN | FAMILY PRICE | INDIVIDUAL PRICE
LegalShield* | $8.75 Bi-weekly | $8.75 Bi-weekly
IDShield | $8.75 Bi-weekly | $4.59 Bi-weekly
Combined | $16.11 Bi-weekly | $13.34 Bi-weekly`,
  },
];

function applyKnownTextCorrections(paragraphs: RawParagraph[]): void {
  for (const para of paragraphs) {
    for (const { pattern, replacement } of KNOWN_TEXT_CORRECTIONS) {
      para.text = para.text.replace(pattern, replacement);
    }
  }
}

function titleFromFilename(filename: string): string {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function discoverDocuments(): Promise<Document[]> {
  const entries = await readdir(BOOKS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => path.extname(entry.name).toLowerCase() in EXTRACTORS)
    .map((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      const extract = EXTRACTORS[ext];
      return {
        file: entry.name,
        title: titleFromFilename(entry.name),
        extract: () => extract(path.join(BOOKS_DIR, entry.name)),
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

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
  const documents = await discoverDocuments();
  if (documents.length === 0) {
    console.error(`No supported documents (${Object.keys(EXTRACTORS).join(", ")}) found in ${BOOKS_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${documents.length} document(s): ${documents.map((d) => d.file).join(", ")}`);

  const allChunks: Chunk[] = [];
  let hadFailure = false;

  for (const doc of documents) {
    console.log(`\nIngesting: ${doc.title}`);
    const paragraphs = await doc.extract();
    applyKnownTextCorrections(paragraphs);

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
