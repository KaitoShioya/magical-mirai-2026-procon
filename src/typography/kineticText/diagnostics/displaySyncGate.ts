// 表示同期ゲート（Issue #99）の判定ロジック。
// 仕様の正典は docs/research/08-quality-assurance.md 第3節「表示同期」行と、設計意義の docs/research/01-kinetic-typography.md 第9節。
//
// 本モジュールは2系統を明確に分ける。
//   系統1 evaluateDisplaySync: 記録の出所を一切知らない純粋判定。引数は「動きの記録（時刻列）」と「音楽的アンカー」だけ。
//          これにより #33 の上書き実装後は最終構成の記録をそのまま渡せる（記録源非依存・寛容判定の契約）。
//   系統2 buildDefaultDisplaySyncInput: 既定の記録源アダプタ。生 songmap から既定プランを作り記録とアンカーへ変換する。
//          #33 実装後はこの系統だけを最終構成の記録へ差し替え、系統1は変えない。
//
// 判定方針（ユーザー意思決定）: テキスト演出は完全自由度で上書きできるため、創作的タイミング（裏拍・タメ）を罰しない。
//   合否は「明らかな不正」（曲外・非有限・逆順・無動作・時間尺度の取り違え）と、ビート格子への寛容な接地だけで決める。
//   接地を厳格化しない（裏拍等を落とすため）。系統的オフセット等は合否でなく情報（同期率・最近傍距離）で可視化する。
//
// 依存規則（docs/decisions/architecture.md §5、src/typography/kineticText/README.md）: profiles・tools・three を import しない。
//   生 songmap は profiles の型でなく本モジュール内の構造型に閉じる（stressProfile.ts と同方針）。

import { buildLyricsTimeline, findLyricsTimelineIssues } from "../../../textalive/lyricsTimeline";
import type { LyricSourceVideo, LyricsTimeline } from "../../../textalive/lyricsTimeline";
import {
  buildGranularityPlan,
  findGranularityPlanIssues,
} from "../granularity";
import type { GranularityInput } from "../granularity";
import {
  buildAssignmentPlan,
  signalAvailabilityFrom,
  findAssignmentPlanIssues,
} from "../effectAssignment";
import type { AssignmentPlan } from "../effectAssignment";
import { createEffectRegistry } from "../effectElement";
import { charSmash } from "../effects/charSmash";

// ---- 主入力の型（系統1。時刻列とアンカーだけ） ----

/** 動きの記録。粒度切替時刻列と発火時刻列（いずれも昇順を想定するが、単調性は判定側が検査する）。 */
export interface DisplaySyncRecord {
  readonly switchTimesMs: readonly number[];
  readonly fireTimesMs: readonly number[];
}

/** 音楽的アンカー（楽曲データ由来の参照時刻。すべてミリ秒）。 */
export interface MusicalAnchors {
  /** ビート開始時刻。 */
  readonly beatsMs: readonly number[];
  /** 楽曲構造の境界（フレーズ境界∪区間境界）。 */
  readonly structureBoundariesMs: readonly number[];
  /** 声量の山（ピーク）時刻。 */
  readonly loudnessPeaksMs: readonly number[];
  /** 声のオンセット（文字開始）時刻。接地には用いず、距離の情報報告にのみ用いる。 */
  readonly vocalOnsetsMs: readonly number[];
}

/** 拍単位の距離の分布統計。要素が無いときは null。 */
export interface DistanceStat {
  readonly medianBeats: number | null;
  /** 95パーセンタイル（距離の大きい側の境界）。 */
  readonly p95Beats: number | null;
  readonly maxBeats: number | null;
}

export interface DisplaySyncThresholds {
  /** 中程度許容（拍）。発火がビートに乗るかの判定に使う。 */
  readonly toleranceMidBeats: number;
  /** 粗許容（拍）。構造境界・声量の山への一致判定に使う。 */
  readonly toleranceCoarseBeats: number;
  /** 接地許容（拍）。寛容な接地判定に使う。 */
  readonly toleranceGroundBeats: number;
  /** 接地率の合格下限。 */
  readonly groundedRatioMin: number;
  /** 時間尺度の被覆下限（曲終了時刻に対する記録最大時刻の比）。 */
  readonly coverageMinFraction: number;
  /** 件数が極端に少ないと警告する下限（これ未満で警告。合否は変えない）。 */
  readonly sparseCountWarn: number;
  /** 声量の山一致率がこれ未満で警告する閾値（合否は変えない）。 */
  readonly loudnessPeakSyncWarn: number;
}

