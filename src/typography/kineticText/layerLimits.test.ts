import { describe, it, expect } from "vitest";
import {
  computeMaxConcurrent,
  computeSingleLayerLimit,
  computeBatchedLayerLimit,
  maxStartsInWindow,
} from "./layerLimits";

describe("computeMaxConcurrent（開始時刻列と表示残存時間からの最大同時数）", () => {
  it("文字が無いとき0", () => {
    expect(computeMaxConcurrent([], 1000)).toBe(0);
  });

  it("残存内に重なる2文字で2、重ならない配置で1", () => {
    // 残存150ミリ秒。開始0と100は [0,150) と [100,250) が重なり最大2。
    expect(computeMaxConcurrent([0, 100], 150)).toBe(2);
    // 開始0と150は [0,150) と [150,300)。境界では終了を開始より先に数えるため重ならず1。
    expect(computeMaxConcurrent([0, 150], 150)).toBe(1);
  });

  it("3文字の滑り重なりで最大2", () => {
    // [0,150) [100,250) [200,350): 同時に存在する最大は2。
    expect(computeMaxConcurrent([0, 100, 200], 150)).toBe(2);
  });

  it("残存を長くすると同時数が増える", () => {
    // 開始0,100,200 を残存300で見ると [0,300)[100,400)[200,500) が t=200付近で3重なる。
    expect(computeMaxConcurrent([0, 100, 200], 300)).toBe(3);
  });
});

describe("computeSingleLayerLimit（最大同時数に余裕を加える）", () => {
  it("最大同時数24に3割の余裕を切り上げて32", () => {
    // 採用理由: 表示残存の調整と窓端の重なりを吸収するため3割（0.3）増しとし、端数は切り上げる。
    expect(computeSingleLayerLimit(24, 0.3)).toBe(32);
  });

  it("余裕0なら同数", () => {
    expect(computeSingleLayerLimit(10, 0)).toBe(10);
  });
});

describe("computeBatchedLayerLimit（最長フレーズ文字数に増殖枠を加える）", () => {
  it("最長フレーズ33に増殖枠15で48", () => {
    expect(computeBatchedLayerLimit(33, 15)).toBe(48);
  });
});

describe("maxStartsInWindow（スライド窓に入る開始時刻の最大本数）", () => {
  it("文字が無いとき0", () => {
    expect(maxStartsInWindow([], 1000)).toBe(0);
  });

  it("窓幅で本数が変わる", () => {
    // 開始0,100,200。窓150では右端200のとき開始0(200-150=50以下)が外れ{100,200}で2。
    expect(maxStartsInWindow([0, 100, 200], 150)).toBe(2);
    // 窓250では右端200のとき開始0(200-250=-50以下でない)が残り{0,100,200}で3。
    expect(maxStartsInWindow([0, 100, 200], 250)).toBe(3);
  });
});
