import { describe, expect, it } from "vitest";
import { checkGarbled } from "./garbledText";

const CLEAN_LONG_TEXT =
  "The employee handbook explains that all full-time staff are eligible for the health plan " +
  "after the completion of a ninety day waiting period. This applies to both faculty and staff " +
  "regardless of department, and enrollment forms are due to the Human Resources office within " +
  "thirty days of the eligibility date in order to avoid any lapse in coverage for the family.";

describe("checkGarbled", () => {
  it("never flags short text, even if it looks suspicious", () => {
    expect(checkGarbled("��").garbled).toBe(false);
  });

  it("does not flag clean, long English prose", () => {
    const result = checkGarbled(CLEAN_LONG_TEXT);
    expect(result.garbled).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("flags text containing Unicode replacement characters", () => {
    const text = `${CLEAN_LONG_TEXT} ���`;
    const result = checkGarbled(text);
    expect(result.garbled).toBe(true);
    expect(result.reasons.some((r) => r.includes("replacement character"))).toBe(true);
  });

  it("flags text containing Private Use Area codepoints (broken font CMap)", () => {
    const text = `${CLEAN_LONG_TEXT} `;
    const result = checkGarbled(text);
    expect(result.garbled).toBe(true);
    expect(result.reasons.some((r) => r.includes("Private Use Area"))).toBe(true);
  });

  it("flags a long passage with no common English stopwords", () => {
    // Long, but built from a token that never matches a stopword.
    const text = "Xqzv ".repeat(120);
    const result = checkGarbled(text);
    expect(result.garbled).toBe(true);
    expect(result.reasons.some((r) => r.includes("stopwords"))).toBe(true);
  });

  it("flags text with a high ratio of non-ASCII characters", () => {
    const text = "日本語のテキストがここにたくさんあります。".repeat(5);
    const result = checkGarbled(text);
    expect(result.garbled).toBe(true);
    expect(result.reasons.some((r) => r.includes("non-ASCII"))).toBe(true);
  });
});
