import { describe, it, expect } from "vitest";
import { deriveDiversityZones } from "./diversityZones";
import type { ChorusSegment } from "./types";

const takeoverChorus: ChorusSegment[] = [
  { startMs: 1114.6, endMs: 23314.6 },
  { startMs: 88800.20000000001, endMs: 111000.20000000001 },
  { startMs: 165674.59999999998, endMs: 187874.59999999998 },
];

describe("deriveDiversityZones", () => {
  it("3区間: 役割が主題・変奏・回帰の順、境界が startMs/endMs から写像される", () => {
    const zones = deriveDiversityZones(takeoverChorus);
    expect(zones.map((z) => z.role)).toEqual(["theme", "variation", "reprise"]);
    expect(zones[0].startTimeMs).toBe(1114.6);
    expect(zones[1].endTimeMs).toBe(111000.20000000001);
    expect(zones[2].startTimeMs).toBe(165674.59999999998);
  });

  it("ラベル未指定: 汎用ラベルを自動生成する", () => {
    const zones = deriveDiversityZones(takeoverChorus);
    expect(zones.map((z) => z.label)).toEqual([
      "第1反復区間（主題）",
      "第2反復区間（変奏）",
      "第3反復区間（回帰）",
    ]);
  });

  it("ラベル上書き: 指定索引は上書き、未指定（undefined）と空文字は汎用ラベル", () => {
    const zones = deriveDiversityZones(takeoverChorus, [
      "第1サビ Clap to the Beat（主題）",
      undefined,
      "",
    ]);
    expect(zones[0].label).toBe("第1サビ Clap to the Beat（主題）");
    expect(zones[1].label).toBe("第2反復区間（変奏）");
    expect(zones[2].label).toBe("第3反復区間（回帰）");
  });

  it("2区間: 主題と回帰（変奏なし）", () => {
    const zones = deriveDiversityZones([
      { startMs: 1000, endMs: 2000 },
      { startMs: 3000, endMs: 4000 },
    ]);
    expect(zones.map((z) => z.role)).toEqual(["theme", "reprise"]);
  });

  it("1区間: 主題のみ", () => {
    const zones = deriveDiversityZones([{ startMs: 1000, endMs: 2000 }]);
    expect(zones.map((z) => z.role)).toEqual(["theme"]);
  });

  it("0区間: 空配列", () => {
    expect(deriveDiversityZones([])).toEqual([]);
  });

  it("入力が時刻順でない: 昇順に整列してから役割を割り当てる", () => {
    const zones = deriveDiversityZones([
      { startMs: 3000, endMs: 4000 },
      { startMs: 1000, endMs: 2000 },
      { startMs: 5000, endMs: 6000 },
    ]);
    expect(zones.map((z) => z.startTimeMs)).toEqual([1000, 3000, 5000]);
    expect(zones.map((z) => z.role)).toEqual(["theme", "variation", "reprise"]);
  });

  it("ラベル数が区間数を超過: 例外を投げる", () => {
    expect(() => deriveDiversityZones([{ startMs: 1000, endMs: 2000 }], ["a", "b"])).toThrow();
  });
});
