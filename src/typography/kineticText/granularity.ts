// 表示粒度切替コントローラ（Issue #29）。
// 歌詞の発声属性に応じて、文字・単語・フレーズ・画面全体の4段の表示粒度を時間軸で切り替える
// 曲非依存の純粋ロジック。出力（表示粒度プラン）は演出割付規則（#132）と曲固有譜面（#33）が
// 消費し、表示同期ゲート（#99）が検査の対象とする。
//
// 責務の境界: 本モジュールは「どの単位で出すか（粒度）」と「なぜそう判定したか（判定理由）」までを
// 決める。具体的な演出効果（縦伸ばし・円状回転・段階的構築・強調など）への写像は #132 が行う。
// 本モジュールは演出効果の名前を出力に持たない。
//
// 依存規則（docs/decisions/architecture.md §5、src/typography/README.md）:
//   - profiles・tools・three を import しない。
//   - 歌詞タイムラインの型は純粋モジュール src/textalive/lyricsTimeline.ts から型のみ取り込む。
//     公開窓口 src/textalive/index.ts 経由にしない（公開窓口は textalive パッケージに依存する
//     再生実装を再輸出しており、間接的な実行時依存が生じうるため）。
// 出典: docs/idea/concept-final.md §11、docs/research/01-kinetic-typography.md §9、Issue #29。

import type {
  LyricsTimeline,
  LyricPhraseUnit,
  LyricWordUnit,
  LyricCharUnit,
} from "../../textalive/lyricsTimeline";
import {
  GRANULARITY_SHORT_CHAR_MAX_MS,
  GRANULARITY_LONG_CHAR_MIN_MS,
  GRANULARITY_SHORT_DOMINANT_RATIO,
  GRANULARITY_LONG_TONE_DOMINANT_RATIO,
  GRANULARITY_DENSE_CHARS_PER_BEAT,
  GRANULARITY_HIGH_LOUDNESS_RATIO,
  GRANULARITY_READABLE_CHARS,
  GRANULARITY_NEAR_REPEAT_WINDOW_MS,
  GRANULARITY_FULLSCREEN_MIN_GAP_BEATS,
} from "../../config/tuning";

// ---- 出力の語彙（取りうる値を列挙した型） ----

/** 表示粒度。文字・単語・フレーズ・画面全体の4つだけ。チャンク分割はこの値に含めない。 */
export type Granularity = "char" | "word" | "phrase" | "fullscreen";

/** 採択した判定分岐（判定理由）。#132 が演出効果へ写像する入力。 */
export type GranularityReason =
  | "boundary" // 意味のある無音・区間境界
  | "longTone" // 長音主体
  | "repeat" // 近接反復
  | "longDense" // 長尺かつ高密度
  | "longSparse" // 長尺かつ低密度
  | "shortDense" // 短音優勢かつ高密度
  | "shortSparse" // 短音優勢かつ低密度
  | "middle"; // 中間

/** 粒度に応じて参照する歌詞単位の識別子。 */
export interface GranularityUnitRef {
  readonly phraseIndex: number;
  readonly wordIndex?: number;
  readonly charIndex?: number;
}

/**
 * 表示粒度プランの1セグメント。ある時間範囲を1つの粒度・判定理由で表示する。
 *
 * 時刻範囲 startTimeMs・endTimeMs は、表示の切替のタイミング（ビートへ吸着し、隣接セグメントと
 * 隙間も重複も無く連結したもの）を表す。これは元の歌詞単位の発声時刻とは一致しない。発声の実時刻が
 * 要るときは unitRefs が指す歌詞単位を歌詞タイムライン（src/textalive/lyricsTimeline.ts）で引く。
 */
