import { describe, expect, it } from "vitest";
import {
  computeArtifactDimensions,
  flipRowsRgba,
  ARTIFACT_LONG_EDGE,
} from "./captureEncode";

describe("computeArtifactDimensions 出力解像度の算出", () => {
  it("正方形のビューポートは1200×1200にする", () => {
    expect(computeArtifactDimensions(800, 800)).toEqual({ width: 1200, height: 1200 });
  });
  it("横長のビューポートは長辺1200・短辺を縦横比で割る", () => {
    // 縦横比1.25（制限上限）→ 1200×960
    expect(computeArtifactDimensions(1250, 1000)).toEqual({ width: 1200, height: 960 });
  });
  it("縦長のビューポートは高さ1200・幅を縦横比で掛ける", () => {
    // 縦横比0.8（制限下限）→ 960×1200
    expect(computeArtifactDimensions(800, 1000)).toEqual({ width: 960, height: 1200 });
  });
  it("極端な横長は縦横比1.25へ制限する", () => {
    // 縦横比2.0 → 制限後1.25 → 1200×960
    expect(computeArtifactDimensions(2000, 1000)).toEqual({ width: 1200, height: 960 });
  });
  it("極端な縦長は縦横比0.8へ制限する", () => {
    // 縦横比0.5 → 制限後0.8 → 960×1200
    expect(computeArtifactDimensions(500, 1000)).toEqual({ width: 960, height: 1200 });
  });
  it("不正な寸法は正方形にする", () => {
    expect(computeArtifactDimensions(0, 1000)).toEqual({
      width: ARTIFACT_LONG_EDGE,
      height: ARTIFACT_LONG_EDGE,
    });
    expect(computeArtifactDimensions(Number.NaN, 1000)).toEqual({
      width: ARTIFACT_LONG_EDGE,
      height: ARTIFACT_LONG_EDGE,
    });
  });
  it("長辺は常に1200を超えない", () => {
    const result = computeArtifactDimensions(3000, 1000);
    expect(Math.max(result.width, result.height)).toBe(1200);
  });
});

describe("flipRowsRgba 行の上下反転", () => {
  it("2×2の画素で上下の行が入れ替わる", () => {
    // 2×2、各画素4バイト。下から上の並びを上から下へ反転する。
    // 行0（下）= 画素A,B、行1（上）= 画素C,D
    const buffer = new Uint8Array([
      1, 1, 1, 255, 2, 2, 2, 255, // 行0
      3, 3, 3, 255, 4, 4, 4, 255, // 行1
    ]);
    const flipped = flipRowsRgba(buffer, 2, 2);
    // 反転後の行0は元の行1（3,4）、反転後の行1は元の行0（1,2）。
    expect(Array.from(flipped)).toEqual([
      3, 3, 3, 255, 4, 4, 4, 255,
      1, 1, 1, 255, 2, 2, 2, 255,
    ]);
  });
  it("出力の長さは width×height×4 と一致する", () => {
    const buffer = new Uint8Array(3 * 2 * 4);
    expect(flipRowsRgba(buffer, 3, 2).length).toBe(3 * 2 * 4);
  });
});
