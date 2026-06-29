// 譜面密度設計（Issue #43）。
// 楽曲解析データ（拍・サビ区間・歌詞文字の開始時刻・見せ場・クライマックス代表時刻）から、
// 曲全体を時間方向に切れ目なく覆う密度プランを決定論的に生成する純粋関数モジュール。
// 密度プランは中間データで曲プロファイルには保存しない。下流の Issue #38（オンセット間引き）と
// Issue #44（タップ総数上限）が消費する。設計根拠は docs/research/04-ux-and-chart-design.md 第4節と
// docs/research/07-feasibility-and-parameters.md 第2.1節・第2.6節。
//
// 状態の記号（既存スキーマの約束に合わせる）:
//   ☆確定 = 標準仕様と毎分拍数から一意に導かれる値。
//   ★暫定 = 実装後のプレイ検証で調整する値。

import type { Showcase, LyricDensityWindow } from "../schema/profileSchema";
import type { ChorusSegment } from "./types";

/** 密度の分類。サビ＝1拍1回、基本＝2拍1回、休符＝置かない、溜め＝見せ場直前の疎区間。 */
export type DensityClass = "chorus" | "base" | "rest" | "buildup";

/** 入力の拍。開始時刻でどの区間に属するかを判定する。 */
export interface DensityBeat {
  index: number;
  startMs: number;
  endMs: number;
}

/** 密度プラン生成の入力。すべて音楽地図由来の素のデータで受け取り、tools・TextAlive に依存しない。 */
export interface DensityInput {
  /** 曲長（ミリ秒）。 */
  durationMs: number;
  /** 拍列（開始時刻の昇順）。 */
  beats: DensityBeat[];
  /** サビ区間（音楽地図の isChorus 区間）。右半開で内側を判定する。 */
  chorusSegments: ChorusSegment[];
  /** 歌詞文字の開始時刻（ミリ秒）。休符判定の歌詞密度の素。 */
  lyricCharOnsetsMs: number[];
  /** 見せ場（Issue #41 の出力）。溜めの配置と選択強調信号に使う。 */
  showcases: Showcase[];
  /** クライマックス代表時刻（ミリ秒）。TAKEOVER は189000。選択強調信号の核中心に使う。 */
  climaxAnchorMs: number;
}

/** 密度プラン生成のオプション。すべて既定値を持ち、曲横展開時に上書きできる。 */
export interface DensityOptions {
  /** サビの目標密度（1拍あたり）。★暫定。docs/research/07 第2.6節（サビは1拍に1回）。 */
  chorusDensityPerBeat: number;
  /** 非サビ基本の目標密度（1拍あたり）。★暫定。docs/research/07 第2.6節（サビ以外は2拍に1回）。 */
  baseDensityPerBeat: number;
  /** 休符の目標密度（1拍あたり）。★暫定。docs/research/07 第2.6節（密度の谷は休符）。 */
  restDensityPerBeat: number;
  /** 溜めの目標密度（1拍あたり）。★暫定。基本の半分にして間引きの対比を作る。 */
  buildupDensityPerBeat: number;
  /** 歌詞密度の窓の長さ（ミリ秒）。★暫定。docs/research/07 第2.6節が毎10秒で谷を記述する。 */
  lyricWindowMs: number;
  /** 休符判定の閾値を、歌詞密度の中央値の何倍にするか。★暫定。中央値比で他曲へ可搬にする。 */
  restMedianRatio: number;
  /** 溜めの長さ（拍数。1小節＝4拍）。★暫定。 */
  buildupBeats: number;
  /** 溜めを作る最小拍数。★暫定。これ未満の非サビ拍しか取れない見せ場には溜めを作らない。 */
  minBuildupBeats: number;
  /** 選択強調信号のサンプル刻み（ミリ秒）。☆確定（声量・歌詞の格子に合わせる便宜値）。 */
  signalStepMs: number;
  /** 選択強調信号の三角核の半幅（ミリ秒）。★暫定。 */
  signalKernelHalfMs: number;
  /** クライマックス見せ場とサビの重なる区間の最小間隔（ミリ秒）。☆確定。16分音符＝60000÷175÷4≒86。 */
  climaxMinIntervalMs: number;
  /** その他の区間の最小間隔（ミリ秒）。☆確定。8分音符＝60000÷175÷2＝171。 */
  defaultMinIntervalMs: number;
  /** 片手1点の連打の最小間隔（ミリ秒）。☆確定。8分音符＝171。 */
  sameSlotMinIntervalMs: number;
  /**
   * 連続するサビ反復をサビ区間の開始で区切り、各反復を独立した密度区間に保つか。既定は真。
   * 役割と既定理由を先に述べる。下流のオンセット選別（onsetNotes.ts）が共有テンプレートを各サビ反復へ写して多様性逓減を
   * 成立させるには、サビの反復が同一拍数の独立区間である必要がある。連続するサビ反復を1区間へ統合すると拍数の異なる大区間に
   * なり前提が崩れるため、既定では区切る。一方、共有テンプレートを使わない曲（サビも非サビと同じ個別スコアで選別する曲、
   * buildProfile の chorusSharedTemplate が偽）はこの区切りが不要で、区切るとサビの密度区間が反復ごとに分かれて目標数の
   * 配分が変わる。そうした曲は偽にして、隣接サビ反復を非サビと同じ規則で1区間へ統合する。 */
  splitChorusRepetitions: boolean;
}

