import mammoth from "mammoth";
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { RawParagraph } from "../chunk";

const HEADING_STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Title'] => h1:fresh",
];

// Naive $(el).text() on a whole <ul>/<ol> concatenates every <li> with no
// separator at all (observed: "...per year.PART-TIME EMPLOYEES..." — two
// distinct bullets fused mid-sentence). This walks each list item explicitly
// so bullets stay delimited, recursing into nested sub-lists.
export function listToText($: CheerioAPI, list: Cheerio<AnyNode>): string {
  const items: string[] = [];

  list.children("li").each((_, li) => {
    const $li = $(li);
    const nestedLists = $li.children("ul, ol");
    const ownText = $li
      .clone()
      .children("ul, ol")
      .remove()
      .end()
      .text()
      .trim();

    if (ownText) items.push(ownText);

    nestedLists.each((_, nested) => {
      const nestedText = listToText($, $(nested));
      if (nestedText) items.push(nestedText);
    });
  });

  return items
    .map((item) => (/[.!?:]$/.test(item) ? item : `${item}.`))
    .join(" ");
}

// $(table).text() similarly fuses every cell together with no separator.
export function tableToText($: CheerioAPI, table: Cheerio<AnyNode>): string {
  const rows: string[] = [];

  table.find("tr").each((_, tr) => {
    const cells = $(tr)
      .find("td, th")
      .map((_, cell) => $(cell).text().trim())
      .get()
      .filter(Boolean);
    if (cells.length) rows.push(cells.join(" | "));
  });

  return rows.join("\n");
}

export async function extractDocxParagraphs(filePath: string): Promise<RawParagraph[]> {
  const { value: html } = await mammoth.convertToHtml(
    { path: filePath },
    { styleMap: HEADING_STYLE_MAP },
  );

  const $ = cheerio.load(html);
  const paragraphs: RawParagraph[] = [];
  let currentSection: string | undefined;

  $("body")
    .children()
    .each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      const $el = $(el);

      if (tag === "h1" || tag === "h2" || tag === "h3") {
        const text = $el.text().trim();
        if (text) currentSection = text;
        return;
      }

      let text: string;
      if (tag === "ul" || tag === "ol") {
        text = listToText($, $el);
      } else if (tag === "table") {
        text = tableToText($, $el);
      } else {
        text = $el.text().trim();
      }

      if (text) paragraphs.push({ text, section: currentSection });
    });

  return paragraphs;
}
