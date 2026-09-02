import mammoth from "mammoth";
import * as cheerio from "cheerio";
import type { RawParagraph } from "../chunk";

const HEADING_STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Title'] => h1:fresh",
];

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
      const text = $(el).text().trim();
      if (!text) return;

      if (tag === "h1" || tag === "h2" || tag === "h3") {
        currentSection = text;
        return;
      }

      paragraphs.push({ text, section: currentSection });
    });

  return paragraphs;
}