export const DEFAULT_DENSITY_OPTIONS: DensityOptions = {
  // サビ目標密度0.5（拍あたり）。0.75からさらに下げる理由を先に述べる。0.75（4拍に3回）は実機の目視確認で
  // サビ前半に密な連続区間が生じて難易度が高く単調と判断されたため（不満③・難易度）、基本と同じ0.5（2拍に1回）に
  // 揃えて物量と難易度を下げる。サビの個性は密度でなく反復間の音程番号の対比（基準G）と配置語彙で保つ。0.5は各小節の
  // 強拍（位置1）と中強拍（位置3）の均等配置に対応し、前方密集を解消する。countTargetNotes は0.25刻みのみ扱う。
  chorusDensityPerBeat: 0.5,
  baseDensityPerBeat: 0.5,
  restDensityPerBeat: 0,
  buildupDensityPerBeat: 0.25,
  lyricWindowMs: 10000,
  restMedianRatio: 0.2,
  buildupBeats: 4,
  minBuildupBeats: 2,
  signalStepMs: 1000,
  signalKernelHalfMs: 4000,
  climaxMinIntervalMs: 86,
  defaultMinIntervalMs: 171,
  sameSlotMinIntervalMs: 171,
  splitChorusRepetitions: true,
};

/** 密度区間。曲全体を切れ目なく覆う。 */
export interface DensityRegion {
  startMs: number;
  endMs: number;
  className: DensityClass;
  targetDensityPerBeat: number;
  minIntervalMs: number;
  sameSlotMinIntervalMs: number;
}

/** 区間に割り当てた拍。 */
export interface ClassifiedBeat {
  index: number;
  startMs: number;
  className: DensityClass;
  regionIndex: number;
}

/** 選択強調信号の1サンプル。 */
export interface SignalSample {
  timeMs: number;
  value: number;
}

/** 密度プラン。 */
export interface DensityPlan {
  regions: DensityRegion[];
  beats: ClassifiedBeat[];
  /** 分類ごとの目標密度（計数で参照する）。 */
  classDensities: Record<DensityClass, number>;
  lyricDensity: {
    windowMs: number;
    windows: LyricDensityWindow[];
    medianCharsPerSecond: number;
    restThresholdCharsPerSecond: number;
  };
  selectionSignal: {
    stepMs: number;
    samples: SignalSample[];
  };
}

/** 計数の戻り型。 */
export interface NoteCountSummary {
  /** 骨格ノーツ数（休符・溜めの削減前）。Issue #44 の fullPossible の入力。 */
  skeleton: number;
  /** 実効目標ノーツ数（休符・溜めの削減後）。 */
  effective: number;
  byClass: Record<DensityClass, number>;
  byRegion: {
    regionIndex: number;
    className: DensityClass;
    beatCount: number;
    targetNotes: number;
  }[];
}