export interface GranularitySegment {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly granularity: Granularity;
  /** 採択した判定分岐。#132 が演出効果へ写像する。 */
  readonly reason: GranularityReason;
  /** 参照するフレーズ番号。画面全体（無音）では null。 */
  readonly phraseIndex: number | null;
  /** 粒度に応じた歌詞単位の識別子。画面全体では空配列。 */
  readonly unitRefs: readonly GranularityUnitRef[];
  /** フレーズをチャンク分割した1まとまりのとき、その位置と総数。分割しないときは null。 */
  readonly phraseChunk: { readonly chunkIndex: number; readonly chunkCount: number } | null;
  /**
   * 文字粒度のときの発火の間引き間隔（拍）。1なら毎拍に1回発火、2なら2拍に1回発火。他粒度では null。
   * これは発火の間隔の拍数であって、1回の発火で表示する文字数ではない。1回の発火で何文字を表示するか、
   * および各文字を実際にどの瞬間に描画するかの最終割付は #132・#33・本編結線 #59 の責務である。
   */
  readonly charCadenceBeats: number | null;
}

/** 表示粒度プラン。時間順で曲全体を隙間も重複も無く被覆するセグメント列。 */
export interface GranularityPlan {
  readonly segments: readonly GranularitySegment[];
}

/** 整合検査が返す不整合の1件。 */
export interface GranularityPlanIssue {
  readonly path: string;
  readonly message: string;
}

// ---- 入力の構造型（profiles の型を import せず、最小の構造型に閉じる） ----

/** 声量曲線。values[i] は時刻 i × stepMs の声量。maxAmplitude は曲の最大声量。 */
export interface LoudnessCurveInput {
  readonly stepMs: number;
  readonly values: readonly number[];
  readonly maxAmplitude: number;
}

