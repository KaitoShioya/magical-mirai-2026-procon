// 見せ場マップ生成（Issue #41）の統括。信号処理・ピーク選定・窓決定・重み付与の各層を結線する純粋関数。
// 戦略B（構造保証）: chorus 反復区間を必ず見せ場にし、残りを非chorusの高ボルテージ点で補う。
// 出典 docs/decisions/app-overall-decisions.md §3.5・§3.6、docs/research/04-ux-and-chart-design.md、Issue #41。

import { buildCompositeCurve } from "./showcaseSignals";
import {
  isTimeExcluded,
  maxValue,
  selectClimaxChorusIndex,
  selectPeaksFromCurve,
} from "./showcasePeaks";
import { buildBeatWindow, extendClimaxWindow, resolveWindows } from "./showcaseWindows";
import { assignWeights } from "./showcaseWeights";
import {
  DEFAULT_SHOWCASE_OPTIONS,
  type ChorusSegment,
  type CompositeCurve,
  type NonChorusPeak,
  type Showcase,
  type ShowcaseInput,
  type ShowcaseOptions,
  type ShowcaseWindow,
} from "./types";

/** chorus 区間数が見せ場の個数（count）を超えた。戦略B では chorus は必須なので黙って削らず失敗させる。 */
export class TooManyChorusError extends Error {
  constructor(chorusCount: number, count: number) {
    super(`chorus 区間数が見せ場の個数を超えている（chorus${chorusCount}、count${count}）`);
    this.name = "TooManyChorusError";
  }
}

/** オプションの値が不正（個数が1未満、重みの下限が上限を超える等）。誤った設定で不正な見せ場を出さないため失敗させる。 */
export class InvalidShowcaseOptionError extends Error {
  constructor(message: string) {
    super(`見せ場生成オプションが不正: ${message}`);
    this.name = "InvalidShowcaseOptionError";
  }
}

/** chorus 区間の値が不正（開始が終了以上、または非有限）。不正な区間から不正な窓を作らないため失敗させる。 */
export class InvalidChorusSegmentError extends Error {
  constructor(index: number, startMs: number, endMs: number) {
    super(`chorus 区間[${index}]の値が不正（開始${startMs}ms、終了${endMs}ms）`);
    this.name = "InvalidChorusSegmentError";
  }
}

/**
 * オプションの妥当性を入口で検査する。
 * 採用理由を先に述べる。各値は生成結果の不変条件（見せ場の個数・weight が0〜1・窓が正の幅を持つ）を支える前提で、
 * 不正な値を黙って使うと検証を通らない見せ場や意味の壊れた重みが出る。よって早期に明確なエラーで失敗させる。
 * 個数が1以上なのは、見せ場が1個以上で初めて「climax がちょうど1つ」の不変条件が成り立つため。重みは曲プロファイルの
 * スキーマで0〜1に制限されるため値域を[0,1]とし、下限が上限を超えないことを課す。幅・距離の各値は窓が潰れたり距離が
 * 負になったりしないよう非負（窓幅と片側拍数は正）とする。
 */