/** 値の中央値。採用理由を先に述べる。谷の閾値を曲ごとの中央値比で表すため、全窓の中央値を使う。 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 拍の代表的な長さ（ミリ秒）。連続する拍開始の差の中央値とする。 */
function beatDurationMs(beats: DensityBeat[]): number {
  if (beats.length < 2) return beats.length === 1 ? beats[0]!.endMs - beats[0]!.startMs : 0;
  const gaps: number[] = [];
  for (let i = 1; i < beats.length; i++) gaps.push(beats[i]!.startMs - beats[i - 1]!.startMs);
  return median(gaps);
}

/**
 * 歌詞密度を窓ごとの文字毎秒として求める（本Issueで新設）。
 * 戻り型は既存スキーマの LyricDensityWindow に揃え、下流 Issue #46 が再利用できるようにする。
 * 窓は曲頭から窓幅刻みで曲長まで連続被覆し（検証器の連続被覆検査に合わせる）、末尾の半端な窓は
 * 実際の秒数で割って文字毎秒とする（固定の窓幅で割ると末尾の値が不当に下がるため）。
 */
export function lyricDensityWindows(
  lyricCharOnsetsMs: number[],
  durationMs: number,
  windowMs: number,
): LyricDensityWindow[] {
  const windows: LyricDensityWindow[] = [];
  for (let start = 0; start < durationMs; start += windowMs) {
    const end = Math.min(start + windowMs, durationMs);
    const seconds = (end - start) / 1000;
    let count = 0;
    for (const t of lyricCharOnsetsMs) {
      if (t >= start && t < end) count++;
    }
    windows.push({
      startTimeMs: start,
      endTimeMs: end,
      charsPerSecond: seconds > 0 ? count / seconds : 0,
    });
  }
  return windows;
}

interface Span {
  lo: number;
  hi: number;
}

function inAnySpan(t: number, spans: Span[]): boolean {
  return spans.some((s) => t >= s.lo && t < s.hi);
}

