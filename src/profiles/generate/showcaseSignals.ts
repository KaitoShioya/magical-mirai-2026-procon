// 見せ場マップ生成の手順1（合成ボルテージ曲線の作成）。純粋関数のみで、入力配列を破壊しない。
// 声量と歌詞密度を同じ1秒格子へ揃え、平滑化・正規化して等重みで合成する。
// 出典 docs/decisions/app-overall-decisions.md §3.6（声量と歌詞密度の解析で抽出）。

import type { CompositeCurve, ShowcaseInput, ShowcaseOptions } from "./types";

/**
 * 格子のビン数を求める。
 * 採用理由を先に述べる。ビン i は時間範囲 [i×gridMs, (i+1)×gridMs) を覆い、曲全体を切れ目なく覆うには
 * 曲長を刻みで割って切り上げた数が要る。曲長0以下や非有限は曲として成立しないため0ビンとする。
 */
export function binCount(durationMs: number, gridMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(gridMs) || gridMs <= 0) {
    return 0;
  }
  return Math.ceil(durationMs / gridMs);
}

/**
 * ビン i の代表時刻（ビン中心）を求める。
 * 採用理由を先に述べる。1つのビンが覆う時間幅の代表として中心を採ると、左端や右端への片寄りが無く、
 * 見せ場の除外判定（手順3-1）と代表時刻（手順3-2）の基準を一つに統一できる。
 */
export function binCenterMs(index: number, gridMs: number): number {
  return index * gridMs + gridMs / 2;
}

/**
 * 声量サンプル列を格子へ再標本化する（ビンごとの平均）。
 * 採用理由を先に述べる。1秒ビンは複数の声量サンプルを含み、平均はその1秒間の持続的な声量を表す。
 * 最大値を採ると単発の突出に引きずられ、後段の平滑化（一過性除去）と矛盾するため平均を採る。
 * 負値（−1）の無音センチネルは0へ丸めるが、無音は実在する時間で盛り上がりが無いことを意味するので、
 * 0として分母にも数え、その区間の声量を正しく引き下げる。分母を理論個数でなく実際に入ったサンプル数に
 * するのは、曲末の半端なビンで実在しないサンプルを0と数えて値が不当に下がるのを避けるためである。
 * サンプルが1つも無いビン（曲長を超えた範囲など）は分子も分母も0なので0とする。
 */
export function resampleAmplitudeToGrid(
  amplitudeCurve: number[],
  amplitudeStepMs: number,
  gridMs: number,
  bins: number
): number[] {
  const sum = new Array<number>(bins).fill(0);
  const count = new Array<number>(bins).fill(0);
  for (let j = 0; j < amplitudeCurve.length; j++) {
    const timeMs = j * amplitudeStepMs;
    const bin = Math.floor(timeMs / gridMs);
    if (bin < 0 || bin >= bins) continue;
    const raw = amplitudeCurve[j];
    const value = raw < 0 ? 0 : raw;
    sum[bin] += value;
    count[bin] += 1;
  }
  const out = new Array<number>(bins).fill(0);
  for (let i = 0; i < bins; i++) {
    out[i] = count[i] > 0 ? sum[i] / count[i] : 0;
  }
  return out;
}

/**
 * 歌詞密度を格子へ算出する（ビンごとの文字開始数）。
 * 採用理由を先に述べる。歌詞密度は単位時間あたりの文字数として自然に数えられ、声量と同じ格子に揃える
 * ことで2信号を同じ点で足せる。各文字の開始時刻が入るビンを1つ数える。
 */
export function lyricDensityPerBin(lyricCharOnsetsMs: number[], gridMs: number, bins: number): number[] {
  const out = new Array<number>(bins).fill(0);
  for (const onsetMs of lyricCharOnsetsMs) {
    const bin = Math.floor(onsetMs / gridMs);
    if (bin < 0 || bin >= bins) continue;
    out[bin] += 1;
  }
  return out;
}

/**
 * 中心移動平均で平滑化する（片側 halfBins ビン）。
 * 採用理由を先に述べる。見せ場は数十秒の区間であり、1〜2秒の一過性の突出は見せ場ではない。区間より
 * 十分短い窓で平均すれば区間どうしをぼかさずに突出だけを除去できる。曲の端のビンは窓が片側に欠けるため、
 * 固定の除数でなく実際に寄与したビン数で割る（端の値が不当に下がるのを避ける）。
 */
export function smooth(values: number[], halfBins: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = i - halfBins; k <= i + halfBins; k++) {
      if (k < 0 || k >= n) continue;
      sum += values[k];
      count += 1;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

/**
 * 自身の最大値で[0,1]へ正規化する。
 * 採用理由を先に述べる。声量（振幅で数万規模）と歌詞密度（毎秒の文字数で0〜十数規模）は単位が異なるため、
 * 各々を自身の最大値で割って[0,1]へ揃え、同等の影響度で足せるようにする。最大値が0以下（全0など）のときは
 * 除算が壊れるため全0を返す。正規化は平滑化の後に行うので、単発の突出は均され最大値は持続水準を表す。
 * よって百分位での頑健化は不要で、最大値で割れば十分である。
 */
export function normalizeByMax(values: number[]): number[] {
  let max = 0;
  for (const v of values) {
    if (v > max) max = v;
  }
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => v / max);
}

/**
 * 正規化済み声量と歌詞密度を重み付きで合成する。
 * 採用理由を先に述べる。§3.6 は声量と歌詞密度を並列に挙げ優先度を定めていないため、既定では等配分する。
 */
export function combineComposite(
  normalizedAmplitude: number[],
  normalizedDensity: number[],
  amplitudeWeight: number,
  densityWeight: number
): number[] {
  const n = Math.min(normalizedAmplitude.length, normalizedDensity.length);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    out[i] = amplitudeWeight * normalizedAmplitude[i] + densityWeight * normalizedDensity[i];
  }
  return out;
}

/**
 * 入力から合成ボルテージ曲線を作る（手順1の統括）。
 * 声量を格子へ平均再標本化し、歌詞密度を数え、各々を平滑化・正規化して等重みで合成する。
 */
export function buildCompositeCurve(input: ShowcaseInput, options: ShowcaseOptions): CompositeCurve {
  const bins = binCount(input.durationMs, options.gridMs);
  const amplitude = resampleAmplitudeToGrid(input.amplitudeCurve, input.amplitudeStepMs, options.gridMs, bins);
  const density = lyricDensityPerBin(input.lyricCharOnsetsMs, options.gridMs, bins);
  const amplitudeNormalized = normalizeByMax(smooth(amplitude, options.smoothHalfBins));
  const densityNormalized = normalizeByMax(smooth(density, options.smoothHalfBins));
  const values = combineComposite(
    amplitudeNormalized,
    densityNormalized,
    options.amplitudeWeight,
    options.densityWeight
  );
  return { values, gridMs: options.gridMs };
}
