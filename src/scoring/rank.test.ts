import { describe, expect, it } from "vitest";
import { rankFromPercentile, rankFromScore, rankOrdinal, RANKS_ASCENDING } from "./rank";

describe("rankFromPercentile 帯分け（25/50/75、左閉右開）", () => {
  it("下端0でC、上端100でS", () => {
    expect(rankFromPercentile(0)).toBe("C");
    expect(rankFromPercentile(100)).toBe("S");
  });
  it("帯境界（25でB、50でA、75でS、境界直下は下の帯）", () => {
    expect(rankFromPercentile(24.999)).toBe("C");
    expect(rankFromPercentile(25)).toBe("B");
    expect(rankFromPercentile(49.999)).toBe("B");
    expect(rankFromPercentile(50)).toBe("A");
    expect(rankFromPercentile(74.999)).toBe("A");
    expect(rankFromPercentile(75)).toBe("S");
  });
  it("範囲外・非有限は端へ（負→C、100超→S、NaN→C）", () => {
    expect(rankFromPercentile(-5)).toBe("C");
    expect(rankFromPercentile(150)).toBe("S");
    expect(rankFromPercentile(Number.NaN)).toBe("C");
  });
});

describe("rankFromScore 統合", () => {
  const bounds = { min: 0, max: 1000 };
  it("Smin→C、Smax→S、中点→A", () => {
    expect(rankFromScore(0, bounds)).toBe("C");
    expect(rankFromScore(1000, bounds)).toBe("S");
    expect(rankFromScore(500, bounds)).toBe("A"); // 百分位50→A
  });
});

describe("順序情報", () => {
  it("RANKS_ASCENDING は低い順", () => {
    expect(RANKS_ASCENDING).toEqual(["C", "B", "A", "S"]);
  });
  it("序数は C<B<A<S", () => {
    expect(rankOrdinal("C")).toBeLessThan(rankOrdinal("B"));
    expect(rankOrdinal("B")).toBeLessThan(rankOrdinal("A"));
    expect(rankOrdinal("A")).toBeLessThan(rankOrdinal("S"));
  });
});
