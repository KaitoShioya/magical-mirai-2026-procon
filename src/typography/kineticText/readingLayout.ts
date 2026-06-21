// 読ませる役のレイアウトと被覆判定（Issue #33）。
//
// 役割: 読ませる役（可読な歌詞テキスト）を、フレーズ・単語・分割チャンクのいずれかの単位で、表示領域に収まる
// 「読ませる役の区間（ReadingSpan）」へ落とす純粋ロジックと、その区間が発声中のフレーズを切れ目なく被覆するかを
// 検証する純粋ロジックを提供する。描画は行わず GlyphHandle を操作しない（依存規則: profiles・tools・three を
// import しない。歌詞型は src/textalive/lyricsTimeline.ts から型のみ取り込む）。
//
// 収まり判定をデバイス画素で閉じて行う理由を先に述べる。想定表示寸法はデバイス画素、表示領域の幅は
// 画面の横デバイス画素に割合を掛けた値で、いずれもデバイス画素で表せる。よってワールド座標への変換を介さず
// デバイス画素だけで収まりを判定でき、変換誤差や非同期の文字配置確定に依存しない。ワールド座標への変換は
// 駆動部が実際に文字を配置するときにだけ用いる。

import type { LyricsTimeline, LyricPhraseUnit } from "../../textalive/lyricsTimeline";
import { phraseAt } from "../../textalive/lyricsTimeline";
import type { ReadingDisplayUnit, TypographyDisplayRegion, TypographyChart } from "../../types/typography";

// 1文字の占有幅を想定表示寸法の何倍とみなすか（採用理由を先に述べる）。
// 読ませる役のフレーズは文字エンジンが各文字を一定の文字送り量で配置する（engine.ts の spawnReadablePhrase が
// 各文字を「基準位置 + 添字 × 字間」へ置き、字間は駆動部が想定表示寸法に等しいワールド文字送り量を渡す）。
// したがって収まり判定も、文字ごとの字形幅ではなく、1文字を一定送り量（想定表示寸法と同じ）とみなして見積もる。
// 文字ごとの字形幅で見積もると実配置と食い違い、半角主体のフレーズで実幅が見積もりを上回ってはみ出す。
export const READING_CHAR_ADVANCE_FACTOR = 1.0;

// 表示領域の縁に文字を接しさせない安全余白（採用理由を先に述べる）。字送り量はフォント寸法に等しい近似であり
// 末尾文字の字形が送り量をわずかに超えうるため、表示領域幅の5パーセントを縁の余白として確保し誤差を吸収する。
export const READING_FIT_SAFETY_MARGIN = 0.05;

// 被覆検証の走査刻み（採用理由を先に述べる）。毎秒60フレームを想定し1フレームは 1000 ÷ 60 ミリ秒である。
// 実フレーム間隔と同じ刻みで走査すれば、実行時に被覆が途切れる時刻を取りこぼさず検出できる。
export const READING_COVERAGE_SAMPLE_STEP_MS = 1000 / 60;

/** 読ませる役で表示する1区間。表示時刻範囲は半開区間（displayStartMs 以上 displayEndMs 未満）。 */
export interface ReadingSpan {
  readonly phraseIndex: number;
  /** 表示する文字列。 */
  readonly text: string;
  /** 表示開始時刻（ミリ秒、含む）。 */
  readonly displayStartMs: number;
  /** 表示終了時刻（ミリ秒、含まない）。 */
  readonly displayEndMs: number;
  /** 表示する文字の出所（フレーズ内の単語番号・文字番号）。 */
  readonly charRefs: readonly { readonly wordIndex: number; readonly charIndex: number }[];
}

/**
 * 文字列の占有幅をデバイス画素で推定する。各文字の占有幅＝想定表示寸法×文字送り倍率（一定）。
 * 文字エンジンが各文字を一定送り量で並べる配置に合わせ、文字ごとの字形幅は使わない。
 * 文字はコード位置で数える（合字や絵文字の連結は扱わず、課題曲の歌詞では1文字＝1コード位置で足りる）。
 */
export function estimateTextPixelWidth(text: string, pixelHeight: number): number {
  const codePointCount = Array.from(text).length;
  return codePointCount * pixelHeight * READING_CHAR_ADVANCE_FACTOR;
}

/** 表示領域の幅（割合）から、デバイス画素の幅を求める。 */
export function regionPixelWidth(widthRatio: number, viewportPixelWidth: number): number {
  return widthRatio * viewportPixelWidth;
}

/** 文字列が表示領域（安全余白を引いた幅）に収まるか。 */
export function fitsWithinRegion(
  text: string,
  pixelHeight: number,
  regionWidthPixels: number,
  safetyMargin: number = READING_FIT_SAFETY_MARGIN
): boolean {
  const usableWidth = regionWidthPixels * (1 - safetyMargin);
  return estimateTextPixelWidth(text, pixelHeight) <= usableWidth;
}

