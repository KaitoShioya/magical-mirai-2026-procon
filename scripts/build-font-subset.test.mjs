import { describe, it, expect } from "vitest";
import { extractRequiredChars, findMissingChars } from "./build-font-subset.mjs";

const fakeSongmap = {
  phrases: [{ text: "あいＡ" }, { text: "うあ" }],
};

describe("extractRequiredChars（サブセットに含める文字集合）", () => {
  it("phrases[].text の文字を重複なく含む", () => {
    const chars = extractRequiredChars(fakeSongmap);
    expect(chars.has("あ")).toBe(true);
    expect(chars.has("い")).toBe(true);
    expect(chars.has("う")).toBe(true);
  });

  it("基本集合の印字可能ASCIIと全角約物を含む", () => {
    const chars = extractRequiredChars(fakeSongmap);
    expect(chars.has("A")).toBe(true);
    expect(chars.has(" ")).toBe(true);
    expect(chars.has("＆")).toBe(true);
    expect(chars.has("？")).toBe(true);
  });
});

describe("findMissingChars（欠字の検出）", () => {
  it("収録していない文字を欠字として返す", () => {
    // 「あ」(U+3042) だけ収録しない擬似フォント。
    const fakeFont = {
      hasGlyphForCodePoint: (codePoint) => codePoint !== 0x3042,
    };
    const missing = findMissingChars(fakeFont, new Set(["あ", "い"]));
    expect(missing).toEqual(["あ"]);
  });

  it("全て収録していれば空", () => {
    const fakeFont = { hasGlyphForCodePoint: () => true };
    expect(findMissingChars(fakeFont, new Set(["あ", "A"]))).toEqual([]);
  });
});