/** 区間（サビなど）の時間範囲。 */
export interface SectionRange {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

/** buildGranularityPlan の入力。 */
export interface GranularityInput {
  readonly lyricsTimeline: LyricsTimeline;
  /** ビート開始時刻の昇順配列。 */
  readonly beatStartTimesMs: readonly number[];
  readonly loudnessCurve: LoudnessCurveInput;
  /** 区間境界の時間範囲の昇順配列。 */
  readonly sectionBoundariesMs: readonly SectionRange[];
  /** 曲の終了時刻（ミリ秒）。最後のフレーズより後の被覆と曲末のビート吸着の安定に使う。 */
  readonly songEndMs: number;
}

// ---- 算出の補助関数 ----

/** 単位の継続時間。歌詞タイムラインは継続時間の項目を持たないため終了時刻から開始時刻を引く。 */
function durationMs(unit: { startTimeMs: number; endTimeMs: number }): number {
  return unit.endTimeMs - unit.startTimeMs;
}

/** フレーズの全文字を走査順に取り出す。 */
function collectChars(phrase: LyricPhraseUnit): LyricCharUnit[] {
  const chars: LyricCharUnit[] = [];
  for (const word of phrase.words) {
    for (const char of word.chars) {
      chars.push(char);
    }
  }
  return chars;
}

/** 時間範囲 [startMs, endMs) に開始時刻が入るビートの本数を数える。 */
function countBeatsInRange(
  beatStartTimesMs: readonly number[],
  startMs: number,
  endMs: number
): number {
  let count = 0;
  for (const beat of beatStartTimesMs) {
    if (beat >= startMs && beat < endMs) {
      count++;
    } else if (beat >= endMs) {
      break;
    }
  }
  return count;
}

/**
 * 時間範囲に重なる声量の標本の最大値。開始時刻を切り捨て、終了時刻を切り上げて添字へ換算し、
 * その範囲の標本の最大値を取る。入力の刻み幅に依存しないため特定の刻み幅を本体に固定しない。
 */
function loudnessMaxInRange(curve: LoudnessCurveInput, startMs: number, endMs: number): number {
  if (curve.values.length === 0 || curve.stepMs <= 0) {
    return 0;
  }
  const firstIndex = Math.max(0, Math.floor(startMs / curve.stepMs));
  const lastIndex = Math.min(curve.values.length - 1, Math.ceil(endMs / curve.stepMs));
  let max = 0;
  for (let i = firstIndex; i <= lastIndex; i++) {
    if (curve.values[i] > max) {
      max = curve.values[i];
    }
  }
  return max;
}

/**
 * 時刻を最も近いビート開始時刻へ吸着する。隣り合うビートの中点までを同じビートに帰属させる。
 * 最初のビートより前は最初のビートへ、最後のビートより後は最後のビートへ吸着する（両端の外側には
 * 隣のビートが無く中点を取れないため）。ビートが無いときは時刻をそのまま返す。
 */
function snapToNearestBeat(beatStartTimesMs: readonly number[], timeMs: number): number {
  const n = beatStartTimesMs.length;
  if (n === 0) {
    return timeMs;
  }
  if (timeMs <= beatStartTimesMs[0]) {
    return beatStartTimesMs[0];
  }
  if (timeMs >= beatStartTimesMs[n - 1]) {
    return beatStartTimesMs[n - 1];
  }
  // timeMs を挟む2つのビートを二分探索で求め、近い方を返す。
  let low = 0;
  let high = n - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (beatStartTimesMs[mid] <= timeMs) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const before = beatStartTimesMs[low];
  const after = beatStartTimesMs[high];
  return timeMs - before <= after - timeMs ? before : after;
}

/** 指定時刻より厳密に大きい最初のビート開始時刻を返す。無ければ null。ビートは昇順を前提とする。 */
function firstBeatGreaterThan(beatStartTimesMs: readonly number[], timeMs: number): number | null {
  let low = 0;
  let high = beatStartTimesMs.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (beatStartTimesMs[mid] > timeMs) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low < beatStartTimesMs.length ? beatStartTimesMs[low] : null;
}

// ---- フレーズの特徴量と粒度判定 ----

interface PhraseFeatures {
  readonly phrase: LyricPhraseUnit;
  readonly charCount: number;
  readonly beatCount: number;
  readonly density: number; // 1拍あたり文字数
  readonly shortRatio: number;
  readonly longRatio: number;
  readonly loud: boolean;
  readonly repeated: boolean;
}

function computeFeatures(
  phrase: LyricPhraseUnit,
  input: GranularityInput,
  nearRepeatPhraseIndexes: ReadonlySet<number>
): PhraseFeatures {
  const chars = collectChars(phrase);
  const charCount = chars.length;
  // 1拍に満たないフレーズでも零除算を避けるため、最低1拍として数える。
  const beatCount = Math.max(
    1,
    countBeatsInRange(input.beatStartTimesMs, phrase.startTimeMs, phrase.endTimeMs)
  );
  let shortCount = 0;
  let longCount = 0;
  for (const char of chars) {
    const d = durationMs(char);
    if (d <= GRANULARITY_SHORT_CHAR_MAX_MS) {
      shortCount++;
    }
    if (d >= GRANULARITY_LONG_CHAR_MIN_MS) {
      longCount++;
    }
  }
  const loudMax = loudnessMaxInRange(input.loudnessCurve, phrase.startTimeMs, phrase.endTimeMs);
  // 最大声量が正のときだけ比率で判断する。最大声量が0以下のとき（声量データが無い、または曲全体が
  // 無音）は「声量が大きい」を判断できないため、大きくないとみなす。これを入れないと、最大声量0の
  // 入力で 0 >= 0 が常に真になり、全フレーズが声量大と誤判定される。
  const loud =
    input.loudnessCurve.maxAmplitude > 0 &&
    loudMax >= input.loudnessCurve.maxAmplitude * GRANULARITY_HIGH_LOUDNESS_RATIO;
  return {
    phrase,
    charCount,
    beatCount,
    density: charCount === 0 ? 0 : charCount / beatCount,
    shortRatio: charCount === 0 ? 0 : shortCount / charCount,
    longRatio: charCount === 0 ? 0 : longCount / charCount,
    loud,
    repeated: nearRepeatPhraseIndexes.has(phrase.phraseIndex),
  };
}

/**
 * 近接反復（連発）のフレーズ番号の集合を求める。同一のフレーズ文字列が、近接反復の時間窓の中に
 * 2回以上現れるフレーズを連発とする。窓を設けるのは、遠く離れて再登場するサビの歌詞を連発と
 * 誤らないためである。
 *
 * フレーズは開始時刻の昇順である（findLyricsTimelineIssues が確認し、入力契約でも要求する）。
 * このため、同一文字列の出現は時間順に並び、ある出現が連発かどうかは時間的に隣り合う出現との
 * 間隔だけで決まる。よって文字列ごとに隣り合う出現の対を一度ずつ調べれば足り、計算量は全体で
 * フレーズ数に比例する（同一文字列が多数あっても二乗にならない）。
 */
function findNearRepeatPhraseIndexes(timeline: LyricsTimeline): Set<number> {
  const byText = new Map<string, LyricPhraseUnit[]>();
  for (const phrase of timeline.phrases) {
    const list = byText.get(phrase.text);
    if (list) {
      list.push(phrase);
    } else {
      byText.set(phrase.text, [phrase]);
    }
  }
  const result = new Set<number>();
  for (const list of byText.values()) {
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].startTimeMs - list[i - 1].startTimeMs;
      if (gap <= GRANULARITY_NEAR_REPEAT_WINDOW_MS) {
        result.add(list[i - 1].phraseIndex);
        result.add(list[i].phraseIndex);
      }
    }
  }
  return result;
}

