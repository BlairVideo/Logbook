import { describe, expect, it } from "vitest";
import { chunkParagraphs, type RawParagraph } from "./chunk";

// Mirrors scripts/chunk.ts's internal MAX_CHUNK — asserted as an invariant
// (no chunk should ever exceed the embedding model's comfortable input size).
const MAX_CHUNK = 3200;

function sentence(n: number): string {
  return `This is sentence number ${n} in a long test passage about Blair Academy policy. `;
}

describe("chunkParagraphs", () => {
  it("returns an empty array for no input", () => {
    expect(chunkParagraphs([])).toEqual([]);
  });

  it("drops whitespace-only paragraphs instead of emitting an empty chunk", () => {
    const paragraphs: RawParagraph[] = [{ text: "   \n  " }];
    expect(chunkParagraphs(paragraphs)).toEqual([]);
  });

  it("keeps a short paragraph as a single chunk with its metadata", () => {
    const paragraphs: RawParagraph[] = [{ text: "Employees accrue PTO monthly.", page: 12, section: "Leave" }];
    const chunks = chunkParagraphs(paragraphs);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Employees accrue PTO monthly.");
    expect(chunks[0].page).toBe(12);
    expect(chunks[0].section).toBe("Leave");
  });

  it("keeps chunks close to the max chunk size (allowing for the overlap prefix)", () => {
    // One giant paragraph, several times over MAX_CHUNK, made of repeated sentences.
    const bigText = Array.from({ length: 200 }, (_, i) => sentence(i)).join("");
    const paragraphs: RawParagraph[] = [{ text: bigText, page: 1 }];

    const chunks = chunkParagraphs(paragraphs);

    expect(chunks.length).toBeGreaterThan(1);
    // A chunk after the first is built from an overlap prefix (up to
    // ~OVERLAP_CHARS, rounded up to a whole sentence) plus a piece that's
    // itself already near MAX_CHUNK, so the true ceiling is a bit above
    // MAX_CHUNK — not exactly MAX_CHUNK.
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThan(MAX_CHUNK + 600);
    }
  });

  it("carries overlapping tail text into the next chunk for context continuity", () => {
    const bigText = Array.from({ length: 200 }, (_, i) => sentence(i)).join("");
    const paragraphs: RawParagraph[] = [{ text: bigText }];

    const chunks = chunkParagraphs(paragraphs);
    expect(chunks.length).toBeGreaterThan(1);

    // The tail of chunk N should reappear at the head of chunk N+1.
    const tailOfFirst = chunks[0].text.slice(-100);
    expect(chunks[1].text).toContain(tailOfFirst.split(" ").slice(1, -1).join(" ").slice(0, 50));
  });

  it("does not silently drop content across multiple paragraphs", () => {
    const paragraphs: RawParagraph[] = [
      { text: "Section one covers vacation policy in detail across many sentences." },
      { text: "Section two covers sick leave policy in detail across many sentences." },
      { text: "Section three covers parental leave policy in detail across many sentences." },
    ];

    const chunks = chunkParagraphs(paragraphs);
    const combined = chunks.map((c) => c.text).join(" ");

    expect(combined).toContain("vacation policy");
    expect(combined).toContain("sick leave policy");
    expect(combined).toContain("parental leave policy");
  });

  it("tags each chunk with the page of the paragraph it started from", () => {
    const bigText = Array.from({ length: 200 }, (_, i) => sentence(i)).join("");
    const paragraphs: RawParagraph[] = [
      { text: bigText, page: 5 },
      { text: "A short trailing paragraph.", page: 6 },
    ];

    const chunks = chunkParagraphs(paragraphs);
    expect(chunks[0].page).toBe(5);
    expect(chunks[chunks.length - 1].page).toBe(6);
  });
});