function validateOptions(options: ShowcaseOptions): void {
  const requirePositiveInteger = (value: number, name: string): void => {
    if (!Number.isInteger(value) || value < 1) {
      throw new InvalidShowcaseOptionError(`${name} は1以上の整数である必要がある（受け取った値 ${value}）`);
    }
  };
  const requireNonNegativeInteger = (value: number, name: string): void => {
    if (!Number.isInteger(value) || value < 0) {
      throw new InvalidShowcaseOptionError(`${name} は0以上の整数である必要がある（受け取った値 ${value}）`);
    }
  };
  const requireNonNegative = (value: number, name: string): void => {
    if (!Number.isFinite(value) || value < 0) {
      throw new InvalidShowcaseOptionError(`${name} は0以上の有限な値である必要がある（受け取った値 ${value}）`);
    }
  };
  const requirePositive = (value: number, name: string): void => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new InvalidShowcaseOptionError(`${name} は正の有限な値である必要がある（受け取った値 ${value}）`);
    }
  };
  const requireUnitRange = (value: number, name: string): void => {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new InvalidShowcaseOptionError(`${name} は0以上1以下である必要がある（受け取った値 ${value}）`);
    }
  };

  requirePositiveInteger(options.count, "count");
  // climaxAnchorMs は曲中の時点（ミリ秒）なので有限かつ非負を要求する。非有限だと chorus 選定や climax 窓延長が
  // 設計意図と異なる経路に入る（例: NaN との比較が偽になり窓が189秒地点を覆わない）。
  requireNonNegative(options.climaxAnchorMs, "climaxAnchorMs");
  requirePositive(options.gridMs, "gridMs");
  // smoothHalfBins は平滑化で配列添字の増分に使うため、整数でないと添字が未定義になり合成値が非数になる。
  requireNonNegativeInteger(options.smoothHalfBins, "smoothHalfBins");
  requireNonNegative(options.amplitudeWeight, "amplitudeWeight");
  requireNonNegative(options.densityWeight, "densityWeight");
  requireNonNegative(options.minSpacingMs, "minSpacingMs");
  requireNonNegative(options.climaxGuardMs, "climaxGuardMs");
  // peakConfidenceRatio は合成値÷全体最大という0〜1の比に対する目安下限なので値域を[0,1]とする。
  requireUnitRange(options.peakConfidenceRatio, "peakConfidenceRatio");
  requirePositiveInteger(options.windowHalfBeats, "windowHalfBeats");
  requirePositive(options.windowHalfMsFallback, "windowHalfMsFallback");
  requireNonNegative(options.minWindowMs, "minWindowMs");
  requireNonNegative(options.compositeEqualEpsilon, "compositeEqualEpsilon");
  requireUnitRange(options.climaxWeight, "climaxWeight");
  requireUnitRange(options.nonClimaxWeightFloor, "nonClimaxWeightFloor");
  requireUnitRange(options.nonClimaxWeightCeil, "nonClimaxWeightCeil");
  if (options.nonClimaxWeightFloor > options.nonClimaxWeightCeil) {
    throw new InvalidShowcaseOptionError(
      `nonClimaxWeightFloor は nonClimaxWeightCeil 以下である必要がある（下限 ${options.nonClimaxWeightFloor}、上限 ${options.nonClimaxWeightCeil}）`
    );
  }
}

/**
 * chorus 区間の妥当性を入口で検査する。
 * 採用理由を先に述べる。chorus 区間はそのまま不変の見せ場窓になるため、開始が終了以上の区間や非有限の値を渡すと
 * 幅が0以下の窓が黙って出力され、後段のスキーマ検証で初めて失敗する。発生源で明確に失敗させるため入口で検査する。
 */
function validateChorusSegments(chorusSegments: ChorusSegment[]): void {
  chorusSegments.forEach((seg, i) => {
    if (!Number.isFinite(seg.startMs) || !Number.isFinite(seg.endMs) || seg.startMs >= seg.endMs) {
      throw new InvalidChorusSegmentError(i, seg.startMs, seg.endMs);
    }
  });
}

/**
 * 連続するサビ区間を同一ブロックとみなす隙間の上限（ミリ秒）。
 * 採用理由を先に述べる。連続するサビ区間は境界を共有し、後の区間の開始が前の区間の終了に一致するため隙間はほぼ0
 * （実データで−0.0005〜0ミリ秒）である。一方、別のサビ群の間には数万ミリ秒の隙間がある（実データで最小33400ミリ秒）。
 * よって隙間が1ミリ秒以下なら浮動小数点の誤差を含めて「境界を共有する連続サビ」とみなし、別のサビ群（隙間33400ミリ秒以上）
 * とは明確に区別できる。
 */
const CHORUS_MERGE_GAP_TOLERANCE_MS = 1;

