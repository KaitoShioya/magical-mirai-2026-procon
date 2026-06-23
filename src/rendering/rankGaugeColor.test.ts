import { describe, expect, it } from "vitest";
import {
  fillFractionFromPercentile,
  oklchToSrgb,
  rankGaugeColorAt,
  rankGaugeOklchAt,
  RANK_GAUGE_ANCHOR_T,
  RANK_GAUGE_OKLCH,
  type Oklch,
} from "./rankGaugeColor";

// 許容誤差 0.01 の理由: 浮動小数の丸めと行列演算誤差を吸収しつつ、色のずれを検出できる十分小さい値。
const CHANNEL_TOLERANCE = 0.01;

/** OKLCH を OKLab（l,a,b）へ展開する（知覚的滑らかさを OKLab 空間で測るため）。 */
function oklchToOklab(color: Oklch): { l: number; a: number; b: number } {
  const hRad = (color.h * Math.PI) / 180;
  return { l: color.l, a: color.c * Math.cos(hRad), b: color.c * Math.sin(hRad) };
}

/** OKLab 空間の距離 ΔE = √(ΔL²+Δa²+Δb²)。 */
function oklabDistance(p: { l: number; a: number; b: number }, q: { l: number; a: number; b: number }): number {
  const dl = p.l - q.l;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

describe("oklchToSrgb", () => {
  it("明度0は黒、明度1（彩度0）は白", () => {
    const black = oklchToSrgb({ l: 0, c: 0, h: 0 });
    expect(black[0]).toBeCloseTo(0, 2);
    expect(black[1]).toBeCloseTo(0, 2);
    expect(black[2]).toBeCloseTo(0, 2);

    const white = oklchToSrgb({ l: 1, c: 0, h: 0 });
    expect(white[0]).toBeCloseTo(1, 2);
    expect(white[1]).toBeCloseTo(1, 2);
    expect(white[2]).toBeCloseTo(1, 2);
  });

  it("彩度0の灰色は明度の増加で各チャンネルが単調に増加する", () => {
    const dark = oklchToSrgb({ l: 0.2, c: 0, h: 0 })[0];
    const mid = oklchToSrgb({ l: 0.5, c: 0, h: 0 })[0];
    const light = oklchToSrgb({ l: 0.8, c: 0, h: 0 })[0];
    expect(mid).toBeGreaterThan(dark);
    expect(light).toBeGreaterThan(mid);
  });

  it("色域外の高彩度色も各チャンネルが [0,1] に収まる（最終段の丸め）", () => {
    // 彩度を極端に大きくして色域を超えさせる。丸めが効いていれば全チャンネルが [0,1]。
    const color = oklchToSrgb({ l: 0.6, c: 0.4, h: 30 });
    for (const channel of color) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

describe("rankGaugeColorAt", () => {
  it("各帯中心 t でその段階のアンカー色に一致する", () => {
    for (let i = 0; i < RANK_GAUGE_OKLCH.length; i += 1) {
      const expected = oklchToSrgb(RANK_GAUGE_OKLCH[i]);
      const actual = rankGaugeColorAt(RANK_GAUGE_ANCHOR_T[i]);
      expect(actual[0]).toBeCloseTo(expected[0], 6);
      expect(actual[1]).toBeCloseTo(expected[1], 6);
      expect(actual[2]).toBeCloseTo(expected[2], 6);
    }
  });

  it("両端の外側は端のアンカー色で一定", () => {
    const lowest = oklchToSrgb(RANK_GAUGE_OKLCH[0]);
    const highest = oklchToSrgb(RANK_GAUGE_OKLCH[RANK_GAUGE_OKLCH.length - 1]);
    for (const t of [0, 0.05, RANK_GAUGE_ANCHOR_T[0]]) {
      const c = rankGaugeColorAt(t);
      expect(c[0]).toBeCloseTo(lowest[0], CHANNEL_TOLERANCE);
    }
    for (const t of [RANK_GAUGE_ANCHOR_T[RANK_GAUGE_ANCHOR_T.length - 1], 0.95, 1]) {
      const c = rankGaugeColorAt(t);
      expect(c[0]).toBeCloseTo(highest[0], CHANNEL_TOLERANCE);
    }
  });

  it("非有限の t は最下位（t=0扱い）の色を返す", () => {
    const lowest = oklchToSrgb(RANK_GAUGE_OKLCH[0]);
    const c = rankGaugeColorAt(Number.NaN);
    expect(c[0]).toBeCloseTo(lowest[0], CHANNEL_TOLERANCE);
  });

  // 知覚的滑らかさ。標本間隔 t=0.005（百分位0.5刻み、201標本）、隣接＝連続2標本と定める。
  it("隣接段差が滑らか（相対8倍以下かつ絶対0.02以下）", () => {
    const step = 0.005;
    const deltas: number[] = [];
    let previous = oklchToOklab(rankGaugeOklchAt(0));
    for (let t = step; t <= 1 + 1e-9; t += step) {
      const current = oklchToOklab(rankGaugeOklchAt(Math.min(t, 1)));
      deltas.push(oklabDistance(previous, current));
      previous = current;
    }
    const maxDelta = Math.max(...deltas);
    const meanDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;

    // 条件1（不連続が無い）: 最大が平均の8倍以下。比のためアンカー値や刻み幅に依らず意味が保たれる。
    expect(maxDelta).toBeLessThanOrEqual(meanDelta * 8);
    // 条件2（刻みに対し細かい）: 最大が 0.02 以下。0.005 刻みで最速区間でも概ね 0.009 で下回る。
    expect(maxDelta).toBeLessThanOrEqual(0.02);
  });
});

describe("fillFractionFromPercentile", () => {
  it("百分位を [0,1] の満ち量へ線形換算し、範囲外と非有限を丸める", () => {
    expect(fillFractionFromPercentile(0)).toBe(0);
    expect(fillFractionFromPercentile(50)).toBe(0.5);
    expect(fillFractionFromPercentile(100)).toBe(1);
    expect(fillFractionFromPercentile(-10)).toBe(0);
    expect(fillFractionFromPercentile(120)).toBe(1);
    expect(fillFractionFromPercentile(Number.NaN)).toBe(0);
  });
});