/** フレーズ内の文字を走査順に平らへ並べる。 */
interface FlatChar {
  readonly wordIndex: number;
  readonly charIndex: number;
  readonly text: string;
  readonly startTimeMs: number;
}

function flattenChars(phrase: LyricPhraseUnit): FlatChar[] {
  const flat: FlatChar[] = [];
  for (const word of phrase.words) {
    for (const ch of word.chars) {
      flat.push({ wordIndex: word.wordIndex, charIndex: ch.charIndex, text: ch.text, startTimeMs: ch.startTimeMs });
    }
  }
  return flat;
}

/** 連続する文字の範囲（平ら配列の添字、両端含む）。 */
interface FlatRange {
  readonly start: number;
  readonly end: number;
}

/** 半角の英数字かどうか（英語の単語間隔の要否判定に使う）。 */
function isLatinWordChar(text: string): boolean {
  return /[A-Za-z0-9]/.test(text);
}

/**
 * 範囲の文字列を作る。歌詞は文字単位で連結すると単語間の空白が落ちるため、単語の境界（隣接文字の単語番号が変わる所）で
 * かつ前後いずれかが半角英数字のとき、空白を1つ挿入する。理由を先に述べる。英語は単語間に空白が要るが、日本語は
 * 単語（形態素）間に空白を入れない書き方のため、半角英数字が絡む境界に限って空白を入れる。
 */
function rangeText(flat: readonly FlatChar[], range: FlatRange): string {
  let text = "";
  for (let i = range.start; i <= range.end; i++) {
    if (
      i > range.start &&
      flat[i].wordIndex !== flat[i - 1].wordIndex &&
      (isLatinWordChar(flat[i - 1].text) || isLatinWordChar(flat[i].text))
    ) {
      text += " ";
    }
    text += flat[i].text;
  }
  return text;
}

/**
 * 平ら文字の範囲を、各チャンクが収まる最小のチャンク数へ貪欲に分割する。
 * 1文字でも収まらない場合はその文字を単独のチャンクにする（それ以上分割できないため）。
 */
function splitRangeIntoChunks(
  flat: readonly FlatChar[],
  range: FlatRange,
  pixelHeight: number,
  regionWidthPixels: number,
  safetyMargin: number
): FlatRange[] {
  const chunks: FlatRange[] = [];
  let start = range.start;
  for (let i = range.start; i <= range.end; i++) {
    const candidate: FlatRange = { start, end: i };
    if (!fitsWithinRegion(rangeText(flat, candidate), pixelHeight, regionWidthPixels, safetyMargin)) {
      if (i > start) {
        // 直前までで1チャンクを閉じ、現在の文字から次のチャンクを始める。
        chunks.push({ start, end: i - 1 });
        start = i;
      } else {
        // 単独の文字でも収まらない。これ以上分割できないため単独チャンクとして確定する。
        chunks.push({ start, end: i });
        start = i + 1;
      }
    }
  }
  if (start <= range.end) {
    chunks.push({ start, end: range.end });
  }
  return chunks;
}

/** preferredUnit に基づく基底範囲（フレーズ全体・単語ごと・チャンク）を作る。 */
function baseRanges(
  flat: readonly FlatChar[],
  preferredUnit: ReadingDisplayUnit,
  pixelHeight: number,
  regionWidthPixels: number,
  safetyMargin: number
): FlatRange[] {
  const whole: FlatRange = { start: 0, end: flat.length - 1 };
  if (preferredUnit === "chunk") {
    return splitRangeIntoChunks(flat, whole, pixelHeight, regionWidthPixels, safetyMargin);
  }
  if (preferredUnit === "phrase") {
    if (fitsWithinRegion(rangeText(flat, whole), pixelHeight, regionWidthPixels, safetyMargin)) {
      return [whole];
    }
    // フレーズ全体が収まらないので単語単位へ落とす。
  }
  // 単語ごとの範囲（平ら配列で連続する同一単語番号のまとまり）。
  const wordRanges: FlatRange[] = [];
  let start = 0;
  for (let i = 1; i <= flat.length; i++) {
    if (i === flat.length || flat[i].wordIndex !== flat[start].wordIndex) {
      wordRanges.push({ start, end: i - 1 });
      start = i;
    }
  }
  return wordRanges;
}

/**
 * 1フレーズの読ませる役の区間を作る。preferredUnit から始め、収まらない範囲はチャンクへ落として必ず収める。
 * 表示時刻範囲は [フレーズ開始, フレーズ終了) を切れ目なく分割するため、被覆が構成上保証される。
 */