interface Decision {
  readonly granularity: Granularity;
  readonly reason: GranularityReason;
}

/** フレーズの特徴量から粒度と判定理由を選ぶ。上から順に最初に成立した分岐を採る。 */
function decideGranularity(features: PhraseFeatures): Decision {
  const isLong = features.charCount > GRANULARITY_READABLE_CHARS;
  const dense = features.density >= GRANULARITY_DENSE_CHARS_PER_BEAT;
  const shortDominant = features.shortRatio >= GRANULARITY_SHORT_DOMINANT_RATIO;
  const longToneDominant =
    features.longRatio >= GRANULARITY_LONG_TONE_DOMINANT_RATIO &&
    features.loud &&
    features.charCount <= GRANULARITY_READABLE_CHARS;

  if (longToneDominant) {
    return { granularity: "phrase", reason: "longTone" };
  }
  if (features.repeated) {
    return { granularity: "phrase", reason: "repeat" };
  }
  if (isLong && dense) {
    return { granularity: "phrase", reason: "longDense" };
  }
  if (isLong && !dense) {
    return { granularity: "phrase", reason: "longSparse" };
  }
  if (shortDominant && dense) {
    return { granularity: "char", reason: "shortDense" };
  }
  if (shortDominant && !dense) {
    return { granularity: "char", reason: "shortSparse" };
  }
  return { granularity: "word", reason: "middle" };
}

// ---- セグメントの生成 ----

/** 可変のセグメント（生成途中で時刻を調整するため readonly にしない内部表現）。 */
interface MutableSegment {
  startTimeMs: number;
  endTimeMs: number;
  granularity: Granularity;
  reason: GranularityReason;
  phraseIndex: number | null;
  unitRefs: GranularityUnitRef[];
  phraseChunk: { chunkIndex: number; chunkCount: number } | null;
  charCadenceBeats: number | null;
}

/** フレーズ全体の単語参照。 */
function wordRefs(phrase: LyricPhraseUnit): GranularityUnitRef[] {
  return phrase.words.map((word) => ({
    phraseIndex: phrase.phraseIndex,
    wordIndex: word.wordIndex,
  }));
}

/** フレーズ全体の文字参照。 */
function charRefs(phrase: LyricPhraseUnit): GranularityUnitRef[] {
  const refs: GranularityUnitRef[] = [];
  for (const word of phrase.words) {
    for (const char of word.chars) {
      refs.push({
        phraseIndex: phrase.phraseIndex,
        wordIndex: word.wordIndex,
        charIndex: char.charIndex,
      });
    }
  }
  return refs;
}

