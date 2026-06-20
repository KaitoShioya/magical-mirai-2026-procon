// 見せ場マップ生成の手順5（重みの付与）。純粋関数のみ。
// climax を1.0に固定し、それ以外の見せ場を窓内平均の合成値で相対順位づけして[0.4,0.9]へ写す。
// 出典 docs/decisions/app-overall-decisions.md §3.6・§3.7（投下倍率 = 消費ゲージ割合 × 見せ場の重み）。
// ビン幾何のヘルパー binCenterMs は最下層の showcaseSignals から取り込む（非循環依存）。

import { binCenterMs } from "./showcaseSignals";
import type { CompositeCurve, ShowcaseOptions, ShowcaseWindow, TimeRange } from "./types";

/**
 * 窓内の平滑化済み合成値の平均を求める（見せ場の代表合成値）。
 * 採用理由を先に述べる。重みは見せ場区間の全体的な盛り上がりを表すべきで、区間内の一瞬の最高値ではない。
 * chorus 窓（約22秒）と非chorus窓（約11秒）で長さが違うため、窓内平均にすると長短によらず持続的な強さで
 * 比べられる。中心が窓[start, end)に入るビンを平均する。窓が短くどのビン中心も入らないときは、窓の中央に
 * 最も近いビンの値を採る（合成値が一つも無い空曲線では0）。
 */
export function windowMeanComposite(curve: CompositeCurve, window: TimeRange): number {
  const { values, gridMs } = curve;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const center = binCenterMs(i, gridMs);
    if (center >= window.startMs && center < window.endMs) {
      sum += values[i];
      count += 1;
    }
  }
  if (count > 0) return sum / count;
  if (values.length === 0) return 0;
  const mid = (window.startMs + window.endMs) / 2;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const d = Math.abs(binCenterMs(i, gridMs) - mid);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return values[bestIndex];
}

/**
 * 見せ場ごとの重みを与える。
 * 採用理由を先に述べる。§3.6 は climax が最大重みを持つことを要求するので、climax を climaxWeight（1.0）に固定し、
 * 他を上限0.9で頭打ちにすればデータに関わらず climax が厳密に最大になる。投下倍率は重みに比例するため、重みが
 * ほぼ0だとその見せ場で投下する価値が消えて意味と矛盾する。よって非climaxは下限0.4とし、代表合成値を非climaxの
 * 最小〜最大から[0.4, 0.9]へ線形写像する。これは「全見せ場の絶対的な強さ」ではなく「climax を除いた残りの中での
 * 相対順位」を写すものである（最も強い盛り上がりは climax として1.0に固定されるため、非climaxの最大値0.9は曲全体の
 * 最高合成値とは一致しない）。非climaxの代表値の最大と最小の差が compositeEqualEpsilon 以下のときは同値とみなし、
 * 線形写像のゼロ除算を避けて全員を値域の中点0.65に割り当てる（退化入力でのみ起き、実楽曲では各重みは異なる）。
 */
export function assignWeights(
  windows: ShowcaseWindow[],
  curve: CompositeCurve,
  options: ShowcaseOptions
): number[] {
  const reps = windows.map((w) => windowMeanComposite(curve, w));
  const nonClimaxReps = reps.filter((_, i) => !windows[i].isClimax);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const r of nonClimaxReps) {
    if (r < min) min = r;
    if (r > max) max = r;
  }
  const floor = options.nonClimaxWeightFloor;
  const ceil = options.nonClimaxWeightCeil;
  const midpoint = (floor + ceil) / 2;
  const degenerate = nonClimaxReps.length === 0 || max - min <= options.compositeEqualEpsilon;
  return windows.map((w, i) => {
    if (w.isClimax) return options.climaxWeight;
    if (degenerate) return midpoint;
    return ((reps[i] - min) / (max - min)) * (ceil - floor) + floor;
  });
}