/**
 * 初期閾値。すべて初期値であり、実装後のプレイ検証で #104（閾値定義集の確定）が調整する。各値の採用理由を併記する。
 */
export const DEFAULT_THRESHOLDS: DisplaySyncThresholds = {
  // 採用理由: TAKEOVER の拍間隔は約343ミリ秒（毎分175拍）で、4分の1拍は約86ミリ秒。音と映像の同期知覚窓の
  // 全帯域（約185ミリ秒）の内側に収まる中程度の幅であり、ビート上の動きと裏拍（半拍ずれ）を区別できる最大幅。
  toleranceMidBeats: 0.25,
  // 採用理由: 声量の山は200ミリ秒刻みの粗い標本に由来し時刻分解能が粗いため、ビートより広い半拍を用いる。
  toleranceCoarseBeats: 0.5,
  // 採用理由: 半拍は最寄りビートまでの最大距離に等しく、曲のビート格子で覆われた区間内の動きはほぼすべて接地する。
  // 接地を厳格化しないことで裏拍・タメ等の創作的タイミングを罰しない。明らかな不正は別の直交検査で落とす。
  toleranceGroundBeats: 0.5,
  // 採用理由: 妥当な記録では動きはほぼすべて楽曲のアンカーへ接地する。0.95未満はビートの無い空白への配置の混入を示す。
  groundedRatioMin: 0.95,
  // 採用理由: 秒とミリ秒の取り違えは全時刻を約1000分の1へ縮め記録最大時刻を曲長の約0.1パーセントにする。曲頭圧縮も同様。
  // 一方、創作的に一部区間だけ動かす構成でも最大時刻は曲長の数十パーセントに達する。この約1桁の隔たりに依拠し10パーセントを境界に置く。
  coverageMinFraction: 0.1,
  // 採用理由: TAKEOVER は楽曲構造の主要区間（サビ）が3つあり、それすら各1回未満しか動かさない疎らさは生成の異常の可能性が高い。
  // 4件未満を警告とする（合否は変えない）。
  sparseCountWarn: 4,
  // 採用理由: 固定2拍間隔で発火する charSmash は声量の山を狙わないため低くなりうる。著しく低い（0.05未満）ときだけ強く可視化する。
  loudnessPeakSyncWarn: 0.05,
};

export interface DisplaySyncRatios {
  /** 粒度切替の構造境界一致率（中程度でなく粗許容）。 */
  readonly granularityStructureSync: number;
  /** 発火のビート一致率（中程度許容）。 */
  readonly fireBeatSync: number;
  /** 発火の声量の山一致率（粗許容）。 */
  readonly fireLoudnessPeakSync: number;
  /** 粒度切替の接地率（構造境界∪ビート、接地許容）。 */
  readonly switchGroundedRatio: number;
  /** 発火の接地率（ビート∪声量の山、接地許容）。 */
  readonly fireGroundedRatio: number;
}

export interface DisplaySyncDistances {
  /** 粒度切替の「構造境界∪ビート」までの距離。 */
  readonly switchToStructureOrBeat: DistanceStat;
  /** 発火の「ビート∪声量の山」までの距離。 */
  readonly fireToBeatOrPeak: DistanceStat;
  /** 発火の「声のオンセット（文字開始）」までの距離（情報のみ）。 */
  readonly fireToVocalOnset: DistanceStat;
}

export interface DisplaySyncCues {
  readonly switchValidity: boolean;
  readonly fireValidity: boolean;
  readonly switchNonEmpty: boolean;
  readonly fireNonEmpty: boolean;
  readonly switchCoverage: boolean;
  readonly fireCoverage: boolean;
  readonly switchGrounded: boolean;
  readonly fireGrounded: boolean;
}

export interface DisplaySyncVerdict {
  readonly acceptable: boolean;
  /** 合否を不成立にした明らかな不正の理由（日本語）。 */
  readonly reasons: readonly string[];
  /** 合否は変えないが注意を促す警告（日本語）。 */
  readonly warnings: readonly string[];
  readonly cues: DisplaySyncCues;
  readonly ratios: DisplaySyncRatios;
  readonly distances: DisplaySyncDistances;
  readonly counts: { readonly switchCount: number; readonly fireCount: number };
}

