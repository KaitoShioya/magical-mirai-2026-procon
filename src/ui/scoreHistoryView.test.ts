import { describe, it, expect } from "vitest";
import { markBestBars, formatPercentile } from "./scoreHistoryView";
import type { PlayRecord } from "../scoring/scoreHistoryStore";

function rec(totalScore: number, recordedAtMs: number): PlayRecord {
  return { totalScore, percentile: 50, rank: "B", recordedAtMs };
}

describe("markBestBars", () => {
  it("自己ベストと総合得点かつ記録時刻が一致する棒だけを強調する", () => {
    const recent = [rec(100, 1000), rec(300, 2000), rec(200, 3000)];
    const best = rec(300, 2000);
    expect(markBestBars(recent, best)).toEqual([false, true, false]);
  });

  it("同点かつ同時刻の記録が複数あっても最初の1本だけを強調する", () => {
    const recent = [rec(300, 2000), rec(300, 2000), rec(300, 2000)];
    const best = rec(300, 2000);
    const flags = markBestBars(recent, best);
    expect(flags).toEqual([true, false, false]);
    expect(flags.filter((value) => value).length).toBe(1);
  });

  it("総合得点が同じでも記録時刻が違えば強調しない", () => {
    const recent = [rec(300, 1000), rec(300, 3000)];
    const best = rec(300, 2000);
    expect(markBestBars(recent, best)).toEqual([false, false]);
  });

  it("自己ベストが直近履歴に無いときは全て強調しない", () => {
    const recent = [rec(10, 1000), rec(20, 2000)];
    const best = rec(9999, 500);
    expect(markBestBars(recent, best)).toEqual([false, false]);
  });
});

describe("formatPercentile", () => {
  it("百分位を上位の割合へ変換する", () => {
    expect(formatPercentile(40)).toBe("上位 60%");
    expect(formatPercentile(100)).toBe("上位 0%");
    expect(formatPercentile(0)).toBe("上位 100%");
  });

  it("範囲外の百分位を0以上100以下へ丸める", () => {
    expect(formatPercentile(150)).toBe("上位 0%");
    expect(formatPercentile(-20)).toBe("上位 100%");
  });

  it("非有限の百分位は数値を出さずダッシュを返す", () => {
    expect(formatPercentile(Number.NaN)).toBe("—");
    expect(formatPercentile(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
