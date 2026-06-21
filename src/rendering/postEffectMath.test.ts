import { describe, it, expect } from "vitest";
import {
  normalizedVignetteDistance,
  smoothstep,
  vignetteFactor,
  chromaShiftMagnitude,
} from "./postEffectMath";
import {
  POST_VIGNETTE_BASE_STRENGTH,
  POST_VIGNETTE_INNER,
  POST_VIGNETTE_OUTER,
  POST_CHROMA_MAX_OFFSET,
} from "./constants";

describe("normalizedVignetteDistance", () => {
  it("中心は0", () => {
    expect(normalizedVignetteDistance(0.5, 0.5, 16 / 9)).toBeCloseTo(0, 9);
    expect(normalizedVignetteDistance(0.5, 0.5, 9 / 16)).toBeCloseTo(0, 9);
  });

  it("四隅は1（横長・縦長いずれの縦横比でも）", () => {
    // 四隅は (0,0)・(1,0)・(0,1)・(1,1)。縦横比に依らず1に正規化される。
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      for (const [x, y] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        expect(normalizedVignetteDistance(x, y, aspect)).toBeCloseTo(1, 9);
      }
    }
  });

  it("中心から四隅へ向かうほど距離が増える（単調性）", () => {
    const aspect = 16 / 9;
    const d1 = normalizedVignetteDistance(0.6, 0.6, aspect);
    const d2 = normalizedVignetteDistance(0.8, 0.8, aspect);
    expect(d2).toBeGreaterThan(d1);
  });
});

describe("smoothstep", () => {
  it("下端以下で0・上端以上で1・中央で0.5", () => {
    expect(smoothstep(0.3, 0.8, 0.2)).toBe(0);
    expect(smoothstep(0.3, 0.8, 0.9)).toBe(1);
    expect(smoothstep(0.3, 0.8, 0.55)).toBeCloseTo(0.5, 9);
  });

  it("下端と上端が等しいときは段関数になる", () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.5)).toBe(1);
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(1);
  });
});

describe("vignetteFactor", () => {
  const { INNER, OUTER, STRENGTH } = {
    INNER: POST_VIGNETTE_INNER,
    OUTER: POST_VIGNETTE_OUTER,
    STRENGTH: POST_VIGNETTE_BASE_STRENGTH,
  };

  it("内側の半径まで（中心保護領域）は減光しない（係数1）", () => {
    expect(vignetteFactor(0, INNER, OUTER, STRENGTH)).toBeCloseTo(1, 9);
    expect(vignetteFactor(INNER, INNER, OUTER, STRENGTH)).toBeCloseTo(1, 9);
  });

  it("外側の半径以遠は最大減光（係数 1-strength）", () => {
    expect(vignetteFactor(OUTER, INNER, OUTER, STRENGTH)).toBeCloseTo(1 - STRENGTH, 9);
    expect(vignetteFactor(1, INNER, OUTER, STRENGTH)).toBeCloseTo(1 - STRENGTH, 9);
  });

  it("内側から外側へ向かうほど暗くなる（係数が単調減少）", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let dist = INNER; dist <= OUTER; dist += 0.05) {
      const factor = vignetteFactor(dist, INNER, OUTER, STRENGTH);
      expect(factor).toBeLessThanOrEqual(previous + 1e-9);
      previous = factor;
    }
  });
});

describe("chromaShiftMagnitude", () => {
  it("中心（距離0）はずれ0", () => {
    expect(chromaShiftMagnitude(0, POST_CHROMA_MAX_OFFSET, 1)).toBe(0);
  });

  it("バースト強度0はずれ0", () => {
    expect(chromaShiftMagnitude(1, POST_CHROMA_MAX_OFFSET, 0)).toBe(0);
  });

  it("四隅（距離1）・バースト強度1で最大ずれ", () => {
    expect(chromaShiftMagnitude(1, POST_CHROMA_MAX_OFFSET, 1)).toBeCloseTo(
      POST_CHROMA_MAX_OFFSET,
      9
    );
  });

  it("距離に比例する", () => {
    const half = chromaShiftMagnitude(0.5, POST_CHROMA_MAX_OFFSET, 1);
    const full = chromaShiftMagnitude(1.0, POST_CHROMA_MAX_OFFSET, 1);
    expect(full).toBeCloseTo(half * 2, 9);
  });
});