/**
 * 連続するサビ区間を1つのブロックへ統合する。
 * 役割を先に述べる。戦略Bは各サビ区間を不変の見せ場窓にするが、1つのサビ群が複数の反復区間に分かれて隣接して記録される曲では、
 * 接する区間を別々の不変窓にすると、クライマックス窓の延長が隣接窓へ食い込んで窓どうしが重なる。隣り合う反復区間
 *（隙間が CHORUS_MERGE_GAP_TOLERANCE_MS 以下）は1つのサビ群（1つの見せ場の節）であるため、開始順に並べて統合し、
 * 1つの不変窓にする。離れたサビ群は統合しない。入力は妥当性検査済みのサビ区間（開始<終了）とし、結果は開始時刻の昇順で
 * 重なりのないブロックになる。多様性逓減区間（diversityZones）とオンセット選別のサビ単位は個別反復のままで、本統合は見せ場生成に限る。
 */
export function mergeContiguousChorusSegments(chorusSegments: ChorusSegment[]): ChorusSegment[] {
  if (chorusSegments.length === 0) {
    return [];
  }
  const sorted = [...chorusSegments].sort((a, b) => a.startMs - b.startMs);
  const merged: ChorusSegment[] = [{ startMs: sorted[0].startMs, endMs: sorted[0].endMs }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const seg = sorted[i];
    if (seg.startMs - last.endMs <= CHORUS_MERGE_GAP_TOLERANCE_MS) {
      // 隙間が許容内なら同一ブロックとして終了時刻を後ろへ伸ばす。重なりや微小な負の隙間も終了の大きい方を採る。
      last.endMs = Math.max(last.endMs, seg.endMs);
    } else {
      merged.push({ startMs: seg.startMs, endMs: seg.endMs });
    }
  }
  return merged;
}

interface PipelineResult {
  options: ShowcaseOptions;
  curve: CompositeCurve;
  resolvedWindows: ShowcaseWindow[];
  nonChorusPeaks: NonChorusPeak[];
}

/** climax 区間より後ろにある最も早い chorus の開始時刻。無ければ null。climax 窓延長の頭打ちに使う。 */
function nextChorusStartAfter(chorusSegments: ChorusSegment[], climaxStartMs: number): number | null {
  let next: number | null = null;
  for (const seg of chorusSegments) {
    if (seg.startMs > climaxStartMs && (next === null || seg.startMs < next)) {
      next = seg.startMs;
    }
  }
  return next;
}

function toNonChorusWindow(
  peak: NonChorusPeak,
  input: ShowcaseInput,
  options: ShowcaseOptions,
  isClimax: boolean
): ShowcaseWindow {
  const base = buildBeatWindow(peak.timeMs, input.beatsMs, options.windowHalfBeats, options.windowHalfMsFallback);
  const range = isClimax
    ? extendClimaxWindow(base, options.climaxAnchorMs, input.durationMs, null)
    : base;
  return {
    startMs: range.startMs,
    endMs: range.endMs,
    representativeMs: peak.timeMs,
    source: "nonChorus",
    isClimax,
  };
}

/**
 * 入力から見せ場の窓・合成曲線・非chorusピークまでを一括で導く（生成と検査の共通経路）。
 * chorus がある曲は chorus を不変窓にして climax を選び、残りを非chorusピークで補う。chorus が無い曲は
 * 6個すべてを非chorusピークから選び、合成ボルテージ最大のピーク（同値なら最も早い）を climax とする。
 */
