import { describe, expect, it } from "vitest";
import { extractPageText } from "./pdf";

interface FakeItem {
  str: string;
  transform: number[];
}

function fakePage(items: FakeItem[]) {
  return {
    getTextContent: async () => ({ items }),
  } as unknown as Parameters<typeof extractPageText>[0];
}

// transform[5] is the item's Y position; extractPageText uses jumps in Y to
// decide where a paragraph break belongs, since pdf.js otherwise hands back
// a flat stream of text runs with no paragraph structure at all.
function item(str: string, y: number): FakeItem {
  return { str, transform: [1, 0, 0, 1, 0, y] };
}

describe("extractPageText", () => {
  it("joins text runs on the same line with a single space", async () => {
    const page = fakePage([item("Full-time", 700), item("employees", 700), item("accrue", 700)]);
    expect(await extractPageText(page)).toBe("Full-time employees accrue");
  });

  it("inserts a paragraph break when the Y position jumps significantly", async () => {
    const page = fakePage([item("First paragraph.", 700), item("Second paragraph.", 650)]);
    expect(await extractPageText(page)).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("does not insert a break for a small Y jump within the same line", async () => {
    const page = fakePage([item("Same", 700), item("line", 698)]);
    expect(await extractPageText(page)).toBe("Same line");
  });

  it("returns an empty string for a page with no text items", async () => {
    const page = fakePage([]);
    expect(await extractPageText(page)).toBe("");
  });
});
