// グリッチ横ずれ計算の検証。決定性・強度0で恒等・範囲・シーク再現性を表明する。

import { describe, it, expect } from "vitest";
import { sliceIndexAt, glitchOffsetAt, GLITCH_MAX_OFFSET, GLITCH_SLICE_COUNT } from "./glitchMath";

describe("グリッチ 縞の量子化", () => {
  it("縦位置を縞番号へ量子化し、0以上スライス数未満に収める", () => {
    expect(sliceIndexAt(0, GLITCH_SLICE_COUNT)).toBe(0);
    expect(sliceIndexAt(1, GLITCH_SLICE_COUNT)).toBe(GLITCH_SLICE_COUNT - 1);
    expect(sliceIndexAt(0.5, 10)).toBe(5);
    // 範囲外も収める。
    expect(sliceIndexAt(-1, 10)).toBe(0);
    expect(sliceIndexAt(2, 10)).toBe(9);
  });

  it("シェーダ（postEffectShader.ts）の縞番号の式と一致する（最上端 y=1 を含む）", () => {
    // 採用理由を先に述べる。シェーダの sliceIndex は min(floor(clamp(vUv.y,0,1) * SLICE_COUNT), SLICE_COUNT-1)
    // で、最上端 vUv.y=1 のとき floor が範囲外の SLICE_COUNT を出すのを最終縞へ収める。Node 上で同式を再現し、
    // sliceIndexAt が画素ごとに同じ縞番号を出すことを掃引で確認する（最上端1行でも JS と GLSL が一致する）。
    const glsl = (y: number, sliceCount: number): number => {
      const clamped = y < 0 ? 0 : y > 1 ? 1 : y;
      return Math.min(Math.floor(clamped * sliceCount), sliceCount - 1);
    };
    for (const y of [0, 0.0001, 0.25, 0.5, 0.75, 0.999, 1, -0.5, 1.5]) {
      expect(sliceIndexAt(y, GLITCH_SLICE_COUNT)).toBe(glsl(y, GLITCH_SLICE_COUNT));
    }
  });
});

describe("グリッチ 横ずれの決定性と範囲", () => {
  it("強度0では必ずずれ0", () => {
    for (let s = 0; s < GLITCH_SLICE_COUNT; s += 1) {
      expect(glitchOffsetAt(s, 1.23, 0)).toBe(0);
    }
  });

  it("同じ（縞・時刻・強度）なら同じ値（決定的）", () => {
    expect(glitchOffsetAt(3, 2.5, 0.7)).toBe(glitchOffsetAt(3, 2.5, 0.7));
  });

  it("横ずれは強度と最大量で抑えられた範囲に収まる", () => {
    for (let s = 0; s < GLITCH_SLICE_COUNT; s += 1) {
      for (const t of [0, 0.37, 1.5, 9.9]) {
        const offset = glitchOffsetAt(s, t, 1);
        expect(Math.abs(offset)).toBeLessThanOrEqual(GLITCH_MAX_OFFSET + 1e-9);
      }
    }
  });

  it("強度に比例して横ずれが小さくなる", () => {
    const full = Math.abs(glitchOffsetAt(5, 1.0, 1));
    const half = Math.abs(glitchOffsetAt(5, 1.0, 0.5));
    expect(half).toBeCloseTo(full * 0.5, 9);
  });
});

describe("グリッチ シーク再現性", () => {
  it("同じ時刻へ戻ると同じ横ずれになる（後戻りで再現）", () => {
    const at2 = glitchOffsetAt(7, 2.0, 0.8);
    // 別時刻を挟んでから同じ時刻を再評価しても、時刻と種だけで決まるため一致する。
    glitchOffsetAt(7, 5.0, 0.8);
    expect(glitchOffsetAt(7, 2.0, 0.8)).toBe(at2);
  });
});
