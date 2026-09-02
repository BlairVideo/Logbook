export interface RawParagraph {
  text: string;
  page?: number;
  section?: string;
}

export interface TextChunk {
  text: string;
  page?: number;
  section?: string;
}

const MIN_CHUNK = 1200;
const MAX_CHUNK = 3200;
const OVERLAP_CHARS = 400;

function splitLongParagraph(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];

  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (buffer.length + sentence.length + 1 > MAX_CHUNK && buffer.length > 0) {
      parts.push(buffer.trim());
      buffer = "";
    }
    buffer += (buffer ? " " : "") + sentence;
  }
  if (buffer.trim()) parts.push(buffer.trim());

  return parts;
}

function lastSentences(text: string, maxChars: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = "";
  for (let i = sentences.length - 1; i >= 0 && out.length < maxChars; i--) {
    out = `${sentences[i]} ${out}`.trim();
  }
  return out;
}

export function chunkParagraphs(paragraphs: RawParagraph[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let bufferText = "";
  let bufferPage: number | undefined;
  let bufferSection: string | undefined;

  const flush = () => {
    if (bufferText.trim().length === 0) return;
    chunks.push({ text: bufferText.trim(), page: bufferPage, section: bufferSection });
  };

  for (const para of paragraphs) {
    for (const piece of splitLongParagraph(para.text)) {
      if (bufferText.length > 0 && bufferText.length + piece.length + 1 > MAX_CHUNK) {
        flush();
        const overlap = lastSentences(bufferText, OVERLAP_CHARS);
        bufferText = overlap;
        bufferPage = para.page;
        bufferSection = para.section;
      }

      if (bufferText.length === 0) {
        bufferPage = para.page;
        bufferSection = para.section;
      }

      bufferText += (bufferText ? "\n\n" : "") + piece;

      if (bufferText.length >= MIN_CHUNK && bufferText.length >= MAX_CHUNK * 0.6) {
        // Allow buffer to keep growing until the next paragraph triggers a flush,
        // unless it's already comfortably past the minimum and close to max.
      }
    }
  }

  flush();
  return chunks;
}
