// UI見出し用フォントのサブセット化（素材整備）。見出し・タイトルに使う M PLUS 1 を、UIに現れる文字だけへ絞る。
// 本文・小ラベルはシステムフォントのままとし、見出しだけを電子的な幾何学ゴシックにして世界観の二面性（静謐な本文×電子的な見出し）を出す。
//
// 文字集合の抽出源: UIを描く各ファイルの「文字列リテラル」の文字。行コメント・ブロックコメントの文字は含めない
// （コメントの日本語までフォントに含めると不要に大きくなるため）。URL内の // を誤ってコメントと見なさないよう、
// コメント除去ではなく文字列リテラルの抽出で集める。これに、印字可能なアスキー・数字・全角約物・閉じる記号・百分率記号・
// 仮名全域を加える。仮名全域を入れる理由: 仮名は文字数が少なく容量増はわずかで、UI文言の変更で仮名の取りこぼしが起きる危険を無くせるため。
//
// 出力形式は .woff2（DOM の @font-face は .woff2 に対応し、最も圧縮が効く）。
// 元フォント（フル）は公開しない assets/fonts-source/ に置く（.gitignore 済み）。配布は public/fonts/ のサブセットのみ。
// 元フォントの配布元（SIL Open Font License 1.1）:
//   https://github.com/google/fonts/raw/main/ofl/mplus1/MPLUS1%5Bwght%5D.ttf
//   これを assets/fonts-source/MPLUS1-VF.ttf として保存してから実行する。
//
// 実行: node scripts/build-ui-font-subset.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import subsetFont from "subset-font";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const SOURCE_FONT_PATH = path.join(root, "assets/fonts-source/MPLUS1-VF.ttf");
const OUTPUT_PATH = path.join(root, "public/fonts/m-plus-1-ui-subset.woff2");

// 1ファイルあたりのサイズ上限。閾値200KBを採る理由: 既存の歌詞用サブセットの検査が、モバイル回線での1ファイルの
// 読み込み時間を抑えるため1フォントファイルあたり200KBを上限としており、UI用サブセットも同じ基準に揃える。
// フォントは各ファイルが独立に読み込まれ体感速度は個々のファイルの読み込み時間で決まるため、合計でなく各ファイルで判定する。
export const SUBSET_BYTE_LIMIT = 200000;

// 見出し・タイトル・短いラベルを描くファイル。これらの文字列リテラルから見出しの文字を漏れなく集める。
// 本文の長文（クレジット本文・使い方本文）は config 由来でシステムフォントに描くため、ここでは走査しない。
const UI_DISPLAY_SOURCE_FILES = [
  "src/screens/titleScreen.ts",
  "src/screens/resultScreen.ts",
  "src/screens/warmupScreen.ts",
  "src/screens/retryScreen.ts",
  "src/app/settings/settingsView.ts",
  "src/app/credits/creditsView.ts",
  "src/app/howTo/howToView.ts",
  "src/app/calibration/calibrationView.ts",
  "src/ui/scoreHistoryView.ts",
  "src/app/pauseController.ts",
  "src/app/overlay.ts",
  "src/app/attribution.ts",
];

// 全角約物・記号。見出しや短いラベルに混じる記号を欠かさない。
// 閉じる記号（✕）と百分率記号（％）は見出しに使わず（閉じるボタンと百分位の表示はシステムフォント側）、
// かつ M PLUS 1 が ✕ を収録しないため、ここには含めない。
const SYMBOLS = "　＆？！…、。「」（）・〜ー：";

/** ソースコードの文字列リテラル（"..." と '...' と `...`）の中身だけを連結して返す。コメントは含めない。 */
function extractStringLiteralText(source) {
  // 二重引用符・単一引用符・バッククォートの文字列を順に拾う。エスケープ（\"）はリテラルの一部として通す。
  const pattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  const matches = source.match(pattern) ?? [];
  return matches.join("");
}