/** 密度プランを生成する。 */
export function generateDensityPlan(
  input: DensityInput,
  options: DensityOptions = DEFAULT_DENSITY_OPTIONS,
): DensityPlan {
  const { durationMs, beats, chorusSegments, showcases } = input;

  // 1. 歌詞密度と休符の窓。
  const windows = lyricDensityWindows(input.lyricCharOnsetsMs, durationMs, options.lyricWindowMs);
  const medianCps = median(windows.map((w) => w.charsPerSecond));
  const restThreshold = medianCps * options.restMedianRatio;
  const restWindows: Span[] = windows
    .filter((w) => w.charsPerSecond < restThreshold)
    .map((w) => ({ lo: w.startTimeMs, hi: w.endTimeMs }));

  // 2. 溜めの窓。各見せ場の開始時刻の直前1小節分を曲頭で切り詰める。
  const barMs = options.buildupBeats * beatDurationMs(beats);
  const buildupWindows: Span[] = showcases.map((s) => ({
    lo: Math.max(0, s.startTimeMs - barMs),
    hi: s.startTimeMs,
  }));

  const chorusSpans: Span[] = chorusSegments.map((c) => ({ lo: c.startMs, hi: c.endMs }));

  // クライマックス見せ場の窓。採用理由を先に述べる。最小間隔86ミリ秒は「クライマックス見せ場の窓とサビの
  // 重なり区間のみ」に限る規約のため、窓の縁を境界候補に入れて、各小区間が窓の内外のどちらかに必ず収まる
  // ようにする。窓の縁を境界にしないと、サビの一部だけが窓に重なる曲でサビ全体が86ミリ秒になりうる。
  const climax = showcases.find((s) => s.isClimax);
  const climaxWindow: Span | null = climax
    ? { lo: climax.startTimeMs, hi: climax.endTimeMs }
    : null;

  // 3. 境界候補（時刻）。サビ・休符窓・溜め窓・クライマックス窓の縁と、0・曲長。
  const boundarySet = new Set<number>([0, durationMs]);
  const edgeSpans: Span[] = [...chorusSpans, ...restWindows, ...buildupWindows];
  if (climaxWindow) edgeSpans.push(climaxWindow);
  for (const s of edgeSpans) {
    if (s.lo > 0 && s.lo < durationMs) boundarySet.add(s.lo);
    if (s.hi > 0 && s.hi < durationMs) boundarySet.add(s.hi);
  }
  const bounds = [...boundarySet].sort((a, b) => a - b);

  // 4. 小区間を優先順位（サビ＞休符＞溜め＞基本）で分類し、最小間隔を割り当てる。
  function classifyAt(t: number): DensityClass {
    if (inAnySpan(t, chorusSpans)) return "chorus";
    if (inAnySpan(t, restWindows)) return "rest";
    if (inAnySpan(t, buildupWindows)) return "buildup";
    return "base";
  }
  function minIntervalAt(className: DensityClass, t: number): number {
    // 86ミリ秒はクライマックス見せ場の窓とサビが重なる小区間に限る。窓の縁が境界のため、各小区間は窓の内外いずれか。
    if (className === "chorus" && climaxWindow && t >= climaxWindow.lo && t < climaxWindow.hi) {
      return options.climaxMinIntervalMs;
    }
    return options.defaultMinIntervalMs;
  }
  interface Tile {
    startMs: number;
    endMs: number;
    className: DensityClass;
    minIntervalMs: number;
  }
  const tiles: Tile[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const startMs = bounds[i]!;
    const endMs = bounds[i + 1]!;
    if (startMs >= endMs) continue;
    const mid = (startMs + endMs) / 2;
    const className = classifyAt(mid);
    tiles.push({ startMs, endMs, className, minIntervalMs: minIntervalAt(className, mid) });
  }

  // 5. 溜めの最小拍数の判定。溜めの連続した範囲に属する拍数が最小未満なら基本へ戻す。
  function beatsInSpan(lo: number, hi: number): number {
    let n = 0;
    for (const b of beats) if (b.startMs >= lo && b.startMs < hi) n++;
    return n;
  }
  for (let i = 0; i < tiles.length; ) {
    if (tiles[i]!.className !== "buildup") {
      i++;
      continue;
    }
    let j = i;
    while (j < tiles.length && tiles[j]!.className === "buildup") j++;
    const runStart = tiles[i]!.startMs;
    const runEnd = tiles[j - 1]!.endMs;
    if (beatsInSpan(runStart, runEnd) < options.minBuildupBeats) {
      for (let k = i; k < j; k++) tiles[k]!.className = "base";
    }
    i = j;
  }

  // 6. 連続する同一分類かつ同一最小間隔の小区間をまとめて区間にし、密度を割り当てる。
  const classDensities: Record<DensityClass, number> = {
    chorus: options.chorusDensityPerBeat,
    base: options.baseDensityPerBeat,
    rest: options.restDensityPerBeat,
    buildup: options.buildupDensityPerBeat,
  };
  // サビ区間の開始時刻の集合。連続するサビ区間（1つのサビ群が複数の反復区間に分かれて隣接して記録されたもの）を
  // 1つの大区間へ統合せず、各反復区間を独立した区間として保つために使う。理由を先に述べる。下流のオンセット選別
  // （onsetNotes.ts）はサビの反復が同一拍数であることを前提に共有テンプレートを各反復へ写して多様性逓減を成立させる。
  // 連続するサビ反復を統合すると拍数の異なる大区間になり前提が崩れるため、サビ区間の開始では統合を止める。
  // 境界集合（boundarySet）がサビ区間の縁を含みタイルがそこで分割されるため、サビ区間開始の時刻はタイル開始と厳密に一致する。
  // 共有テンプレートを使わない曲（splitChorusRepetitions が偽）はこの区切りを行わず、隣接サビ反復を非サビと同じ規則で統合する。
  const chorusStarts = new Set<number>(chorusSegments.map((c) => c.startMs));
  const merged: Tile[] = [];
  for (const tile of tiles) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.className === tile.className &&
      last.minIntervalMs === tile.minIntervalMs &&
      last.endMs === tile.startMs &&
      !(options.splitChorusRepetitions && tile.className === "chorus" && chorusStarts.has(tile.startMs))
    ) {
      last.endMs = tile.endMs;
    } else {
      merged.push({ ...tile });
    }
  }
  const regions: DensityRegion[] = merged.map((tile) => ({
    startMs: tile.startMs,
    endMs: tile.endMs,
    className: tile.className,
    targetDensityPerBeat: classDensities[tile.className],
    minIntervalMs: tile.minIntervalMs,
    sameSlotMinIntervalMs: options.sameSlotMinIntervalMs,
  }));

  // 7. 拍を区間へ割り当てる（許容差なしの厳密な右半開比較）。
  const classifiedBeats: ClassifiedBeat[] = beats.map((b) => {
    const regionIndex = regions.findIndex((r) => b.startMs >= r.startMs && b.startMs < r.endMs);
    const region = regions[regionIndex];
    return {
      index: b.index,
      startMs: b.startMs,
      className: region ? region.className : "base",
      regionIndex,
    };
  });

  // 8. 選択強調信号。見せ場の重みの三角核の最大。クライマックス代表時刻を明示サンプルに含める。
  const centers = showcases.map((s) => ({
    centerMs: s.isClimax ? input.climaxAnchorMs : (s.startTimeMs + s.endTimeMs) / 2,
    weight: s.weight,
  }));
  const sampleTimeSet = new Set<number>();
  for (let t = 0; t <= durationMs; t += options.signalStepMs) sampleTimeSet.add(t);
  for (const c of centers) sampleTimeSet.add(c.centerMs);
  const sampleTimes = [...sampleTimeSet].sort((a, b) => a - b);
  function kernel(t: number, centerMs: number): number {
    const d = Math.abs(t - centerMs);
    return Math.max(0, 1 - d / options.signalKernelHalfMs);
  }
  const samples: SignalSample[] = sampleTimes.map((t) => {
    let value = 0;
    for (const c of centers) value = Math.max(value, c.weight * kernel(t, c.centerMs));
    return { timeMs: t, value };
  });

  return {
    regions,
    beats: classifiedBeats,
    classDensities,
    lyricDensity: {
      windowMs: options.lyricWindowMs,
      windows,
      medianCharsPerSecond: medianCps,
      restThresholdCharsPerSecond: restThreshold,
    },
    selectionSignal: { stepMs: options.signalStepMs, samples },
  };
}

