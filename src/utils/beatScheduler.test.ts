import { describe, it, expect } from "vitest";
import { firstBeatIndexAfter } from "./beatScheduler";

describe("firstBeatIndexAfter", () => {
  it("指定時刻より厳密に後の最初の拍の添字を返す", () => {
    const beats = [100, 200, 300, 400];
    // 200 ちょうどは「後」に含めない（厳密に後）。次は 300（添字2）。
    expect(firstBeatIndexAfter(beats, 200)).toBe(2);
    // 250 の直後は 300（添字2）。
    expect(firstBeatIndexAfter(beats, 250)).toBe(2);
  });

  it("全ての拍より前の時刻では先頭の添字0を返す", () => {
    expect(firstBeatIndexAfter([100, 200, 300], 50)).toBe(0);
    // 先頭ちょうどより小さい境界。
    expect(firstBeatIndexAfter([100, 200, 300], 99)).toBe(0);
  });

  it("全ての拍以上の時刻では長さ（末尾の次）を返す", () => {
    expect(firstBeatIndexAfter([100, 200, 300], 300)).toBe(3);
    expect(firstBeatIndexAfter([100, 200, 300], 9999)).toBe(3);
  });

  it("空配列では常に0を返す", () => {
    expect(firstBeatIndexAfter([], 0)).toBe(0);
    expect(firstBeatIndexAfter([], 1000)).toBe(0);
  });

  it("同時刻の拍が連続しても、その時刻より後の最初の添字を返す", () => {
    // 200 が2つ。200 ちょうどより後の最初は添字3（300）。
    expect(firstBeatIndexAfter([100, 200, 200, 300], 200)).toBe(3);
    // 150 の直後は最初の 200（添字1）。
    expect(firstBeatIndexAfter([100, 200, 200, 300], 150)).toBe(1);
  });
});