/**
 * 長いフレーズを、連続する単語を先頭から足して可読数を超えない最大の範囲で区切ったチャンクへ分ける。
 * 単語の境界で区切るのは、単語の途中で改行すると読みにくいためである。各チャンクは少なくとも1単語を含む。
 *
 * 1つの単語そのものが可読数を超える場合は、単語境界では分割できないため、その単語が単独で可読数を
 * 超えるチャンクになる。対象曲TAKEOVERの最長単語は10文字で可読数14以下のため、この場合は起きない。
 * 他曲への横展開でこの場合が起きたときの過大な表示寸法の扱いは、読ませる役の想定表示寸法を持つ #33 と
 * 演出割付の #132 の責務とする。
 */
function splitPhraseIntoChunks(phrase: LyricPhraseUnit): LyricWordUnit[][] {
  const chunks: LyricWordUnit[][] = [];
  let current: LyricWordUnit[] = [];
  let currentChars = 0;
  for (const word of phrase.words) {
    const wordChars = word.chars.length;
    if (current.length > 0 && currentChars + wordChars > GRANULARITY_READABLE_CHARS) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(word);
    currentChars += wordChars;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/** 1フレーズを、判定に応じた1つ以上のセグメントへ変換する。 */
function segmentsForPhrase(phrase: LyricPhraseUnit, decision: Decision): MutableSegment[] {
  if (decision.reason === "longSparse") {
    const chunks = splitPhraseIntoChunks(phrase);
    const chunkCount = chunks.length;
    return chunks.map((words, chunkIndex) => ({
      startTimeMs: words[0].startTimeMs,
      endTimeMs: words[words.length - 1].endTimeMs,
      granularity: "phrase" as Granularity,
      reason: "longSparse" as GranularityReason,
      phraseIndex: phrase.phraseIndex,
      unitRefs: words.map((word) => ({
        phraseIndex: phrase.phraseIndex,
        wordIndex: word.wordIndex,
      })),
      phraseChunk: { chunkIndex, chunkCount },
      charCadenceBeats: null,
    }));
  }

  const base = {
    startTimeMs: phrase.startTimeMs,
    endTimeMs: phrase.endTimeMs,
    phraseIndex: phrase.phraseIndex,
    phraseChunk: null,
  };

  if (decision.granularity === "char") {
    const cadence = decision.reason === "shortDense" ? 2 : 1;
    return [
      {
        ...base,
        granularity: "char",
        reason: decision.reason,
        unitRefs: charRefs(phrase),
        charCadenceBeats: cadence,
      },
    ];
  }
  if (decision.granularity === "word") {
    return [
      {
        ...base,
        granularity: "word",
        reason: decision.reason,
        unitRefs: wordRefs(phrase),
        charCadenceBeats: null,
      },
    ];
  }
  // フレーズ粒度（longTone・repeat・longDense）。単位はフレーズそのもの。
  return [
    {
      ...base,
      granularity: "phrase",
      reason: decision.reason,
      unitRefs: [{ phraseIndex: phrase.phraseIndex }],
      charCadenceBeats: null,
    },
  ];
}

/** 時間範囲が区間境界（区間の開始または終了）を含むか。 */
function containsSectionBoundary(sections: readonly SectionRange[], startMs: number, endMs: number): boolean {
  for (const section of sections) {
    if (section.startTimeMs >= startMs && section.startTimeMs < endMs) {
      return true;
    }
    if (section.endTimeMs >= startMs && section.endTimeMs < endMs) {
      return true;
    }
  }
  return false;
}

/** 画面全体（無音の切れ目）のセグメントを作る。 */
function fullscreenSegment(startMs: number, endMs: number): MutableSegment {
  return {
    startTimeMs: startMs,
    endTimeMs: endMs,
    granularity: "fullscreen",
    reason: "boundary",
    phraseIndex: null,
    unitRefs: [],
    phraseChunk: null,
    charCadenceBeats: null,
  };
}

// ---- 本体 ----

/**
 * 歌詞タイムライン・ビート格子・声量曲線・区間境界・曲の終了時刻から、表示粒度プランを一度計算する。
 * 完全に決定的であり、再生中の瞬時値には依存しない。
 */
export function buildGranularityPlan(input: GranularityInput): GranularityPlan {
  const { lyricsTimeline, beatStartTimesMs, sectionBoundariesMs, songEndMs } = input;
  const nearRepeat = findNearRepeatPhraseIndexes(lyricsTimeline);

  // 1. フレーズごとの素のセグメントと、意味のある無音の画面全体セグメントを時間順に並べる。
  const raw: MutableSegment[] = [];
  let previousEndMs = 0;
  for (const phrase of lyricsTimeline.phrases) {
    // フレーズ前の無音を評価する。
    maybeInsertGap(raw, previousEndMs, phrase.startTimeMs, input);
    const features = computeFeatures(phrase, input, nearRepeat);
    // 文字を1つも持たないフレーズは表示する単位が無いため、セグメントを作らない。
    // 時間は隣接セグメントの鎖状連結で吸収される。次の無音評価のため終了時刻だけ進める。
    if (features.charCount === 0) {
      previousEndMs = phrase.endTimeMs;
      continue;
    }
    const decision = decideGranularity(features);
    for (const segment of segmentsForPhrase(phrase, decision)) {
      raw.push(segment);
    }
    previousEndMs = phrase.endTimeMs;
  }
  // 最後のフレーズより後の無音を評価する。
  maybeInsertGap(raw, previousEndMs, songEndMs, input);

  // 2〜5. 正規化（ビート吸着・鎖状連結・長さゼロの除去・曲末の一致）。
  return { segments: normalize(raw, beatStartTimesMs, songEndMs) };
}

/**
 * 無音区間 [startMs, endMs) が、無音を画面全体にする最小拍数以上、または区間境界を含むとき、
 * 画面全体セグメントを挿入する。満たないときは挿入せず、後段の連結で隣接セグメントへ吸収する。
 */
function maybeInsertGap(
  raw: MutableSegment[],
  startMs: number,
  endMs: number,
  input: GranularityInput
): void {
  if (endMs <= startMs) {
    return;
  }
  const gapBeats = countBeatsInRange(input.beatStartTimesMs, startMs, endMs);
  const significant =
    gapBeats >= GRANULARITY_FULLSCREEN_MIN_GAP_BEATS ||
    containsSectionBoundary(input.sectionBoundariesMs, startMs, endMs);
  if (significant) {
    raw.push(fullscreenSegment(startMs, endMs));
  }
}

/**
 * セグメント列を正規化する。開始時刻をビートへ吸着し、隙間・重複・長さゼロを解消して、
 * 曲頭から曲の終了時刻まで隙間も重複も無く被覆させる。
 */
function normalize(
  raw: MutableSegment[],
  beatStartTimesMs: readonly number[],
  songEndMs: number
): GranularitySegment[] {
  if (raw.length === 0) {
    // 歌詞も無音セグメントも無いときは、曲全体を1つの画面全体セグメントで被覆する。
    return [{ ...fullscreenSegment(0, songEndMs) }];
  }
  // 開始時刻の昇順に並べる。
  raw.sort((a, b) => a.startTimeMs - b.startTimeMs);

  // 開始時刻をビートへ吸着し、単調増加を保つ。先頭は曲頭(0)に固定する。
  const snapped: MutableSegment[] = [];
  let previousStart = -1;
  for (let i = 0; i < raw.length; i++) {
    const segment = raw[i];
    let start = i === 0 ? 0 : snapToNearestBeat(beatStartTimesMs, segment.startTimeMs);
    if (start <= previousStart) {
      // 吸着で前のセグメントの開始と同じか前になった場合、内容を捨てないために、前の開始より後の
      // 最初のビートへ置き直す。そのビートがこのセグメントの終了より前にあり長さを持てるときだけ採る。
      // 置けるビートが無い（このセグメントがビート間隔より短く隣のフレーズと同じビートに丸まる）ときに
      // 限り、このセグメントを取り除く（隣接セグメントの連結で時間は吸収される）。
      const next = firstBeatGreaterThan(beatStartTimesMs, previousStart);
      if (next !== null && next < segment.endTimeMs) {
        start = next;
      } else {
        continue;
      }
    }
    segment.startTimeMs = start;
    snapped.push(segment);
    previousStart = start;
  }

  // 鎖状に連結する（前の終了時刻を次の開始時刻に一致させる）。末尾は曲の終了時刻に一致させる。
  for (let i = 0; i < snapped.length; i++) {
    snapped[i].endTimeMs = i + 1 < snapped.length ? snapped[i + 1].startTimeMs : songEndMs;
  }

  // 末尾セグメントの開始が曲の終了時刻以上に吸着された等で長さゼロまたは負になったものを取り除き、
  // 取り除いた分で連結が崩れないよう、残ったセグメントの終了時刻を鎖状に再計算する。
  const cleaned = snapped.filter((s) => s.endTimeMs > s.startTimeMs);
  for (let i = 0; i < cleaned.length; i++) {
    cleaned[i].endTimeMs = i + 1 < cleaned.length ? cleaned[i + 1].startTimeMs : songEndMs;
  }

  return cleaned.map((s) => ({
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    granularity: s.granularity,
    reason: s.reason,
    phraseIndex: s.phraseIndex,
    unitRefs: s.unitRefs,
    phraseChunk: s.phraseChunk,
    charCadenceBeats: s.charCadenceBeats,
  }));
}

// ---- 時刻探索 ----

/**
 * 再生位置を含むセグメントを二分探索で返す。曲全体を被覆するため無音でも画面全体セグメントを返し、
 * 曲の範囲外（最初の開始より前、最後の終了以降）のみ null を返す。
 */
export function granularityAt(plan: GranularityPlan, positionMs: number): GranularitySegment | null {
  const segments = plan.segments;
  if (segments.length === 0) {
    return null;
  }
  if (positionMs < segments[0].startTimeMs || positionMs >= segments[segments.length - 1].endTimeMs) {
    return null;
  }
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = segments[mid];
    if (positionMs < segment.startTimeMs) {
      high = mid - 1;
    } else if (positionMs >= segment.endTimeMs) {
      low = mid + 1;
    } else {
      return segment;
    }
  }
  return null;
}

// ---- 整合検査 ----

const GRANULARITY_VALUES: ReadonlySet<string> = new Set(["char", "word", "phrase", "fullscreen"]);
const REASON_VALUES: ReadonlySet<string> = new Set([
  "boundary",
  "longTone",
  "repeat",
  "longDense",
  "longSparse",
  "shortDense",
  "shortSparse",
  "middle",
]);

/**
 * 表示粒度プランの構造的な整合性を検査し、不整合の一覧を返す（空なら整合）。例外は投げない。
 * 同期割合などの品質判断は #99 が別に行う。本関数は出力の構造的正しさに責務を限定する。
 */
export function findGranularityPlanIssues(
  plan: GranularityPlan,
  input: GranularityInput
): GranularityPlanIssue[] {
  const issues: GranularityPlanIssue[] = [];
  const segments = plan.segments;
  const beatSet = new Set(input.beatStartTimesMs);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const path = `segments[${i}]`;

    if (!Number.isFinite(s.startTimeMs) || !Number.isFinite(s.endTimeMs)) {
      issues.push({ path, message: "時刻が有限の数値でない" });
    }
    if (s.endTimeMs <= s.startTimeMs) {
      issues.push({ path, message: "終了時刻が開始時刻以下で長さがゼロまたは負になっている" });
    }
    if (!GRANULARITY_VALUES.has(s.granularity)) {
      issues.push({ path, message: "粒度が4つの値のいずれでもない" });
    }
    if (!REASON_VALUES.has(s.reason)) {
      issues.push({ path, message: "判定理由が定義済みの値のいずれでもない" });
    }

    // 開始時刻はビートへ吸着しているか（先頭の曲頭0は例外として許す）。
    // ビートが1つも無い入力では吸着の対象が無く吸着できないため、この検査は行わない。
    if (i > 0 && input.beatStartTimesMs.length > 0 && !beatSet.has(s.startTimeMs)) {
      issues.push({ path, message: "開始時刻がビート開始時刻に吸着していない" });
    }

    // 粒度ごとの整合。
    if (s.granularity === "fullscreen") {
      if (s.phraseIndex !== null) {
        issues.push({ path, message: "画面全体粒度でフレーズ番号が null でない" });
      }
      if (s.unitRefs.length !== 0) {
        issues.push({ path, message: "画面全体粒度で歌詞単位参照が空でない" });
      }
      if (s.charCadenceBeats !== null) {
        issues.push({ path, message: "画面全体粒度で文字発火間隔が null でない" });
      }
    } else {
      if (s.phraseIndex === null) {
        issues.push({ path, message: "歌詞を伴う粒度でフレーズ番号が null になっている" });
      }
      if (s.unitRefs.length === 0) {
        issues.push({ path, message: "歌詞を伴う粒度で歌詞単位参照が空である" });
      }
    }

    if (s.granularity === "char") {
      if (s.charCadenceBeats !== 1 && s.charCadenceBeats !== 2) {
        issues.push({ path, message: "文字粒度で文字発火間隔が1または2でない" });
      }
      for (const ref of s.unitRefs) {
        if (ref.charIndex === undefined) {
          issues.push({ path, message: "文字粒度の歌詞単位参照に文字番号が無い" });
          break;
        }
      }
    } else if (s.charCadenceBeats !== null) {
      issues.push({ path, message: "文字粒度以外で文字発火間隔が null でない" });
    }

    if (s.granularity === "word") {
      for (const ref of s.unitRefs) {
        if (ref.wordIndex === undefined || ref.charIndex !== undefined) {
          issues.push({ path, message: "単語粒度の歌詞単位参照は単語番号を持ち文字番号を持たない" });
          break;
        }
      }
    }

    // チャンク分割の整合。
    if (s.phraseChunk !== null) {
      if (s.granularity !== "phrase" || s.reason !== "longSparse") {
        issues.push({ path, message: "チャンク分割はフレーズ粒度かつ判定理由が長尺低密度のときだけ持つ" });
      }
      if (
        s.phraseChunk.chunkCount <= 0 ||
        s.phraseChunk.chunkIndex < 0 ||
        s.phraseChunk.chunkIndex >= s.phraseChunk.chunkCount
      ) {
        issues.push({ path, message: "チャンクの番号または総数が整合しない" });
      }
    }

    // 連結（隙間・重複・順序）の検査。
    if (i > 0) {
      const previous = segments[i - 1];
      if (s.startTimeMs < previous.endTimeMs) {
        issues.push({ path, message: "前のセグメントと時間が重なっている" });
      } else if (s.startTimeMs > previous.endTimeMs) {
        issues.push({ path, message: "前のセグメントとの間に隙間がある" });
      }
    }
  }

  // 曲全体の被覆。
  if (segments.length > 0) {
    if (segments[0].startTimeMs !== 0) {
      issues.push({ path: "segments[0]", message: "最初のセグメントが曲頭(0)から始まっていない" });
    }
    const last = segments[segments.length - 1];
    if (last.endTimeMs !== input.songEndMs) {
      issues.push({
        path: `segments[${segments.length - 1}]`,
        message: "最後のセグメントが曲の終了時刻で終わっていない",
      });
    }
  }

  return issues;
}
