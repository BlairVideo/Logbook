import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker, type Worker } from "tesseract.js";
import { checkGarbled } from "../garbledText";
import { ProgressBar } from "../progress";
import type { RawParagraph } from "../chunk";

// pdfjs-dist's legacy Node build works without a DOM/worker setup.
async function loadPdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

interface PageTextItem {
  str: string;
  transform: number[];
}

interface PdfPage {
  getTextContent: () => Promise<{ items: unknown[] }>;
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
}

export async function extractPageText(page: PdfPage): Promise<string> {
  const content = await page.getTextContent();
  const items = content.items as PageTextItem[];

  let text = "";
  let lastY: number | null = null;

  for (const item of items) {
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      text += "\n\n";
    } else if (text && !text.endsWith(" ") && !text.endsWith("\n")) {
      text += " ";
    }
    text += item.str;
    lastY = y;
  }

  return text.trim();
}

async function ocrPage(page: PdfPage, worker: Worker): Promise<string> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await page.render({ canvasContext: context as unknown, viewport }).promise;

  const pngBuffer = canvas.toBuffer("image/png");
  const {
    data: { text },
  } = await worker.recognize(pngBuffer);
  return text.trim();
}

export async function extractPdfParagraphs(filePath: string): Promise<RawParagraph[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await readFile(filePath));
  const doc = await pdfjs.getDocument({ data }).promise;

  const paragraphs: RawParagraph[] = [];
  let ocrWorker: Worker | null = null;
  const progress = new ProgressBar("extracting pages", doc.numPages);

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = (await doc.getPage(pageNumber)) as unknown as PdfPage;
      let text = await extractPageText(page);

      let { garbled, reasons } = checkGarbled(text);
      if (garbled) {
        progress.interrupt(() =>
          console.warn(
            `  page ${pageNumber}: garbled text detected (${reasons.join(", ")}) — attempting OCR fallback`,
          ),
        );
        ocrWorker ??= await createWorker("eng");
        const ocrText = await ocrPage(page, ocrWorker);
        const ocrCheck = checkGarbled(ocrText);
        if (!ocrCheck.garbled || ocrCheck.reasons.length < reasons.length) {
          text = ocrText;
          ({ garbled, reasons } = ocrCheck);
        }
        if (garbled) {
          progress.interrupt(() =>
            console.warn(`  page ${pageNumber}: MANUAL REVIEW NEEDED (${reasons.join(", ")})`),
          );
        }
      }

      for (const para of text.split(/\n{2,}/)) {
        const trimmed = para.trim();
        if (trimmed) paragraphs.push({ text: trimmed, page: pageNumber });
      }

      progress.tick();
    }
  } finally {
    progress.done();
    if (ocrWorker) await ocrWorker.terminate();
  }

  return paragraphs;
}
