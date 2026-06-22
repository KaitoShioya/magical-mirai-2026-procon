import { describe, expect, it } from "vitest";
import { isComboHit, nextComboRun, comboPoint, DEFAULT_COMBO_CONFIG, COMBO_SHARE_MAX } from "./combo";

describe("isComboHit 継続条件（両JUST）", () => {
  it("両JUSTで真", () => {
    expect(isComboHit({ timingJust: true, pitchJust: true })).toBe(true);
  });
  it("片JUST・両偽で偽", () => {
    expect(isComboHit({ timingJust: true, pitchJust: false })).toBe(false);
    expect(isComboHit({ timingJust: false, pitchJust: true })).toBe(false);
    expect(isComboHit({ timingJust: false, pitchJust: false })).toBe(false);
  });
});

describe("nextComboRun 連続走長", () => {
  it("継続タップで+1", () => {
    expect(nextComboRun(3, { timingJust: true, pitchJust: true })).toBe(4);
  });
  it("非継続タップで0へ戻る（途切れ）", () => {
    expect(nextComboRun(3, { timingJust: true, pitchJust: false })).toBe(0);
  });
  it("非有限・負の現在走長は0起点", () => {
    expect(nextComboRun(Number.NaN, { timingJust: true, pitchJust: true })).toBe(1);
    expect(nextComboRun(-5, { timingJust: true, pitchJust: true })).toBe(1);
  });
});

describe("comboPoint 加点（飽和線形）", () => {
  it("単発（run=1）で0", () => {
    expect(comboPoint(1)).toBe(0);
  });
  it("run=2で1段（step）", () => {
    expect(comboPoint(2)).toBeCloseTo(DEFAULT_COMBO_CONFIG.step, 10);
  });
  it("run=11で上限（step×maxSteps）", () => {
    expect(comboPoint(11)).toBeCloseTo(DEFAULT_COMBO_CONFIG.step * DEFAULT_COMBO_CONFIG.maxSteps, 10);
  });
  it("run=50でも上限で頭打ち", () => {
    expect(comboPoint(50)).toBeCloseTo(DEFAULT_COMBO_CONFIG.step * DEFAULT_COMBO_CONFIG.maxSteps, 10);
  });
  it("非有限・0以下のrunは0", () => {
    expect(comboPoint(Number.NaN)).toBe(0);
    expect(comboPoint(0)).toBe(0);
  });
});

describe("COMBO_SHARE_MAX 上限割合", () => {
  it("0.10（Issue #55 技術要件）", () => {
    expect(COMBO_SHARE_MAX).toBe(0.1);
  });
});
