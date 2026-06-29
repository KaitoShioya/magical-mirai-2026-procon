import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import {
  extractRequiredChars,
  extractRequiredCharsFromSongmaps,
  findMissingChars,
} from "./build-font-subset.mjs";

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
// 実装済み（遊べる）全曲の songmap。サブセットはこれらすべての歌詞の字形を収録していなければならない。
// 1曲ぶんだけを収録すると他曲の漢字が欠字となり端末標準フォントへ落ちて文字化けするため、全曲で検証する。
const songmapPaths = [
  "kotaete",
  "after-the-curtain",
  "shutter-chance",
  "toritsuku-logy",
  "takeover",
].map((key) => fileURLToPath(new URL(`../docs/analysis/${key}.songmap.json`, import.meta.url)));
const subsetPath = fileURLToPath(
  new URL("../public/fonts/zen-kaku-gothic-new-subset.woff", import.meta.url)
);

// 容量上限のバイト数。サブセット化していない完全なフォントの誤コミットを捕捉するために置く。
// この値を採る理由を先に述べる。第一に、数千の字形を収録する完全な日本語フォントは
// 数十万バイトから百万バイト超になり、この上限を必ず超える。第二に、実装済み全曲（5曲）の歌詞を収録した
// 現在のサブセット（580文字でおよそ93KB）のおよそ2倍であり、歌詞や基本文字集合の通常の増加では
// この上限を超えないため、正当な更新を誤って失敗させない。
const SUBSET_BYTE_LIMIT = 200000;

describe("コミット済みサブセットの実データ検証", () => {
  it("実装済み全曲の歌詞に必要な字形をすべて収録する（欠字ゼロ）", () => {
    const songmaps = songmapPaths.map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
    const required = extractRequiredCharsFromSongmaps(songmaps);
    const font = fontkit.create(fs.readFileSync(subsetPath));
    const missing = findMissingChars(font, required);
    expect(missing).toEqual([]);
  });

  it("サブセットのバイト数が容量上限を下回る", () => {
    const bytes = fs.statSync(subsetPath).size;
    expect(bytes).toBeLessThan(SUBSET_BYTE_LIMIT);
  });
});