// ---- 純粋な算出補助 ----

/** 昇順配列のコピーを返す（入力を壊さない）。 */
function sortedAscending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** 昇順配列 sorted で target 以下の最大要素の添字を返す（無ければ -1）。二分探索。 */
function floorIndex(sorted: readonly number[], target: number): number {
  let low = 0;
  let high = sorted.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] <= target) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

/**
 * 時刻 t における局所拍間隔（ミリ秒）。t を含む拍区間の長さ、端では隣接区間の長さを返す。
 * 採用理由: 各拍の長さは拍ごとに異なるため、固定値でなく t の最寄り拍区間の実測長を基準にするとテンポ変動に追従する。
 * 拍が2本未満では区間を定められないため、ゼロ除算を避ける安全値として1ミリ秒を返す（この退化入力では許容がほぼ0になり甘くならない）。
 */
function localBeatIntervalMs(t: number, beatsSorted: readonly number[]): number {
  const n = beatsSorted.length;
  if (n < 2) {
    return 1;
  }
  const i = floorIndex(beatsSorted, t);
  let interval: number;
  if (i < 0) {
    interval = beatsSorted[1] - beatsSorted[0];
  } else if (i >= n - 1) {
    interval = beatsSorted[n - 1] - beatsSorted[n - 2];
  } else {
    interval = beatsSorted[i + 1] - beatsSorted[i];
  }
  // 採用理由: 隣接ビートが等値（間隔が非正）になる退化入力では、距離の拍換算が無限大や非正へ壊れる。
  // この場合に安全値として1ミリ秒を返すと、許容（許容比×局所拍間隔）がほぼ0になり合否を甘くしない方向へ倒れる。
  return interval > 0 ? interval : 1;
}

/** 時刻 t から昇順アンカー列までの最近傍距離（ミリ秒）。アンカーが空なら正の無限大。 */
function nearestDistanceMs(t: number, anchorsSorted: readonly number[]): number {
  const n = anchorsSorted.length;
  if (n === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const i = floorIndex(anchorsSorted, t);
  let best = Number.POSITIVE_INFINITY;
  if (i >= 0) {
    best = Math.min(best, Math.abs(t - anchorsSorted[i]));
  }
  if (i + 1 < n) {
    best = Math.min(best, Math.abs(t - anchorsSorted[i + 1]));
  }
  return best;
}

/**
 * 時刻列のうち、アンカーへ許容 toleranceBeats（局所拍間隔に対する比）で一致する割合。
 * 時刻列が空のときは0を返す（無動作を1.0として合格にしないため）。
 */
function alignmentRatio(
  times: readonly number[],
  anchorsSorted: readonly number[],
  toleranceBeats: number,
  beatsSorted: readonly number[]
): number {
  if (times.length === 0) {
    return 0;
  }
  let aligned = 0;
  for (const t of times) {
    const tolerance = toleranceBeats * localBeatIntervalMs(t, beatsSorted);
    if (nearestDistanceMs(t, anchorsSorted) <= tolerance) {
      aligned += 1;
    }
  }
  return aligned / times.length;
}

/** 昇順配列の最近接順位法によるパーセンタイル。割合 fraction は0以上1以下。空配列は null。 */
function percentileNearestRank(sortedAscendingValues: readonly number[], fraction: number): number | null {
  const n = sortedAscendingValues.length;
  if (n === 0) {
    return null;
  }
  const rank = Math.ceil(fraction * n);
  const index = Math.min(n, Math.max(1, rank)) - 1;
  return sortedAscendingValues[index];
}

/** 時刻列の、アンカーまでの最近傍距離を局所拍間隔で割った拍単位の分布統計。 */
function distanceStats(
  times: readonly number[],
  anchorsSorted: readonly number[],
  beatsSorted: readonly number[]
): DistanceStat {
  if (times.length === 0 || anchorsSorted.length === 0) {
    return { medianBeats: null, p95Beats: null, maxBeats: null };
  }
  const distancesBeats = times.map((t) => {
    const interval = localBeatIntervalMs(t, beatsSorted);
    return nearestDistanceMs(t, anchorsSorted) / interval;
  });
  const sorted = sortedAscending(distancesBeats);
  return {
    medianBeats: percentileNearestRank(sorted, 0.5),
    p95Beats: percentileNearestRank(sorted, 0.95),
    maxBeats: sorted[sorted.length - 1],
  };
}

/** すべて有限の数値か。 */
function allFinite(times: readonly number[]): boolean {
  return times.every((t) => Number.isFinite(t));
}

/** すべて0以上かつ上限以下か。 */
function allInRange(times: readonly number[], maxMs: number): boolean {
  return times.every((t) => t >= 0 && t <= maxMs);
}

/** 単調非減少か。 */
function isNonDecreasing(times: readonly number[]): boolean {
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] < times[i - 1]) {
      return false;
    }
  }
  return true;
}

