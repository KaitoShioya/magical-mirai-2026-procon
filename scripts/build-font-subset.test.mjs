import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
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

// コミット済みサブセットを実データで検証する（生成スクリプトの出力が歌詞を収録し続けることの保証）。
// 文字集合の定義は生成スクリプトと同じ extractRequiredChars を使って共有し、定義のずれを防ぐ。
// パスはこのテスト（scripts/）からリポジトリ直下への相対で解決する（生成スクリプト本体と同じ相対関係）。
const songmapPath = fileURLToPath(
  new URL("../docs/analysis/takeover.songmap.json", import.meta.url)
);
const subsetPath = fileURLToPath(
  new URL("../public/fonts/zen-kaku-gothic-new-subset.woff", import.meta.url)
);

// 容量上限のバイト数。サブセット化していない完全なフォントの誤コミットを捕捉するために置く。
// この値を採る理由を先に述べる。第一に、数千の字形を収録する完全な日本語フォントは
// 数十万バイトから百万バイト超になり、この上限を必ず超える。第二に、現在のサブセット
// （TAKEOVER の必要文字371文字で58264バイト）のおよそ3.4倍であり、歌詞や基本文字集合の
// 通常の増加ではこの上限を超えないため、正当な更新を誤って失敗させない。
const SUBSET_BYTE_LIMIT = 200000;

describe("コミット済みサブセットの実データ検証", () => {
  it("TAKEOVER の歌詞に必要な字形をすべて収録する（欠字ゼロ）", () => {
    const songmap = JSON.parse(fs.readFileSync(songmapPath, "utf8"));
    const required = extractRequiredChars(songmap);
    const font = fontkit.create(fs.readFileSync(subsetPath));
    const missing = findMissingChars(font, required);
    expect(missing).toEqual([]);
  });

  it("サブセットのバイト数が容量上限を下回る", () => {
    const bytes = fs.statSync(subsetPath).size;
    expect(bytes).toBeLessThan(SUBSET_BYTE_LIMIT);
  });
});
