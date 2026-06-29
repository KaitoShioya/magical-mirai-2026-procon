// フォントのサブセット化（素材整備）。課題曲の歌詞に現れる文字だけを抜き出して読み込み量を減らす。
// 文字集合の正典の抽出源は songmap の phrases[].text（楽曲ロード後の歌詞）。docs/musics は補助。
// 被覆範囲は「遊べる全曲の歌詞」。理由を先に述べる。本アプリは実装済みの全曲をロードでき、歌詞は
// troika のサブセットフォントで描くため、1曲（TAKEOVER）ぶんだけを収録すると他曲の漢字が欠字となり、
// 端末標準フォントへ落ちて中国字形や豆腐（□）で表示される文字化けが起きる。これを避けるため、実装済みの
// 全曲の songmap を走査して歌詞の字形をすべて収録する。
// 出力形式は .woff（troika-three-text は .woff2 非対応で、対応形式のうち .woff が最も圧縮が効くため）。
// 元フォント（フル）は公開しない assets/fonts-source/ に置き（.gitignore 済み）、配布は public/fonts/ のサブセットのみ。
// 元フォントの配布元（SIL Open Font License 1.1）:
//   https://raw.githubusercontent.com/googlefonts/zen-kakugothic/main/fonts/ttf/ZenKakuGothicNew-Bold.ttf
// これを assets/fonts-source/ZenKakuGothicNew-Bold.ttf として保存してから実行する。
//
// 実行: node scripts/build-font-subset.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import subsetFont from "subset-font";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// 実装済み（ロードして遊べる）全曲の songmap。歌詞の字形はこれらすべてを収録する。
// 並びは src/config/songs.ts の implemented:true の曲に対応する。未実装の sekai-saigo は遊べず歌詞が
// 描かれないため、容量を抑える目的で対象から外す（実装した際はここへ追加して再生成する）。
const SONGMAP_PATHS = [
  "docs/analysis/kotaete.songmap.json",
  "docs/analysis/after-the-curtain.songmap.json",
  "docs/analysis/shutter-chance.songmap.json",
  "docs/analysis/toritsuku-logy.songmap.json",
  "docs/analysis/takeover.songmap.json",
].map((rel) => path.join(root, rel));

const SOURCE_FONT_PATH = path.join(root, "assets/fonts-source/ZenKakuGothicNew-Bold.ttf");
const OUTPUT_PATH = path.join(root, "public/fonts/zen-kaku-gothic-new-subset.woff");

// 基本集合。歌詞は英語と全角記号が混在するため、印字可能なASCIIと全角の約物を加えて欠字を防ぐ。
const FULLWIDTH_PUNCTUATION = "　＆？！…、。「」（）・〜ー";

// 成果物画像（成果物タスク #69）が焼き込む固定の文字。歌詞には現れない作品名・表示ラベル・出典・曲名・作者の
// 文字を欠かさないため、このフォントの被覆対象に加える。これらは2次元キャンバスの文字描画（artifactCapture.ts）が
// 同じサブセットフォントで描く。
// 値の正典: 作品名=src/config/work.ts、表示ラベル・百分位の言い回し=src/scoring/resultText.ts、
// 曲名・作者=src/config/songs.ts、出典の焼き込み文=src/app/index.ts（初音ミク＋権利者社名＋ライセンス名）。
// 成果物は「いま遊んだ曲」の曲名・作者を1行に焼き込む（index.ts の songLine）。どの曲を遊んでも欠字が出ないよう、
// 実装済み全曲の曲名・作者をここへ列挙する。未実装の sekai-saigo は遊べず成果物に出ないため含めない。
const ARTIFACT_REQUIRED_TEXT = [
  // 作品名と表示ラベル・百分位の言い回し・非該当の表示（—）。
  "あなたが奏でた湖",
  "スコア ランク 上位 % —",
  // 実装済み全曲の曲名・作者（成果物の songLine「曲名 / 作者」が描く）。
  "こたえて imie",
  "アフター・ザ・カーテン Rulmry",
  "シャッターチャンス 夜未アガリ",
  "トリツクロジー 鶴三",
  "TAKEOVER Twinfield",
  // 出典の焼き込み文（初音ミク＋権利者の社名＋ライセンス名）。欠字が出ないよう全文を含める。
  "初音ミク © Crypton Future Media, INC. www.piapro.net",
  "ピアプロ・キャラクター・ライセンス",
].join("");

/** songmap の phrases[].text と基本集合と成果物の固定文字から、サブセットに含める文字の集合を作る。 */
export function extractRequiredChars(songmap) {
  const chars = new Set();
  for (const phrase of songmap.phrases ?? []) {
    for (const char of phrase.text ?? "") {
      chars.add(char);
    }
  }
  // 印字可能なASCII（0x20から0x7E）。
  for (let codePoint = 0x20; codePoint <= 0x7e; codePoint += 1) {
    chars.add(String.fromCodePoint(codePoint));
  }
  for (const char of FULLWIDTH_PUNCTUATION) {
    chars.add(char);
  }
  // 成果物画像が焼き込む固定の文字（作品名・表示ラベル・出典・曲名・作者）。
  for (const char of ARTIFACT_REQUIRED_TEXT) {
    chars.add(char);
  }
  return chars;
}

/** 複数の songmap から、サブセットに含める文字の集合を1つに束ねる。 */
export function extractRequiredCharsFromSongmaps(songmaps) {
  const chars = new Set();
  for (const songmap of songmaps) {
    for (const char of extractRequiredChars(songmap)) {
      chars.add(char);
    }
  }
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

  const songmaps = SONGMAP_PATHS.map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
  const required = extractRequiredCharsFromSongmaps(songmaps);
  const requiredText = [...required].join("");

  const sourceFont = fontkit.openSync(SOURCE_FONT_PATH);
  const missing = findMissingChars(sourceFont, required);
  if (missing.length > 0) {
    // 欠字があれば失敗させる。フォールバックへ回すか主フォントを差し替える判断のため、欠字を表示する。
    console.error(`欠字が${missing.length}件あります（主フォントが収録していない文字）: ${missing.join(" ")}`);
    process.exit(1);
  }

  const subsetBuffer = await subsetFont(fs.readFileSync(SOURCE_FONT_PATH), requiredText, {
    targetFormat: "woff",
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

  const sourceBytes = fs.statSync(SOURCE_FONT_PATH).size;
  console.log(
    `サブセット生成: ${SONGMAP_PATHS.length}曲 / ${required.size}文字 / 欠字0 / ` +
      `${(sourceBytes / 1024).toFixed(0)}KB(元) → ${(subsetBuffer.length / 1024).toFixed(0)}KB(.woff)`
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
