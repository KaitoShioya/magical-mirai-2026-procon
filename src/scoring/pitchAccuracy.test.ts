import { describe, expect, it } from "vitest";
import { isPitchJust, PITCH_MISS_FLOOR, pitchAccuracy } from "./pitchAccuracy";

describe("pitchAccuracy 完全一致のみ満点", () => {
  it("完全一致は1.0", () => {
    expect(pitchAccuracy(0, 0)).toBe(1);
    expect(pitchAccuracy(3, 3)).toBe(1);
  });

  it("不一致は距離に依らず床値", () => {
    expect(pitchAccuracy(2, 3)).toBe(PITCH_MISS_FLOOR);
    expect(pitchAccuracy(0, 6)).toBe(PITCH_MISS_FLOOR);
    expect(pitchAccuracy(6, 0)).toBe(PITCH_MISS_FLOOR);
  });

  it("非有限・非整数は床値へ丸める", () => {
    expect(pitchAccuracy(Number.NaN, 3)).toBe(PITCH_MISS_FLOOR);
    expect(pitchAccuracy(2.5, 3)).toBe(PITCH_MISS_FLOOR);
    expect(pitchAccuracy(3, Number.POSITIVE_INFINITY)).toBe(PITCH_MISS_FLOOR);
  });
});

describe("isPitchJust", () => {
  it("整数で等しいときだけ真", () => {
    expect(isPitchJust(4, 4)).toBe(true);
    expect(isPitchJust(4, 5)).toBe(false);
    expect(isPitchJust(Number.NaN, Number.NaN)).toBe(false);
    expect(isPitchJust(2.5, 2.5)).toBe(false);
  });
});