/** 2つの昇順配列の和集合（重複を除き昇順）。 */
function unionSorted(a: readonly number[], b: readonly number[]): number[] {
  return sortedAscending([...a, ...b]);
}

// ---- 系統1: 記録源非依存の純粋判定 ----

/**
 * 動きの記録と音楽的アンカーから表示同期の合否を判定する純粋関数。記録の出所を引数で受け取らず時刻列だけを見る。
 * 合否は「構造的妥当性（有限・曲内・単調）」「記録の非空」「時間尺度の被覆」「ビート格子への寛容な接地」で決め、
 * 創作的タイミングを罰しない。名前付き同期率・最近傍距離・件数・声量の山一致率は情報として併記する。
 */
export function evaluateDisplaySync(
  record: DisplaySyncRecord,
  anchors: MusicalAnchors,
  songEndMs: number,
  thresholds: DisplaySyncThresholds = DEFAULT_THRESHOLDS
): DisplaySyncVerdict {
  const t = thresholds;
  const switchTimes = record.switchTimesMs;
  const fireTimes = record.fireTimesMs;

  const beatsSorted = sortedAscending(anchors.beatsMs);
  const structureSorted = sortedAscending(anchors.structureBoundariesMs);
  const peaksSorted = sortedAscending(anchors.loudnessPeaksMs);
  const onsetsSorted = sortedAscending(anchors.vocalOnsetsMs);
  const switchGroundAnchors = unionSorted(structureSorted, beatsSorted);
  const fireGroundAnchors = unionSorted(beatsSorted, peaksSorted);

  const reasons: string[] = [];
  const warnings: string[] = [];

  // 構造的妥当性（記録源非依存）。
  const switchValidity =
    allFinite(switchTimes) && allInRange(switchTimes, songEndMs) && isNonDecreasing(switchTimes);
  const fireValidity =
    allFinite(fireTimes) && allInRange(fireTimes, songEndMs) && isNonDecreasing(fireTimes);
  if (!switchValidity) {
    reasons.push("粒度切替時刻に、有限でない値・曲の範囲外・逆順のいずれかがあります（明らかな不正）");
  }
  if (!fireValidity) {
    reasons.push("発火時刻に、有限でない値・曲の範囲外・逆順のいずれかがあります（明らかな不正）");
  }

  // 記録の非空。
  const switchNonEmpty = switchTimes.length > 0;
  const fireNonEmpty = fireTimes.length > 0;
  if (!switchNonEmpty) {
    reasons.push("粒度切替が1件もありません（無動作は明らかな不正）");
  }
  if (!fireNonEmpty) {
    reasons.push("発火が1件もありません（無動作は明らかな不正）");
  }

  // 時間尺度の被覆。記録の最大時刻が曲終了時刻の規定割合以上か。
  const coverageFloorMs = t.coverageMinFraction * songEndMs;
  const switchMax = switchNonEmpty ? Math.max(...switchTimes) : Number.NEGATIVE_INFINITY;
  const fireMax = fireNonEmpty ? Math.max(...fireTimes) : Number.NEGATIVE_INFINITY;
  const switchCoverage = switchNonEmpty && switchMax >= coverageFloorMs;
  const fireCoverage = fireNonEmpty && fireMax >= coverageFloorMs;
  const coveragePercent = Math.round(t.coverageMinFraction * 100);
  if (switchNonEmpty && !switchCoverage) {
    reasons.push(
      `粒度切替の最大時刻が曲終了時刻の${coveragePercent}パーセント未満です（秒とミリ秒の取り違えや曲頭圧縮の疑い）`
    );
  }
  if (fireNonEmpty && !fireCoverage) {
    reasons.push(
      `発火の最大時刻が曲終了時刻の${coveragePercent}パーセント未満です（秒とミリ秒の取り違えや曲頭圧縮の疑い）`
    );
  }

  // 接地率（寛容）。
  const switchGroundedRatio = alignmentRatio(
    switchTimes,
    switchGroundAnchors,
    t.toleranceGroundBeats,
    beatsSorted
  );
  const fireGroundedRatio = alignmentRatio(
    fireTimes,
    fireGroundAnchors,
    t.toleranceGroundBeats,
    beatsSorted
  );
  const switchGrounded = switchNonEmpty && switchGroundedRatio >= t.groundedRatioMin;
  const fireGrounded = fireNonEmpty && fireGroundedRatio >= t.groundedRatioMin;
  if (switchNonEmpty && !switchGrounded) {
    reasons.push(
      `粒度切替の接地率が ${switchGroundedRatio.toFixed(2)} で下限 ${t.groundedRatioMin} 未満です（楽曲のアンカーから離れた配置の混入）`
    );
  }
  if (fireNonEmpty && !fireGrounded) {
    reasons.push(
      `発火の接地率が ${fireGroundedRatio.toFixed(2)} で下限 ${t.groundedRatioMin} 未満です（楽曲のアンカーから離れた配置の混入）`
    );
  }

  // 情報の名前付き同期率。
  const granularityStructureSync = alignmentRatio(
    switchTimes,
    structureSorted,
    t.toleranceCoarseBeats,
    beatsSorted
  );
  const fireBeatSync = alignmentRatio(fireTimes, beatsSorted, t.toleranceMidBeats, beatsSorted);
  const fireLoudnessPeakSync = alignmentRatio(
    fireTimes,
    peaksSorted,
    t.toleranceCoarseBeats,
    beatsSorted
  );

  // 件数の警告（合否は変えない）。少数件のとき接地率は1件の外れで大きく振れるため、件数を理由文へ併記する。
  if (switchNonEmpty && switchTimes.length < t.sparseCountWarn) {
    warnings.push(
      `粒度切替が${switchTimes.length}件と極端に少なく、接地率は1件の外れで大きく振れます（生成の異常の疑い）`
    );
  }
  if (fireNonEmpty && fireTimes.length < t.sparseCountWarn) {
    warnings.push(
      `発火が${fireTimes.length}件と極端に少なく、接地率は1件の外れで大きく振れます（生成の異常の疑い）`
    );
  }

  // 声量の山一致率の警告（合否は変えない）。
  if (fireNonEmpty && fireLoudnessPeakSync < t.loudnessPeakSyncWarn) {
    warnings.push(
      `発火の声量の山一致率が ${fireLoudnessPeakSync.toFixed(2)} と著しく低く、発火が声量の山に乗っていません（声量の山を狙う演出 #30 の実装後に #104 が判断）`
    );
  }

  const acceptable =
    switchValidity &&
    fireValidity &&
    switchNonEmpty &&
    fireNonEmpty &&
    switchCoverage &&
    fireCoverage &&
    switchGrounded &&
    fireGrounded;

  return {
    acceptable,
    reasons,
    warnings,
    cues: {
      switchValidity,
      fireValidity,
      switchNonEmpty,
      fireNonEmpty,
      switchCoverage,
      fireCoverage,
      switchGrounded,
      fireGrounded,
    },
    ratios: {
      granularityStructureSync,
      fireBeatSync,
      fireLoudnessPeakSync,
      switchGroundedRatio,
      fireGroundedRatio,
    },
    distances: {
      switchToStructureOrBeat: distanceStats(switchTimes, switchGroundAnchors, beatsSorted),
      fireToBeatOrPeak: distanceStats(fireTimes, fireGroundAnchors, beatsSorted),
      fireToVocalOnset: distanceStats(fireTimes, onsetsSorted, beatsSorted),
    },
    counts: { switchCount: switchTimes.length, fireCount: fireTimes.length },
  };
}

