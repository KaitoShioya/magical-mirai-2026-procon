import { describe, expect, it } from "vitest";
import { simplePercentile, PERCENTILE_ESTIMATE_DISCLAIMER } from "./percentile";

const BOUNDS = { min: 0, max: 1000 };

describe("simplePercentile 簡易百分位（一様分布の線形写像、research/04 §3）", () => {
  it("Smin で0、Smax で100", () => {
    expect(simplePercentile(0, BOUNDS)).toBe(0);
    expect(simplePercentile(1000, BOUNDS)).toBe(100);
  });
  it("中点で50、4分の1点で25", () => {
    expect(simplePercentile(500, BOUNDS)).toBe(50);
    expect(simplePercentile(250, BOUNDS)).toBe(25);
  });
  it("Smin未満・Smax超はクランプ", () => {
    expect(simplePercentile(-100, BOUNDS)).toBe(0);
    expect(simplePercentile(2000, BOUNDS)).toBe(100);
  });
  it("非ゼロSminの写像（min=100,max=500 で score=300 → 50）", () => {
    expect(simplePercentile(300, { min: 100, max: 500 })).toBe(50);
  });
  it("非有限スコアは0、縮退（max<=min）は0", () => {
    expect(simplePercentile(Number.NaN, BOUNDS)).toBe(0);
    expect(simplePercentile(50, { min: 100, max: 100 })).toBe(0);
  });
  it("理論端が非有限なら0（非数の伝播を防ぐ）", () => {
    expect(simplePercentile(50, { min: 0, max: Number.POSITIVE_INFINITY })).toBe(0);
    expect(simplePercentile(50, { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY })).toBe(0);
    expect(simplePercentile(50, { min: 0, max: Number.NaN })).toBe(0);
  });
});

describe("注意文言", () => {
  it("実ランキングでない旨を含む", () => {
    expect(PERCENTILE_ESTIMATE_DISCLAIMER).toContain("実");
  });
});
