import { describe, expect, it } from "vitest";
import { theoreticalScoreBounds, type ScoreBoundsInput } from "./scoreBounds";

// 基準入力: TAKEOVER のタップ総数上限260、a最大1.0、D最大1.0、M最大2.0、combo上限0.10。
const BASE: ScoreBoundsInput = {
  tapBudget: 260,
  maxTapScore: 1,
  maxDiversity: 1,
  maxMultiplier: 2,
  comboShareCap: 0.1,
};

describe("theoreticalScoreBounds 理論端", () => {
  it("Smax = baseMax/(1-p)（260×1×1×2 /0.9）", () => {
    expect(theoreticalScoreBounds(BASE).max).toBeCloseTo((260 * 2) / 0.9, 6);
  });
  it("Smin は常に0（§3.4 タップしないことは減点しない）", () => {
    expect(theoreticalScoreBounds(BASE).min).toBe(0);
    expect(theoreticalScoreBounds({ tapBudget: 100 }).min).toBe(0);
  });
  it("combo上限0なら Smax=baseMax（520）", () => {
    expect(theoreticalScoreBounds({ ...BASE, comboShareCap: 0 }).max).toBeCloseTo(520, 6);
  });
  it("tapBudget に線形（130 で baseMax=260、Smax=260/0.9）", () => {
    expect(theoreticalScoreBounds({ ...BASE, tapBudget: 130 }).max).toBeCloseTo(260 / 0.9, 6);
  });
  it("maxTapScore 既定は重みの和（指定省略で1.0、Smax=260×2/0.9）", () => {
    expect(theoreticalScoreBounds({ tapBudget: 260 }).max).toBeCloseTo((260 * 2) / 0.9, 6);
  });
  it("縮退入力でも有限かつ min<=max（comboShareCap=1 や tapBudget=∞ で例外を投げない）", () => {
    const a = theoreticalScoreBounds({ ...BASE, comboShareCap: 1 });
    expect(Number.isFinite(a.max)).toBe(true);
    expect(a.min).toBeLessThanOrEqual(a.max);
    const b = theoreticalScoreBounds({ ...BASE, tapBudget: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(b.max)).toBe(true);
    expect(b.min).toBeLessThanOrEqual(b.max);
  });
});
