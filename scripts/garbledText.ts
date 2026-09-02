const COMMON_STOPWORDS = [" the ", " and ", " of ", " to ", " a ", " in ", " is "];

export interface GarbledCheck {
  garbled: boolean;
  reasons: string[];
}

export function checkGarbled(text: string): GarbledCheck {
  const reasons: string[] = [];

  if (text.trim().length < 20) {
    return { garbled: false, reasons: [] };
  }

  const replacementCount = (text.match(/�/g) ?? []).length;
  if (replacementCount > 0) {
    reasons.push(`${replacementCount} Unicode replacement character(s)`);
  }

  const privateUseRegex = new RegExp("[\\uE000-\\uF8FF]", "g");
  const privateUseCount = (text.match(privateUseRegex) ?? []).length;
  if (privateUseCount > 0) {
    reasons.push(`${privateUseCount} Private Use Area codepoint(s) (often a broken font CMap)`);
  }

  const printable = text.replace(/\s/g, "");
  const nonAsciiPrintable = printable.replace(/[\x20-\x7E]/g, "");
  const nonAsciiRatio = printable.length > 0 ? nonAsciiPrintable.length / printable.length : 0;
  if (nonAsciiRatio > 0.15) {
    reasons.push(`high non-ASCII ratio (${(nonAsciiRatio * 100).toFixed(1)}%)`);
  }

  const lower = ` ${text.toLowerCase()} `;
  const stopwordHits = COMMON_STOPWORDS.filter((w) => lower.includes(w)).length;
  if (text.length > 400 && stopwordHits === 0) {
    reasons.push("no common English stopwords found in a long passage");
  }

  return { garbled: reasons.length > 0, reasons };
}