// ---- 系統2: 既定の記録源アダプタ（生 songmap から既定プランを作り記録とアンカーへ変換） ----

/** 生 songmap の構造型（profiles の型を import せず最小の項目だけ要求する。stressProfile.ts と同方針）。 */
interface SongmapCharLike {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
}
interface SongmapWordLike {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly chars: readonly SongmapCharLike[];
}
interface SongmapPhraseLike {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly words: readonly SongmapWordLike[];
}
interface SongmapSegmentLike {
  readonly startTime: number;
  readonly endTime: number;
  readonly isChorus: boolean;
}
interface SongmapBeatLike {
  readonly startTime: number;
}
export interface SongmapLike {
  readonly song: { readonly duration: number };
  readonly beats: readonly SongmapBeatLike[];
  readonly segments: readonly SongmapSegmentLike[];
  readonly phrases: readonly SongmapPhraseLike[];
  readonly amplitudeStep: number;
  readonly amplitudeCurve: readonly number[];
  readonly maxVocalAmplitude: number;
  readonly vaCurve?: readonly unknown[];
}

/** songmap のフレーズ木を歌詞タイムラインの入力形（children の入れ子）へ写す。text を忠実に運ぶ。 */
function adaptToLyricSourceVideo(songmap: SongmapLike): LyricSourceVideo {
  return {
    phrases: songmap.phrases.map((phrase) => ({
      text: phrase.text,
      startTime: phrase.startTime,
      endTime: phrase.endTime,
      children: phrase.words.map((word) => ({
        text: word.text,
        startTime: word.startTime,
        endTime: word.endTime,
        children: word.chars.map((char) => ({
          text: char.text,
          startTime: char.startTime,
          endTime: char.endTime,
        })),
      })),
    })),
  };
}

