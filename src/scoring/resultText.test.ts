import { describe, expect, it } from "vitest";
import {
  formatResultScore,
  formatResultRank,
  formatResultPercentile,
  formatResultText,
} from "./resultText";

describe("formatResultScore 得点の整形", () => {
  it("小数は四捨五入して整数の文字列にする", () => {
    expect(formatResultScore(12345)).toBe("12345");
    expect(formatResultScore(12345.4)).toBe("12345");
    expect(formatResultScore(12345.6)).toBe("12346");
    expect(formatResultScore(0)).toBe("0");
  });
  it("非有限は「—」にする", () => {
    expect(formatResultScore(Number.NaN)).toBe("—");
    expect(formatResultScore(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatResultRank ランクの整形", () => {
  it("妥当なランクはそのまま返す", () => {
    expect(formatResultRank("C")).toBe("C");
    expect(formatResultRank("B")).toBe("B");
    expect(formatResultRank("A")).toBe("A");
    expect(formatResultRank("S")).toBe("S");
  });
  it("妥当でない値は「—」にする", () => {
    expect(formatResultRank("D")).toBe("—");
    expect(formatResultRank("")).toBe("—");
  });
});

describe("formatResultPercentile 百分位の整形", () => {
  it("百分位を上位の割合へ変換する（補数）", () => {
    expect(formatResultPercentile(88)).toBe("上位 12%");
    expect(formatResultPercentile(0)).toBe("上位 100%");
    expect(formatResultPercentile(100)).toBe("上位 0%");
  });
  it("範囲外は0以上100以下へ丸める", () => {
    expect(formatResultPercentile(-5)).toBe("上位 100%");
    expect(formatResultPercentile(150)).toBe("上位 0%");
  });
  it("非有限は「—」にする", () => {
    expect(formatResultPercentile(Number.NaN)).toBe("—");
  });
});

describe("formatResultText まとめ整形", () => {
  it("得点・ランク・百分位を一度に整形する", () => {
    expect(
      formatResultText({ totalScore: 12345.6, rank: "S", percentile: 88 })
    ).toEqual({ scoreText: "12346", rankText: "S", percentileText: "上位 12%" });
  });
});
