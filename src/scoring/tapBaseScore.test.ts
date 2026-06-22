import { describe, expect, it } from "vitest";
import { tapBaseScore, TAP_SCORE_WEIGHTS } from "./tapBaseScore";

describe("tapBaseScore 素点 a（§3.4）", () => {
  it("両JUST（両精度1.0）で最大1.0を返す", () => {
    expect(tapBaseScore({ timingAccuracy: 1, pitchAccuracy: 1 })).toBe(1);
  });
  it("両精度0で0を返す", () => {
    expect(tapBaseScore({ timingAccuracy: 0, pitchAccuracy: 0 })).toBe(0);
  });
  it("タイミングのみ満点で0.5、音程のみ満点で0.5を返す（等重み）", () => {
    expect(tapBaseScore({ timingAccuracy: 1, pitchAccuracy: 0 })).toBe(0.5);
    expect(tapBaseScore({ timingAccuracy: 0, pitchAccuracy: 1 })).toBe(0.5);
  });
  it("加重和を厳密に返す（0.6,0.2 で 0.4）", () => {
    expect(tapBaseScore({ timingAccuracy: 0.6, pitchAccuracy: 0.2 })).toBeCloseTo(0.4, 10);
  });
  it("床（音程0）より音程外し（音程0.2）の方が高い", () => {
    const floor = tapBaseScore({ timingAccuracy: 0.5, pitchAccuracy: 0 });
    const miss = tapBaseScore({ timingAccuracy: 0.5, pitchAccuracy: 0.2 });
    expect(miss).toBeGreaterThan(floor);
  });
  it("非有限の精度は0へ倒し例外を投げない", () => {
    expect(tapBaseScore({ timingAccuracy: Number.NaN, pitchAccuracy: 0.5 })).toBe(0.25);
    expect(tapBaseScore({ timingAccuracy: Number.POSITIVE_INFINITY, pitchAccuracy: 0 })).toBe(0);
  });
  it("重みを差し替えても両JUSTで最大（和が1.0なら1.0）", () => {
    expect(tapBaseScore({ timingAccuracy: 1, pitchAccuracy: 1 }, { timing: 0.7, pitch: 0.3 })).toBeCloseTo(1, 10);
  });
  it("既定の重みは等重み（0.5/0.5）", () => {
    expect(TAP_SCORE_WEIGHTS).toEqual({ timing: 0.5, pitch: 0.5 });
  });
});
