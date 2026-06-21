// 文字可読性ゲート（Issue #98）の純粋関数の単体テスト。
// 対象モジュール readability-metrics.mjs を直接読み込み、ブラウザ起動部品には到達しない。
import { describe, expect, test } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  evaluateReadabilityAcceptance,
  relativeDifference,
} from "./readability-metrics.mjs";

// すべての条件が成立する計測値を組み立てる。各テストはこれを複製して一部だけ崩す。
// 不利条件（距離10・縦視野角60度・画面縦480）でフロアが結ぶ寸法は実フォントサイズ約0.4330、
// その射影 emProjectedPixelHeight は18。字形「A」のインク対em比を約0.7と置くと、
// インクの世界座標高さ約0.303、その射影 projectedInkPixelHeight 約12.6、正常な描画では
// 画素で測ったインク縦画素 measuredInkHeightPx もこれに一致する。
function passingMeasurements(overrides = {}) {
  const backgrounds = (overrides.backgrounds ?? [
    { kind: "dark", fillBorderContrast: 9.9 },
    { kind: "bright", fillBorderContrast: 9.9 },
    { kind: "gradient", fillBorderContrast: 9.9 },
    { kind: "bloom", fillBorderContrast: 4.69 },
    { kind: "highfreq", fillBorderContrast: 9.9 },
  ]).map((b) => ({ ...b }));
  const minPixel = {
    measuredInkHeightPx: 12.6,
    inkWorldHeight: 0.303,
    emWorldHeight: 0.4330127,
    emPixelHeightEquivalent: 18.0,
    emProjectedPixelHeight: 18.0,
    projectedInkPixelHeight: 12.6,
    viewportPixelHeight: 480,
    flooredFontSize: 0.4330127,
    distance: 10,
    fovYDegrees: 60,
    visibleBoundsValid: true,
    ...(overrides.minPixel ?? {}),
  };
  return { backgrounds, minPixel };
}

describe("relativeDifference", () => {
  test("基準に対する絶対相対差を返す", () => {
    expect(relativeDifference(12.6, 12.6)).toBeCloseTo(0, 6);
    expect(relativeDifference(11.34, 12.6)).toBeCloseTo(0.1, 6);
    expect(relativeDifference(13.86, 12.6)).toBeCloseTo(0.1, 6);
  });
  test("基準が0以下または非有限なら非数", () => {
    expect(Number.isNaN(relativeDifference(1, 0))).toBe(true);
    expect(Number.isNaN(relativeDifference(1, Number.NaN))).toBe(true);
    expect(Number.isNaN(relativeDifference(Number.POSITIVE_INFINITY, 12.6))).toBe(true);
  });
});