export function buildReadingSpansForPhrase(
  phrase: LyricPhraseUnit,
  preferredUnit: ReadingDisplayUnit,
  pixelHeight: number,
  regionWidthPixels: number,
  safetyMargin: number = READING_FIT_SAFETY_MARGIN
): ReadingSpan[] {
  const flat = flattenChars(phrase);
  if (flat.length === 0) {
    // 文字を持たないフレーズはフレーズ全文を1区間で出し、フレーズ全体を被覆する。
    return [
      { phraseIndex: phrase.phraseIndex, text: phrase.text, displayStartMs: phrase.startTimeMs, displayEndMs: phrase.endTimeMs, charRefs: [] },
    ];
  }

  // 基底範囲を作り、収まらない範囲はチャンクへ再分割して最終範囲列を得る。
  const ranges: FlatRange[] = [];
  for (const range of baseRanges(flat, preferredUnit, pixelHeight, regionWidthPixels, safetyMargin)) {
    if (
      range.end > range.start &&
      !fitsWithinRegion(rangeText(flat, range), pixelHeight, regionWidthPixels, safetyMargin)
    ) {
      ranges.push(...splitRangeIntoChunks(flat, range, pixelHeight, regionWidthPixels, safetyMargin));
    } else {
      ranges.push(range);
    }
  }

  // 表示時刻の境界を作る。先頭はフレーズ開始、各区間の境界はその区間の先頭文字の開始時刻、末尾はフレーズ終了。
  // 境界は単調非減少にし、[フレーズ開始, フレーズ終了] に収める。これにより区間が切れ目なくフレーズを被覆する。
  const boundaries: number[] = [phrase.startTimeMs];
  for (let i = 1; i < ranges.length; i++) {
    const charStart = flat[ranges[i].start].startTimeMs;
    const clamped = Math.min(Math.max(charStart, boundaries[i - 1]), phrase.endTimeMs);
    boundaries.push(clamped);
  }
  boundaries.push(phrase.endTimeMs);

  const spans: ReadingSpan[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const charRefs: { wordIndex: number; charIndex: number }[] = [];
    for (let j = range.start; j <= range.end; j++) {
      charRefs.push({ wordIndex: flat[j].wordIndex, charIndex: flat[j].charIndex });
    }
    spans.push({
      phraseIndex: phrase.phraseIndex,
      text: rangeText(flat, range),
      displayStartMs: boundaries[i],
      displayEndMs: boundaries[i + 1],
      charRefs,
    });
  }
  return spans;
}

/** 区間列から、再生位置を含む区間を返す（半開区間。無ければ null）。 */
export function readingSpanAt(spans: readonly ReadingSpan[], positionMs: number): ReadingSpan | null {
  for (const span of spans) {
    if (positionMs >= span.displayStartMs && positionMs < span.displayEndMs) {
      return span;
    }
  }
  return null;
}

/** フレーズ番号ごとの読ませる役区間の表。 */
export type ReadingSpansByPhrase = ReadonlyMap<number, readonly ReadingSpan[]>;

/** buildReadingSpansByPhrase の設定。 */
export interface ReadingLayoutOptions {
  /** 画面の横デバイス画素数。 */
  readonly viewportPixelWidth: number;
  /** 配置指定の無いフレーズの既定の想定表示寸法（デバイス画素）。 */
  readonly defaultTargetPixelHeight: number;
  /** 配置指定の無いフレーズの既定の表示領域。 */
  readonly defaultRegion: TypographyDisplayRegion;
  /** 収まり判定の安全余白。既定 READING_FIT_SAFETY_MARGIN。 */
  readonly safetyMargin?: number;
}

/** 1フレーズに対する読ませる役の配置（譜面の指定、または既定）。 */
export interface ReadingPlacementResolved {
  readonly unit: ReadingDisplayUnit;
  readonly targetPixelHeight: number;
  readonly region: TypographyDisplayRegion;
}

/**
 * 想定表示寸法を、表示領域の高さに収まる範囲へ抑える（採用理由を先に述べる）。
 * 読ませる役は1行で出すため、その高さは想定表示寸法そのものである。1行は縦に分割できないため、
 * 想定表示寸法が表示領域の高さ（安全余白を引いた値）を超えると縦にはみ出す。これを防ぐため想定表示寸法を
 * 表示領域の高さ以下へ抑える。安全余白を幅と同じ割合にする理由は、縁に文字が接しない余白を縦横で揃えるためである。
 * ただし可読性の最小表示寸法を下回らせない。理由は、最小表示寸法を割ると読めなくなり、読めない文字は被覆
 * （受け入れ基準2）を満たさないため、収まりより可読性を優先するからである。表示領域が最小表示寸法すら入らない
 * ほど低いときは最小表示寸法を採り、わずかに領域からはみ出すことを許す。
 */