/**
 * 声量曲線から声量の山（ピーク）の時刻を取り出す。
 * 山＝値が等しい連続区間で、その直前の標本より大きく、かつ直後の標本より大きく、かつ曲の最大声量の0.5倍以上の区間。
 * 山の時刻は区間の中央の標本の時刻とする。
 * 下限比0.5の採用理由: 「山」は曲中で相対的に大きい峰を指すため、絶対値でなく曲最大声量に対する比で下限を置くと舞台・曲に依存しない。
 * 連続区間（プラトー）を1つの山として中央で代表する採用理由: 持続音などで頂が平坦に連続する標本は1つの知覚的な山であり、
 * 直前と直後より大きい平坦区間を1点（中央）で代表すると、頂が単一標本のときと連続標本のときを同じ規則で扱える。
 */
export function extractLoudnessPeaksMs(
  amplitudeCurve: readonly number[],
  stepMs: number,
  maxAmplitude: number
): number[] {
  const peaks: number[] = [];
  const floor = 0.5 * maxAmplitude;
  const n = amplitudeCurve.length;
  let i = 1;
  while (i < n - 1) {
    const value = amplitudeCurve[i];
    // 値が等しい連続区間 [i, runEnd] を求める。
    let runEnd = i;
    while (runEnd + 1 < n && amplitudeCurve[runEnd + 1] === value) {
      runEnd += 1;
    }
    // 区間の直前と直後（区間外）の標本より大きく、床以上なら山とする。両端に接する区間（直前か直後が無い）は山にしない。
    const hasBefore = i - 1 >= 0;
    const hasAfter = runEnd + 1 < n;
    if (
      hasBefore &&
      hasAfter &&
      value >= floor &&
      value > amplitudeCurve[i - 1] &&
      value > amplitudeCurve[runEnd + 1]
    ) {
      const centerIndex = Math.floor((i + runEnd) / 2);
      peaks.push(centerIndex * stepMs);
    }
    i = runEnd + 1;
  }
  return peaks;
}

/** 楽曲構造の境界（フレーズの開始終了∪区間の開始終了）を昇順で返す。 */
function buildStructureBoundariesMs(songmap: SongmapLike): number[] {
  const values: number[] = [];
  for (const phrase of songmap.phrases) {
    values.push(phrase.startTime, phrase.endTime);
  }
  for (const segment of songmap.segments) {
    values.push(segment.startTime, segment.endTime);
  }
  return sortedAscending(values);
}

