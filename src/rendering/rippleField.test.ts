import { describe, expect, it } from "vitest";
import { createRippleField, MAX_RIPPLES, RIPPLE_LIFETIME_MS } from "./rippleField";

describe("createRippleField の寿命と容量", () => {
  it("生成直後は波紋0、立てると増え、寿命を過ぎると消える", () => {
    const field = createRippleField({ renderOrder: 0 });
    expect(field.activeCount()).toBe(0);
    field.spawn(0, 0);
    expect(field.activeCount()).toBe(1);
    // 寿命ちょうどで消える。
    field.update(RIPPLE_LIFETIME_MS / 1000);
    expect(field.activeCount()).toBe(0);
    field.dispose();
  });

  it("同時上限を超えて立てても活動数は上限で頭打ち（最も古いものを置き換える）", () => {
    const field = createRippleField({ renderOrder: 0 });
    for (let i = 0; i < MAX_RIPPLES + 3; i += 1) {
      field.spawn(i * 0.1, 0);
    }
    expect(field.activeCount()).toBe(MAX_RIPPLES);
    field.dispose();
  });
});

describe("波の高さと重ね合わせ（干渉）", () => {
  it("波紋が無いとき高さは0", () => {
    const field = createRippleField({ renderOrder: 0 });
    expect(field.sampleHeight(0.5, 0.0)).toBe(0);
    field.dispose();
  });

  it("同じ着水点に2つ立てた高さは、1つの高さの2倍（重ね合わせ）", () => {
    const single = createRippleField({ renderOrder: 0 });
    single.spawn(0, 0);
    const h1 = single.sampleHeight(0.5, 0.0);

    const doubled = createRippleField({ renderOrder: 0 });
    doubled.spawn(0, 0);
    doubled.spawn(0, 0);
    const h2 = doubled.sampleHeight(0.5, 0.0);

    expect(h2).toBeCloseTo(2 * h1, 10);
    single.dispose();
    doubled.dispose();
  });
});

describe("落下ノーツへの影響の有界性", () => {
  it("位置のずれは小さく抑えられ、明るさの増分は0以上で有限", () => {
    const field = createRippleField({ renderOrder: 0 });
    // 波面が点の近くを通る時刻まで進めつつ、各時刻で影響が暴れないことを確かめる。
    for (let i = 0; i < MAX_RIPPLES; i += 1) {
      field.spawn(i * 0.05, 0);
    }
    for (let step = 0; step < 40; step += 1) {
      field.update(0.05);
      const influence = field.sampleNoteInfluence(0.3, -0.2);
      expect(Number.isFinite(influence.offsetX)).toBe(true);
      expect(Number.isFinite(influence.offsetY)).toBe(true);
      // ずれはレーン幅のごく一部に収まる（追跡を妨げない）緩い上限内。
      expect(Math.abs(influence.offsetX)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(influence.offsetY)).toBeLessThanOrEqual(0.05);
      expect(influence.brightnessPulse).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(influence.brightnessPulse)).toBe(true);
    }
    field.dispose();
  });
});

describe("dispose の冪等性", () => {
  it("二度呼んでも例外を投げない", () => {
    const field = createRippleField({ renderOrder: 0 });
    field.dispose();
    expect(() => field.dispose()).not.toThrow();
  });
});