describe("evaluateReadabilityAcceptance", () => {
  test("すべて成立すれば合格で理由は空、cuesは全真", () => {
    const result = evaluateReadabilityAcceptance(passingMeasurements());
    expect(result.acceptable).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.cues).toEqual({
      contrastOk: true,
      notDegenerate: true,
      lowerBoundOk: true,
      fidelityOk: true,
    });
  });

  test("どれかの背景がコントラスト下限未満なら不合格", () => {
    const m = passingMeasurements({
      backgrounds: [
        { kind: "dark", fillBorderContrast: 9.9 },
        { kind: "bright", fillBorderContrast: 9.9 },
        { kind: "gradient", fillBorderContrast: 9.9 },
        { kind: "bloom", fillBorderContrast: 4.2 },
        { kind: "highfreq", fillBorderContrast: 9.9 },
      ],
    });
    const result = evaluateReadabilityAcceptance(m);
    expect(result.acceptable).toBe(false);
    expect(result.cues.contrastOk).toBe(false);
    expect(result.reasons.some((r) => r.includes("bloom"))).toBe(true);
  });

  test("背景の計測が空なら不合格", () => {
    const result = evaluateReadabilityAcceptance(passingMeasurements({ backgrounds: [] }));
    expect(result.acceptable).toBe(false);
    expect(result.cues.contrastOk).toBe(false);
  });

  // 判別力(i): フロアが過小寸法を返す異常に相当。絶対下限の明示確認が弾く。
  test("フロア出力の射影が18未満なら不合格（絶対下限の明示確認）", () => {
    const result = evaluateReadabilityAcceptance(
      passingMeasurements({ minPixel: { emProjectedPixelHeight: 17.0 } })
    );
    expect(result.acceptable).toBe(false);
    expect(result.cues.lowerBoundOk).toBe(false);
    expect(result.reasons.some((r) => r.includes("絶対下限"))).toBe(true);
  });

  // 判別力(ii)下振れ: レンダリングの縮みに相当。忠実度が両側で弾く。
  test("インク縦画素が射影から許容を超えて下振れすれば不合格（忠実度・縮み）", () => {
    const result = evaluateReadabilityAcceptance(
      passingMeasurements({ minPixel: { measuredInkHeightPx: 10.0 } })
    );
    expect(result.acceptable).toBe(false);
    expect(result.cues.fidelityOk).toBe(false);
    expect(result.reasons.some((r) => r.includes("忠実度"))).toBe(true);
  });

  // 判別力(ii)上振れ: 形の崩れ・過大描画に相当。忠実度が両側で弾く。
  test("インク縦画素が射影から許容を超えて上振れすれば不合格（忠実度・崩れ）", () => {
    const result = evaluateReadabilityAcceptance(
      passingMeasurements({ minPixel: { measuredInkHeightPx: 15.0 } })
    );
    expect(result.acceptable).toBe(false);
    expect(result.cues.fidelityOk).toBe(false);
  });

  // 偽陽性防止: 許容内のわずかな揺れでは合格になる。
  test("許容内のわずかな下振れでは合格（正常な描画が偽陽性で落ちない）", () => {
    const result = evaluateReadabilityAcceptance(
      passingMeasurements({ minPixel: { measuredInkHeightPx: 12.0 } })
    );
    expect(result.acceptable).toBe(true);
    expect(result.cues.fidelityOk).toBe(true);
  });

  test("可視範囲が未確定なら退化として不合格で忠実度は判定しない", () => {
    const result = evaluateReadabilityAcceptance(
      passingMeasurements({ minPixel: { visibleBoundsValid: false } })
    );
    expect(result.acceptable).toBe(false);
    expect(result.cues.notDegenerate).toBe(false);
    expect(result.cues.fidelityOk).toBe(false);
    expect(result.reasons.some((r) => r.includes("退化"))).toBe(true);
  });

  test("塗りが見つからない（インク0）なら退化として不合格", () => {
    const result = evaluateReadabilityAcceptance(
      passingMeasurements({ minPixel: { measuredInkHeightPx: 0, inkWorldHeight: 0 } })
    );
    expect(result.acceptable).toBe(false);
    expect(result.cues.notDegenerate).toBe(false);
  });

  test("絶対下限はインク非依存で、退化していても評価される", () => {
    const result = evaluateReadabilityAcceptance(
      passingMeasurements({
        minPixel: { visibleBoundsValid: false, emProjectedPixelHeight: 17.0 },
      })
    );
    // 退化の理由と絶対下限の理由の両方が積まれる。
    expect(result.cues.lowerBoundOk).toBe(false);
    expect(result.cues.notDegenerate).toBe(false);
    expect(result.reasons.some((r) => r.includes("絶対下限"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("退化"))).toBe(true);
  });

  test("DEFAULT_THRESHOLDS は初期値を持つ", () => {
    expect(DEFAULT_THRESHOLDS.contrastRatio).toBe(4.5);
    expect(DEFAULT_THRESHOLDS.minPixelHeight).toBe(18);
    expect(DEFAULT_THRESHOLDS.projectionTolerance).toBe(0.15);
  });
});