/** 声のオンセット（文字開始時刻）を昇順で返す。フレーズ内の子だけを辿る（next 連結は使わない）。 */
function buildVocalOnsetsMs(songmap: SongmapLike): number[] {
  const values: number[] = [];
  for (const phrase of songmap.phrases) {
    for (const word of phrase.words) {
      for (const char of word.chars) {
        values.push(char.startTime);
      }
    }
  }
  return sortedAscending(values);
}

/**
 * 演出割付プランから発火時刻列を展開する。
 * 各セグメントについて、状態 active で発火間隔（拍）を持つ割付を、セグメント開始の最寄りビートから発火間隔ぶん
 * ビートを進めながらセグメント終了まで列挙する。発火間隔は文字粒度では元セグメントの間隔、演出宣言由来ではその間隔を用いる。
 * 複数演出が同一時刻に発火する場合は1つの動きとして重複を除く。
 */
export function expandFireTimesMs(plan: AssignmentPlan, beatsSorted: readonly number[]): number[] {
  const times = new Set<number>();
  for (const segment of plan.segments) {
    // セグメントの発火間隔（拍）。文字粒度の間隔を優先し、無ければ演出宣言の間隔を使う。正の整数のみ採用する。
    let cadence = 0;
    for (const assignment of segment.assignments) {
      if (assignment.status !== "active") {
        continue;
      }
      const candidate = assignment.segmentCharCadenceBeats ?? assignment.effectBeatCadenceBeats;
      if (candidate !== null && Number.isInteger(candidate) && candidate > 0) {
        cadence = cadence === 0 ? candidate : Math.min(cadence, candidate);
      }
    }
    if (cadence === 0) {
      continue;
    }
    // セグメント開始時刻以上で最初のビートの添字を起点に、cadence 本ずつ進める。
    // 採用理由: 発火はセグメント自身のビート格子（開始時刻以上で最初のビートを起点に発火間隔ぶん進めたもの）に乗せる。
    // 開始より手前のビートを起点にすると、固定歩幅でセグメント内の正しいビートを飛ばし1拍ずれた記録になりうるため、
    // 開始時刻以上で最初のビートを起点にする。
    const startIndex = firstBeatIndexAtOrAfter(segment.startTimeMs, beatsSorted);
    if (startIndex < 0) {
      continue;
    }
    for (let i = startIndex; i < beatsSorted.length; i += cadence) {
      const time = beatsSorted[i];
      if (time >= segment.endTimeMs) {
        break;
      }
      times.add(time);
    }
  }
  return sortedAscending([...times]);
}

/** 時刻 t 以上で最初のビートの添字（該当が無ければ -1）。二分探索。 */
function firstBeatIndexAtOrAfter(t: number, beatsSorted: readonly number[]): number {
  let low = 0;
  let high = beatsSorted.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (beatsSorted[mid] >= t) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return result;
}

/** 系統2の出力。記録・アンカー・曲終了時刻と、出所固有の整合検査の不整合（理由）。 */
export interface DefaultDisplaySyncInput {
  readonly record: DisplaySyncRecord;
  readonly anchors: MusicalAnchors;
  readonly songEndMs: number;
  /** 出所固有の整合検査（歌詞タイムライン・表示粒度プラン・演出割付プラン）の不整合（空なら整合）。 */
  readonly sourceIssues: readonly string[];
}

/**
 * 生 songmap から既定プラン（buildGranularityPlan→buildAssignmentPlan）を作り、記録とアンカーへ変換する。
 * これは現状の記録源であり、#33 の上書きが実装された後は最終構成の記録へ差し替える。判定（evaluateDisplaySync）は変えない。
 */
