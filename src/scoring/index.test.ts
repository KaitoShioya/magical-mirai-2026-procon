import { describe, expect, it } from "vitest";
import * as scoring from "./index";

describe("index 再輸出（Issue #55）", () => {
  it("#55 の公開要素を窓口から参照できる", () => {
    expect(typeof scoring.tapBaseScore).toBe("function");
    expect(typeof scoring.reduceScore).toBe("function");
    expect(typeof scoring.finalizeScore).toBe("function");
    expect(typeof scoring.summarizeScore).toBe("function");
    expect(typeof scoring.rankFromScore).toBe("function");
    expect(typeof scoring.theoreticalScoreBounds).toBe("function");
    expect(typeof scoring.simplePercentile).toBe("function");
    expect(scoring.COMBO_SHARE_MAX).toBe(0.1);
    expect(scoring.RANKS_ASCENDING).toEqual(["C", "B", "A", "S"]);
  });
  it("#66 の公開要素を窓口から参照できる", () => {
    expect(typeof scoring.percentileFromLevelCurve).toBe("function");
    expect(typeof scoring.topPercentFromPercentile).toBe("function");
    expect(Array.isArray(scoring.BUILTIN_LEVEL_CURVE)).toBe(true);
  });
});
