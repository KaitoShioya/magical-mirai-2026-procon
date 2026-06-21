// 描画性能ゲート（Issue #97）の閾値判定 fps-metrics.mjs の単体テスト。vitest で実行する。
// 本番と同じ DEFAULT_FPS_THRESHOLDS を用いる（テスト専用閾値を置くと本番閾値での回帰を守れなくなるため）。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_FPS_THRESHOLDS, evaluateFpsAcceptance } from "./fps-metrics.mjs";

describe("evaluateFpsAcceptance（描画性能の閾値判定）", () => {
  test("平均と下位5パーセンタイルが両方とも目標以上なら目標達成かつ床非割れ", () => {
    const result = evaluateFpsAcceptance({ avgFps: 60.5, p5Fps: 60 });
    expect(result.targetMet).toBe(true);
    expect(result.floorBreached).toBe(false);
    expect(result.reasons.target).toEqual([]);
    expect(result.reasons.floor).toEqual([]);
    expect(result.cues).toEqual({
      avgMeetsTarget: true,
      p5MeetsTarget: true,
      p5AboveFloor: true,
    });
  });

  test("平均が目標未満だが下位5パーセンタイルが床以上なら目標未達かつ床非割れ", () => {
    const result = evaluateFpsAcceptance({ avgFps: 59.9, p5Fps: 60 });
    expect(result.targetMet).toBe(false);
    expect(result.floorBreached).toBe(false);
    expect(result.cues.avgMeetsTarget).toBe(false);
    expect(result.cues.p5MeetsTarget).toBe(true);
    expect(result.cues.p5AboveFloor).toBe(true);
    expect(result.reasons.target.length).toBe(1);
    expect(result.reasons.floor).toEqual([]);
  });

  test("下位5パーセンタイルが床未満なら床割れ（同時に目標も未達）", () => {
    const result = evaluateFpsAcceptance({ avgFps: 58, p5Fps: 54 });
    expect(result.floorBreached).toBe(true);
    expect(result.targetMet).toBe(false);
    expect(result.cues.p5AboveFloor).toBe(false);
    expect(result.cues.p5MeetsTarget).toBe(false);
    expect(result.reasons.floor.length).toBe(1);
  });

  test("下位5パーセンタイルが床の境界値ちょうど（55）なら床非割れ", () => {
    const result = evaluateFpsAcceptance({ avgFps: 56, p5Fps: 55 });
    expect(result.floorBreached).toBe(false);
    expect(result.cues.p5AboveFloor).toBe(true);
    // 55は目標60未満のため目標は未達。
    expect(result.targetMet).toBe(false);
    expect(result.cues.p5MeetsTarget).toBe(false);
  });

  test("平均と下位5パーセンタイルが目標の境界値ちょうど（60）なら目標達成", () => {
    const result = evaluateFpsAcceptance({ avgFps: 60, p5Fps: 60 });
    expect(result.targetMet).toBe(true);
    expect(result.floorBreached).toBe(false);
  });
});

describe("床値の出所一致（最低フレーム下限が Issue #18 の床定数に揃っていること）", () => {
  test("DEFAULT_FPS_THRESHOLDS.floorP5Fps が src/rendering/constants.ts の PERF_DOWNSHIFT_FPS と一致する", () => {
    // 採用理由を先に述べる。床値は constants.ts の PERF_DOWNSHIFT_FPS を単一の出所とするが、ハーネスは
    // src をモジュールとして取り込まない方針のため値を直接共有できない。よって constants.ts を文字列として
    // 読み、定数の値を取り出して一致を検査する。src 側の床値が変わったら本検査が失敗して不整合を知らせる。
    const here = dirname(fileURLToPath(import.meta.url));
    const constantsPath = join(here, "..", "..", "src", "rendering", "constants.ts");
    const source = readFileSync(constantsPath, "utf8");
    const match = source.match(/PERF_DOWNSHIFT_FPS\s*=\s*(\d+(?:\.\d+)?)/);
    expect(match).not.toBeNull();
    const downshiftFps = Number(match[1]);
    expect(DEFAULT_FPS_THRESHOLDS.floorP5Fps).toBe(downshiftFps);
  });
});