export function buildDefaultDisplaySyncInput(songmap: SongmapLike): DefaultDisplaySyncInput {
  const lyricsTimeline: LyricsTimeline = buildLyricsTimeline(adaptToLyricSourceVideo(songmap));
  const beatStartTimesMs = songmap.beats.map((beat) => beat.startTime);
  const granularityInput: GranularityInput = {
    lyricsTimeline,
    beatStartTimesMs,
    loudnessCurve: {
      stepMs: songmap.amplitudeStep,
      values: songmap.amplitudeCurve,
      maxAmplitude: songmap.maxVocalAmplitude,
    },
    sectionBoundariesMs: songmap.segments.map((segment) => ({
      startTimeMs: segment.startTime,
      endTimeMs: segment.endTime,
    })),
    songEndMs: songmap.song.duration,
  };

  const granularityPlan = buildGranularityPlan(granularityInput);

  const registry = createEffectRegistry();
  registry.register(charSmash);
  const emotionAvailable = Array.isArray(songmap.vaCurve) && songmap.vaCurve.length > 0;
  const signals = signalAvailabilityFrom(granularityInput, emotionAvailable);
  const assignmentInput = { granularityPlan, registry, signals };
  const assignmentPlan = buildAssignmentPlan(assignmentInput);

  const beatsSorted = sortedAscending(beatStartTimesMs);
  // 粒度切替時刻 = 先頭を除く各セグメント開始時刻（隣接セグメントの境界＝粒度が切り替わる瞬間）。
  const switchTimesMs = assignmentPlan.segments.slice(1).map((segment) => segment.startTimeMs);
  const fireTimesMs = expandFireTimesMs(assignmentPlan, beatsSorted);

  const anchors: MusicalAnchors = {
    beatsMs: beatStartTimesMs,
    structureBoundariesMs: buildStructureBoundariesMs(songmap),
    loudnessPeaksMs: extractLoudnessPeaksMs(
      songmap.amplitudeCurve,
      songmap.amplitudeStep,
      songmap.maxVocalAmplitude
    ),
    vocalOnsetsMs: buildVocalOnsetsMs(songmap),
  };

  const sourceIssues: string[] = [
    ...findLyricsTimelineIssues(lyricsTimeline).map((issue) => `歌詞タイムライン ${issue.path}: ${issue.message}`),
    ...findGranularityPlanIssues(granularityPlan, granularityInput).map(
      (issue) => `表示粒度プラン ${issue.path}: ${issue.message}`
    ),
    ...findAssignmentPlanIssues(assignmentPlan, assignmentInput).map(
      (issue) => `演出割付プラン ${issue.path}: ${issue.message}`
    ),
  ];

  return {
    record: { switchTimesMs, fireTimesMs },
    anchors,
    songEndMs: songmap.song.duration,
    sourceIssues,
  };
}

// ---- 既定の記録源に対するゲートの合成（系統2の出所固有検査を系統1の判定へ反映する） ----

/** 既定の記録源の判定結果に、出所固有の整合検査の不整合を加えたもの。 */
export interface DisplaySyncDiagnostic extends DisplaySyncVerdict {
  readonly sourceIssues: readonly string[];
}

/**
 * 判定結果に、記録源の出所固有の整合検査の不整合を反映する純粋関数。不整合が空でなければ合否を不成立にする。
 * 採用理由: 出所固有の整合検査（歌詞タイムライン・表示粒度プラン・演出割付プランの構造的な整合）の不整合は、
 * 記録の生成が破綻していることを示す明らかな不正であり、創作的タイミングの選択とは無関係である。よって合否を不成立にしてよい。
 * 判定本体 evaluateDisplaySync は記録源非依存に保ち、この合成だけが出所固有の不整合を扱う。
 */
export function applySourceIssues(
  verdict: DisplaySyncVerdict,
  sourceIssues: readonly string[]
): DisplaySyncDiagnostic {
  if (sourceIssues.length === 0) {
    return { ...verdict, sourceIssues };
  }
  return {
    ...verdict,
    acceptable: false,
    reasons: [
      ...verdict.reasons,
      `既定記録源の整合検査に${sourceIssues.length}件の不整合があります（記録の生成が破綻しています）`,
    ],
    sourceIssues,
  };
}

/**
 * 生 songmap から既定の記録源で表示同期ゲートを実行し、出所固有の不整合を反映した合否を返す。
 * 現状の記録源はこの既定アダプタであり、#33 の上書きが実装された後は最終構成の記録源に対する同種の合成へ差し替える。
 */
export function runDefaultDisplaySyncGate(
  songmap: SongmapLike,
  thresholds: DisplaySyncThresholds = DEFAULT_THRESHOLDS
): DisplaySyncDiagnostic {
  const input = buildDefaultDisplaySyncInput(songmap);
  const verdict = evaluateDisplaySync(input.record, input.anchors, input.songEndMs, thresholds);
  return applySourceIssues(verdict, input.sourceIssues);
}
