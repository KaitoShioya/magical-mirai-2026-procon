// 品質検査ハーネスの純粋関数（指標算出）の単体テスト。
// 対象モジュール metrics.mjs を直接読み込み、ブラウザ起動部品には到達しない。
import { describe, expect, test } from "vitest";
import {
  evaluateRunAcceptance,
  isSoftwareRenderer,
  percentileNearestRank,
  summarizeFps,
} from "./metrics.mjs";

describe("percentileNearestRank（最近接順位法）", () => {
  // 順位 = 天井(パーセンタイル/100 × 標本数)、最小1・最大は標本数でクランプ。
  test("5パーセンタイルは順位1（最小値）を返す", () => {
    expect(percentileNearestRank([10, 20, 30, 40, 50], 5)).toBe(10);
  });

  test("50パーセンタイルは順位3を返す", () => {
    expect(percentileNearestRank([10, 20, 30, 40, 50], 50)).toBe(30);
  });

  test("100パーセンタイルは最大値を返す", () => {
    expect(percentileNearestRank([10, 20, 30, 40, 50], 100)).toBe(50);
  });

  test("未整列の入力でも整列して判定する", () => {
    expect(percentileNearestRank([50, 10, 30, 20, 40], 50)).toBe(30);
  });

  test("0パーセンタイルは順位を最小1へクランプして最小値を返す", () => {
    expect(percentileNearestRank([10, 20, 30, 40, 50], 0)).toBe(10);
  });

  test("24区間では5パーセンタイルが順位2（2番目に小さい値）を指す", () => {
    // 計測時間既定12秒（500ミリ秒区間で24区間）の検算。天井(0.05×24)=2。
    const samples = Array.from({ length: 24 }, (_, i) => i + 1); // 1..24
    expect(percentileNearestRank(samples, 5)).toBe(2);
  });

  test("空標本は非数を返す", () => {
    expect(Number.isNaN(percentileNearestRank([], 5))).toBe(true);
  });
});

describe("summarizeFps（標本要約）", () => {
  test("標本から件数・平均・最小・最大・下位5・中央を求める", () => {
    expect(summarizeFps([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      avg: 30,
      min: 10,
      max: 50,
      p5: 10,
      p50: 30,
    });
  });

  test("空標本はすべて0で返す（レポートはJSONのため非数を避ける）", () => {
    expect(summarizeFps([])).toEqual({
      count: 0,
      avg: 0,
      min: 0,
      max: 0,
      p5: 0,
      p50: 0,
    });
  });
});

describe("isSoftwareRenderer（ソフトウェア描画判定）", () => {
  test("ハードウェアGPU名は偽", () => {
    expect(isSoftwareRenderer("ANGLE (NVIDIA GeForce RTX 3060 Direct3D11)")).toBe(false);
  });

  test("SwiftShader は真", () => {
    expect(isSoftwareRenderer("ANGLE (Google, SwiftShader Device)")).toBe(true);
  });

  test("llvmpipe は真", () => {
    expect(isSoftwareRenderer("Mesa llvmpipe (LLVM 15.0.0)")).toBe(true);
  });

  test("Software Rasterizer は真", () => {
    expect(isSoftwareRenderer("Software Rasterizer")).toBe(true);
  });

  test("Microsoft Basic Render Driver は真", () => {
    expect(
      isSoftwareRenderer("ANGLE (Microsoft Basic Render Driver Direct3D11)")
    ).toBe(true);
  });

  test("WARP は真", () => {
    expect(isSoftwareRenderer("ANGLE (Microsoft, WARP Direct3D11)")).toBe(true);
  });

  test("空文字列は真（描画系統が確認できない＝合格させない）", () => {
    expect(isSoftwareRenderer("")).toBe(true);
  });

  test("null は真", () => {
    expect(isSoftwareRenderer(null)).toBe(true);
  });

  test("undefined は真", () => {
    expect(isSoftwareRenderer(undefined)).toBe(true);
  });
});

describe("evaluateRunAcceptance（ローカル計測1件の合否判定）", () => {
  // 既定の合格条件: 描画系統が信頼でき、平均フックが公開され、毎秒フレーム数の標本が1件以上あり、
  // ページの未捕捉例外が無い。
  const base = {
    trusted: true,
    rendererInfoAvailable: true,
    avgFps: 60,
    sampleCount: 24,
    pageErrorCount: 0,
    allowUnknownRenderer: false,
  };

  test("信頼でき平均フックがあり標本があり未捕捉例外が無ければ合格", () => {
    const result = evaluateRunAcceptance(base);
    expect(result.acceptable).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("平均フックが公開されていない（avgFpsが負）なら不合格", () => {
    const result = evaluateRunAcceptance({ ...base, avgFps: -1 });
    expect(result.acceptable).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test("ソフトウェア描画（信頼不可・描画系統名は取得済み）は不合格", () => {
    const result = evaluateRunAcceptance({
      ...base,
      trusted: false,
      rendererInfoAvailable: true,
    });
    expect(result.acceptable).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test("描画系統名が取得できず調査ノブも無ければ不合格", () => {
    const result = evaluateRunAcceptance({
      ...base,
      trusted: false,
      rendererInfoAvailable: false,
      allowUnknownRenderer: false,
    });
    expect(result.acceptable).toBe(false);
  });

  test("描画系統名が取得できなくても調査ノブがあれば信頼不可を許容する", () => {
    const result = evaluateRunAcceptance({
      ...base,
      trusted: false,
      rendererInfoAvailable: false,
      allowUnknownRenderer: true,
    });
    expect(result.acceptable).toBe(true);
  });

  test("ソフトウェア描画は調査ノブがあっても不合格（描画系統名は取得済みのため）", () => {
    const result = evaluateRunAcceptance({
      ...base,
      trusted: false,
      rendererInfoAvailable: true,
      allowUnknownRenderer: true,
    });
    expect(result.acceptable).toBe(false);
  });

  test("標本が0件なら不合格（計測フックが公開されていないか描画ループが回っていない）", () => {
    const result = evaluateRunAcceptance({ ...base, sampleCount: 0 });
    expect(result.acceptable).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test("調査ノブで信頼不可を許容しても標本0件なら不合格", () => {
    const result = evaluateRunAcceptance({
      ...base,
      trusted: false,
      rendererInfoAvailable: false,
      allowUnknownRenderer: true,
      sampleCount: 0,
    });
    expect(result.acceptable).toBe(false);
  });

  test("ページの未捕捉例外があれば不合格", () => {
    const result = evaluateRunAcceptance({ ...base, pageErrorCount: 1 });
    expect(result.acceptable).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test("複数の不合格理由は重複して並ぶ", () => {
    const result = evaluateRunAcceptance({
      ...base,
      trusted: false,
      rendererInfoAvailable: true,
      avgFps: -1,
      sampleCount: 0,
      pageErrorCount: 2,
    });
    expect(result.acceptable).toBe(false);
    // 描画系統・平均フック・標本0件・未捕捉例外の4つが独立して理由に並ぶ。
    expect(result.reasons.length).toBe(4);
  });
});