export function clampReadingPixelHeight(
  requestedPixelHeight: number,
  regionHeightRatio: number,
  viewportPixelHeight: number,
  minPixelHeight: number,
  safetyMargin: number = READING_FIT_SAFETY_MARGIN
): number {
  const usableHeightPixels = regionHeightRatio * viewportPixelHeight * (1 - safetyMargin);
  const fitted = Math.min(requestedPixelHeight, usableHeightPixels);
  return Math.max(minPixelHeight, fitted);
}

/** 想定表示寸法を表示領域の高さへ抑える設定。createPlacementResolver に渡すと各配置の高さを抑える。 */
export interface ReadingHeightClamp {
  /** 画面の縦デバイス画素数。 */
  readonly viewportPixelHeight: number;
  /** 可読性の最小表示寸法（デバイス画素）。これを下回らせない。 */
  readonly minPixelHeight: number;
  /** 安全余白。省略時は READING_FIT_SAFETY_MARGIN。 */
  readonly safetyMargin?: number;
}

/**
 * タイポ譜面の読ませる役配置から、フレーズ番号→配置を引く関数を作る。
 * 譜面に配置指定があるフレーズはその指定を、無いフレーズは既定（既定単位・既定寸法・既定領域）を返す。
 * これにより駆動部は譜面の有無に関わらず全フレーズの配置を一様に引ける。
 * clamp を渡すと、各配置の想定表示寸法を表示領域の高さへ抑える（縦方向の収まりを保証する）。
 */
export function createPlacementResolver(
  chart: TypographyChart | undefined,
  defaultUnit: ReadingDisplayUnit,
  defaultPixelHeight: number,
  defaultRegion: TypographyDisplayRegion,
  clamp?: ReadingHeightClamp
): (phraseIndex: number) => ReadingPlacementResolved {
  const applyClamp = (placement: ReadingPlacementResolved): ReadingPlacementResolved => {
    if (clamp === undefined) {
      return placement;
    }
    return {
      ...placement,
      targetPixelHeight: clampReadingPixelHeight(
        placement.targetPixelHeight,
        placement.region.heightRatio,
        clamp.viewportPixelHeight,
        clamp.minPixelHeight,
        clamp.safetyMargin
      ),
    };
  };
  const byPhrase = new Map<number, ReadingPlacementResolved>();
  for (const placement of chart?.readingPlacements ?? []) {
    byPhrase.set(
      placement.phraseIndex,
      applyClamp({ unit: placement.unit, targetPixelHeight: placement.targetPixelHeight, region: placement.region })
    );
  }
  const fallback: ReadingPlacementResolved = applyClamp({
    unit: defaultUnit,
    targetPixelHeight: defaultPixelHeight,
    region: defaultRegion,
  });
  return (phraseIndex: number): ReadingPlacementResolved => byPhrase.get(phraseIndex) ?? fallback;
}

/**
 * 歌詞タイムライン全体について、フレーズ番号ごとの読ませる役区間を作る。
 * placementFor はフレーズ番号からそのフレーズの配置を返す関数（譜面の指定があればそれ、無ければ既定）。
 */
export function buildReadingSpansByPhrase(
  timeline: LyricsTimeline,
  placementFor: (phraseIndex: number) => ReadingPlacementResolved,
  options: ReadingLayoutOptions
): ReadingSpansByPhrase {
  const safetyMargin = options.safetyMargin ?? READING_FIT_SAFETY_MARGIN;
  const byPhrase = new Map<number, readonly ReadingSpan[]>();
  for (const phrase of timeline.phrases) {
    const placement = placementFor(phrase.phraseIndex);
    const widthPixels = regionPixelWidth(placement.region.widthRatio, options.viewportPixelWidth);
    const spans = buildReadingSpansForPhrase(
      phrase,
      placement.unit,
      placement.targetPixelHeight,
      widthPixels,
      safetyMargin
    );
    byPhrase.set(phrase.phraseIndex, spans);
  }
  return byPhrase;
}

/**
 * 発声中のフレーズが読ませる役で切れ目なく被覆されているかを走査し、被覆が無い時刻の一覧を返す（空＝被覆）。
 * 各時刻でフレーズが発声中（phraseAt が非null）なら、そのフレーズの区間にその時刻を含むものが要る。
 */
export function findReadingCoverageGaps(
  timeline: LyricsTimeline,
  spansByPhrase: ReadingSpansByPhrase,
  songEndMs: number,
  sampleStepMs: number = READING_COVERAGE_SAMPLE_STEP_MS
): number[] {
  const gaps: number[] = [];
  for (let t = 0; t < songEndMs; t += sampleStepMs) {
    const phrase = phraseAt(timeline, t);
    if (phrase === null) {
      continue;
    }
    const spans = spansByPhrase.get(phrase.phraseIndex);
    if (spans === undefined || readingSpanAt(spans, t) === null) {
      gaps.push(t);
    }
  }
  return gaps;
}
