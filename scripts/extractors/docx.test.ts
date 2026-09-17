import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { listToText, tableToText } from "./docx";

// Regression coverage for a real bug (see git history: "Fix docx list/table
// extraction fusing separate items into run-on text"): $(el).text() on a
// whole <ul>/<table> concatenates children with no separator at all, e.g.
// "...per year.PART-TIME EMPLOYEES..." with two distinct bullets fused
// mid-sentence.

describe("listToText", () => {
  it("keeps separate list items delimited instead of fusing them", () => {
    const $ = cheerio.load("<ul><li>Full-time employees accrue PTO monthly</li><li>Part-time employees do not accrue PTO</li></ul>");
    const text = listToText($, $("ul"));

    expect(text).toContain("Full-time employees accrue PTO monthly.");
    expect(text).toContain("Part-time employees do not accrue PTO.");
    // The bug this guards against: no run-on fusion between items.
    expect(text).not.toMatch(/monthlyPart-time/i);
  });

  it("does not double up punctuation on items that already end with it", () => {
    const $ = cheerio.load("<ul><li>Contact HR for details.</li><li>See the benefits guide!</li></ul>");
    const text = listToText($, $("ul"));

    expect(text).toContain("Contact HR for details.");
    expect(text).not.toContain("details..");
    expect(text).toContain("See the benefits guide!");
  });

  it("recurses into nested sub-lists without losing the parent item's own text", () => {
    const $ = cheerio.load(
      "<ul><li>Leave types<ul><li>Sick leave</li><li>Parental leave</li></ul></li></ul>",
    );
    const text = listToText($, $("ul").first());

    expect(text).toContain("Leave types.");
    expect(text).toContain("Sick leave.");
    expect(text).toContain("Parental leave.");
  });
});

describe("tableToText", () => {
  it("keeps cells within a row pipe-delimited and rows newline-delimited", () => {
    const $ = cheerio.load(
      "<table><tr><td>PLAN</td><td>FAMILY PRICE</td></tr><tr><td>PPO</td><td>$100</td></tr></table>",
    );
    const text = tableToText($, $("table"));

    expect(text).toBe("PLAN | FAMILY PRICE\nPPO | $100");
  });

  it("skips empty cells rather than inserting blank pipes", () => {
    const $ = cheerio.load("<table><tr><td>PLAN</td><td></td><td>PRICE</td></tr></table>");
    const text = tableToText($, $("table"));

    expect(text).toBe("PLAN | PRICE");
  });

  it("omits rows that are entirely empty", () => {
    const $ = cheerio.load("<table><tr><td>PLAN</td></tr><tr><td></td></tr></table>");
    const text = tableToText($, $("table"));

    expect(text).toBe("PLAN");
  });
});