/** 走査対象ファイルの文字列リテラルと基本集合（アスキー・数字・仮名・記号）から、サブセットに含める文字集合を作る。 */
export function extractRequiredChars(fileTexts) {
  const chars = new Set();
  // 各ファイルの文字列リテラルの文字。
  for (const text of fileTexts) {
    for (const char of text) {
      chars.add(char);
    }
  }
  // 印字可能なアスキー（0x20から0x7E）。数字・英字・記号を含む。
  for (let codePoint = 0x20; codePoint <= 0x7e; codePoint += 1) {
    chars.add(String.fromCodePoint(codePoint));
  }
  // ひらがな（0x3041「ぁ」から0x3093「ん」）。末尾の希少な小書き仮名（ゔ・ゕ・ゖ）はUIに現れず、
  // M PLUS 1 が ゕ・ゖ を収録しないため範囲に含めない。
  for (let codePoint = 0x3041; codePoint <= 0x3093; codePoint += 1) {
    chars.add(String.fromCodePoint(codePoint));
  }
  // カタカナ（0x30A1から0x30FA）と長音記号（0x30FC）。
  for (let codePoint = 0x30a1; codePoint <= 0x30fa; codePoint += 1) {
    chars.add(String.fromCodePoint(codePoint));
  }
  chars.add(String.fromCodePoint(0x30fc));
  for (const char of SYMBOLS) {
    chars.add(char);
  }
  // 閉じる記号（✕、U+2715）は文字列リテラル走査で拾われるが、見出しでなく閉じるボタン（システムフォント）に出る文字で、
  // かつ M PLUS 1 が収録しないため、見出し用サブセットの対象から除く。
  chars.delete(String.fromCodePoint(0x2715));
  return chars;
}

/** フォントが収録していない文字（欠字）を返す。 */
export function findMissingChars(font, chars) {
  const missing = [];
  for (const char of chars) {
    if (!font.hasGlyphForCodePoint(char.codePointAt(0))) {
      missing.push(char);
    }
  }
  return missing;
}

async function main() {
  if (!fs.existsSync(SOURCE_FONT_PATH)) {
    console.error(
      `元フォントが見つかりません: ${path.relative(root, SOURCE_FONT_PATH)}\n` +
        "本ファイル冒頭に記した配布元から取得して assets/fonts-source/ に置いてから再実行してください。"
    );
    process.exit(1);
  }

  const fileTexts = UI_DISPLAY_SOURCE_FILES.map((relPath) =>
    extractStringLiteralText(fs.readFileSync(path.join(root, relPath), "utf8"))
  );
  const required = extractRequiredChars(fileTexts);
  const requiredText = [...required].join("");

  const sourceFont = fontkit.openSync(SOURCE_FONT_PATH);
  const missing = findMissingChars(sourceFont, required);
  if (missing.length > 0) {
    console.error(`欠字が${missing.length}件あります（見出しフォントが収録していない文字）: ${missing.join(" ")}`);
    process.exit(1);
  }

  // 見出しは太さ700の一定の重みで使うため、可変軸 wght を700へ固定してから絞り、字形以外の可変情報を落として軽くする。
  const subsetBuffer = await subsetFont(fs.readFileSync(SOURCE_FONT_PATH), requiredText, {
    targetFormat: "woff2",
    variationAxes: { wght: 700 },
  });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, subsetBuffer);

  // サブセットが必要な全文字を含むことを表明（欠字検証）。
  const subsetFontParsed = fontkit.create(subsetBuffer);
  const stillMissing = findMissingChars(subsetFontParsed, required);
  if (stillMissing.length > 0) {
    console.error(`サブセット後に欠字が残りました: ${stillMissing.join(" ")}`);
    process.exit(1);
  }

  if (subsetBuffer.length > SUBSET_BYTE_LIMIT) {
    console.error(
      `サブセットが上限を超えました: ${(subsetBuffer.length / 1024).toFixed(0)}KB > ${(SUBSET_BYTE_LIMIT / 1024).toFixed(0)}KB`
    );
    process.exit(1);
  }

  const sourceBytes = fs.statSync(SOURCE_FONT_PATH).size;
  console.log(
    `UI見出しサブセット生成: ${required.size}文字 / 欠字0 / ` +
      `${(sourceBytes / 1024).toFixed(0)}KB(元) → ${(subsetBuffer.length / 1024).toFixed(0)}KB(.woff2)`
  );
  console.log(`出力: ${path.relative(root, OUTPUT_PATH)}`);
}

// 直接実行されたときだけ main を走らせる（テストから import する関数と分ける）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