/**
 * 密度プランから目標ノーツ数を数える。引数は密度プランだけに限り、不整合な組を渡せないようにする。
 * 骨格は分類別の合計式（サビ密度・基本密度のみ）、実効は分類済み拍列の整数累積方式で数える。
 */
export function countTargetNotes(plan: DensityPlan): NoteCountSummary {
  const cd = plan.classDensities;

  // 骨格: サビ拍はサビ密度、それ以外（基本・休符・溜め）の拍は基本密度で数える。
  let skeleton = 0;
  for (const b of plan.beats) {
    skeleton += b.className === "chorus" ? cd.chorus : cd.base;
  }

  // 実効: 目標密度が0.25刻みであることを使い、4倍した整数（サビ4・基本2・溜め1・休符0）で累積する。
  // 浮動小数点の等値比較の誤差を避けて決定論を厳密にするため、整数で数える。
  const unitFor = (cls: DensityClass): number => Math.round(cd[cls] / 0.25);
  const byClass: Record<DensityClass, number> = { chorus: 0, base: 0, rest: 0, buildup: 0 };
  const regionNotes = new Map<number, number>();
  let acc = 0;
  let effective = 0;
  for (const b of plan.beats) {
    acc += unitFor(b.className);
    while (acc >= 4) {
      acc -= 4;
      effective++;
      byClass[b.className]++;
      regionNotes.set(b.regionIndex, (regionNotes.get(b.regionIndex) ?? 0) + 1);
    }
  }

  const beatCountByRegion = new Map<number, number>();
  for (const b of plan.beats) {
    beatCountByRegion.set(b.regionIndex, (beatCountByRegion.get(b.regionIndex) ?? 0) + 1);
  }
  const byRegion = plan.regions.map((r, regionIndex) => ({
    regionIndex,
    className: r.className,
    beatCount: beatCountByRegion.get(regionIndex) ?? 0,
    targetNotes: regionNotes.get(regionIndex) ?? 0,
  }));

  return { skeleton, effective, byClass, byRegion };
}