function runPipeline(input: ShowcaseInput, partial: Partial<ShowcaseOptions>): PipelineResult {
  const options: ShowcaseOptions = { ...DEFAULT_SHOWCASE_OPTIONS, ...partial };
  validateOptions(options);
  validateChorusSegments(input.chorusSegments);
  // 連続するサビ区間（1つのサビ群が複数の反復区間に分かれて隣接して記録されたもの）を1ブロックへ統合してから見せ場にする。
  // 統合により、接する反復区間がクライマックス窓の延長で重なる事故を防ぎ、1つのサビ群を1つの見せ場に対応づける。離れたサビ群は統合されない。
  const chorus = mergeContiguousChorusSegments(input.chorusSegments);
  if (chorus.length > options.count) {
    throw new TooManyChorusError(chorus.length, options.count);
  }
  const curve = buildCompositeCurve(input, options);
  const globalMax = maxValue(curve.values);

  let windows: ShowcaseWindow[];
  let nonChorusPeaks: NonChorusPeak[] = [];

  if (chorus.length > 0) {
    const climaxIndex = selectClimaxChorusIndex(chorus, options.climaxAnchorMs);
    const climaxSeg = chorus[climaxIndex];
    const nextStart = nextChorusStartAfter(chorus, climaxSeg.startMs);
    const climaxRange = extendClimaxWindow(
      { startMs: climaxSeg.startMs, endMs: climaxSeg.endMs },
      options.climaxAnchorMs,
      input.durationMs,
      nextStart
    );
    windows = chorus.map((seg, i) => {
      if (i === climaxIndex) {
        return {
          startMs: climaxRange.startMs,
          endMs: climaxRange.endMs,
          representativeMs: (climaxRange.startMs + climaxRange.endMs) / 2,
          source: "chorus" as const,
          isClimax: true,
        };
      }
      return {
        startMs: seg.startMs,
        endMs: seg.endMs,
        representativeMs: (seg.startMs + seg.endMs) / 2,
        source: "chorus" as const,
        isClimax: false,
      };
    });
    const nonChorusCount = options.count - chorus.length;
    if (nonChorusCount > 0) {
      const excluder = (t: number) => isTimeExcluded(t, chorus, climaxRange, options.climaxGuardMs);
      nonChorusPeaks = selectPeaksFromCurve(
        curve.values,
        curve.gridMs,
        excluder,
        nonChorusCount,
        options.minSpacingMs,
        globalMax
      );
      windows = windows.concat(nonChorusPeaks.map((p) => toNonChorusWindow(p, input, options, false)));
    }
  } else {
    const excluder = (t: number) => isTimeExcluded(t, [], null, options.climaxGuardMs);
    nonChorusPeaks = selectPeaksFromCurve(
      curve.values,
      curve.gridMs,
      excluder,
      options.count,
      options.minSpacingMs,
      globalMax
    );
    let climaxPeakIndex = 0;
    let bestRatio = Number.NEGATIVE_INFINITY;
    nonChorusPeaks.forEach((p, i) => {
      if (p.compositeRatio > bestRatio) {
        bestRatio = p.compositeRatio;
        climaxPeakIndex = i;
      }
    });
    windows = nonChorusPeaks.map((p, i) => toNonChorusWindow(p, input, options, i === climaxPeakIndex));
  }

  const resolvedWindows = resolveWindows(windows, input.durationMs, options.minWindowMs);
  return { options, curve, resolvedWindows, nonChorusPeaks };
}

/**
 * 曲解析データから見せ場6箇所を決定論的に生成する（公開関数）。
 * 戻り値は `Showcase[]`（時刻昇順、index は0始まりの連番）のみで、純粋に保つため信頼比などの診断値や
 * スキーマ外フィールドは足さない。信頼比が要る検査は selectNonChorusPeaks を直接呼んで取得する。
 */
export function generateShowcases(input: ShowcaseInput, options?: Partial<ShowcaseOptions>): Showcase[] {
  const { options: opt, curve, resolvedWindows } = runPipeline(input, options ?? {});
  const sorted = resolvedWindows.slice().sort((a, b) => a.startMs - b.startMs);
  const weights = assignWeights(sorted, curve, opt);
  return sorted.map((w, i) => ({
    index: i,
    startTimeMs: w.startMs,
    endTimeMs: w.endMs,
    weight: weights[i],
    isClimax: w.isClimax,
  }));
}

/**
 * 非chorus見せ場のピークと各信頼比（ピーク位置の合成値÷全体最大）を返す（公開関数）。
 * generateShowcases の戻り値 `Showcase[]` には信頼比が載らないため、信頼比を検査する側はこの関数を直接呼ぶ。
 * 0.6 未満でも生成は止めず（診断値）、生成スクリプト（#45）はこの値を読んで低信頼を警告できる。
 */
export function selectNonChorusPeaks(
  input: ShowcaseInput,
  options?: Partial<ShowcaseOptions>
): NonChorusPeak[] {
  return runPipeline(input, options ?? {}).nonChorusPeaks;
}
