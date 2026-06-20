import { describe, it, expect } from "vitest";
import {
  srgbChannelToLinear,
  linearChannelToSrgb,
  relativeLuminanceFromSrgbHex,
  contrastRatio,
  clampLuminanceSrgbHex,
  minWorldFontSize,
  projectedPixelHeight,
  resolveReadabilityMode,
  resolveReadabilityStyle,
  DEFAULT_READABILITY_OPTIONS,
} from "./readability";
import type { ReadabilityCapability } from "./types";

describe("sRGB と線形の相互変換", () => {
  it("端点 0 と 1 は保たれる", () => {
    expect(srgbChannelToLinear(0)).toBe(0);
    expect(srgbChannelToLinear(1)).toBeCloseTo(1, 6);
    expect(linearChannelToSrgb(0)).toBe(0);
    expect(linearChannelToSrgb(1)).toBeCloseTo(1, 6);
  });
  it("相互変換は元へ戻る", () => {
    for (const value of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(linearChannelToSrgb(srgbChannelToLinear(value))).toBeCloseTo(value, 6);
    }
  });
  it("範囲外は 0 から 1 へ収める", () => {
    expect(srgbChannelToLinear(-1)).toBe(0);
    expect(srgbChannelToLinear(2)).toBeCloseTo(1, 6);
  });
});

describe("相対輝度とコントラスト比（WCAG 2.1）", () => {
  it("白は1、黒は0", () => {
    expect(relativeLuminanceFromSrgbHex(0xffffff)).toBeCloseTo(1, 6);
    expect(relativeLuminanceFromSrgbHex(0x000000)).toBe(0);
  });
  it("白と黒のコントラスト比は21", () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 6);
  });
  it("コントラスト比は引数の順序に依らない", () => {
    expect(contrastRatio(0.2, 0.8)).toBeCloseTo(contrastRatio(0.8, 0.2), 12);
  });
});

describe("発光抑制（輝度の上限への収め）", () => {
  it("上限以下の色はそのまま返す", () => {
    expect(clampLuminanceSrgbHex(0x000000, 0.45)).toBe(0x000000);
  });
  it("白を上限0.45へ収めると相対輝度がほぼ0.45（量子化で僅かに下、上限は超えない）", () => {
    const clamped = clampLuminanceSrgbHex(0xffffff, 0.45);
    const luminance = relativeLuminanceFromSrgbHex(clamped);
    // 8ビット量子化を切り捨てるため、僅かに下振れする。上限は超えない。
    expect(luminance).toBeLessThanOrEqual(0.45);
    expect(luminance).toBeCloseTo(0.45, 2);
  });
  it("収めた明るい塗りは黒い縁取りに対しコントラスト比4.5以上を保つ", () => {
    // 明るい塗り（上限0.45）と暗い縁取り（黒）の組で、背景非依存のコントラストを確かめる。
    const fill = clampLuminanceSrgbHex(0xffffff, 0.45);
    const ratio = contrastRatio(
      relativeLuminanceFromSrgbHex(fill),
      relativeLuminanceFromSrgbHex(0x000000)
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
  it("色相を保つ（成分の比が変わらない）", () => {
    const clamped = clampLuminanceSrgbHex(0x4080c0, 0.1);
    const r = (clamped >> 16) & 0xff;
    const g = (clamped >> 8) & 0xff;
    const b = clamped & 0xff;
    // 元の比 0x40:0x80:0xc0 = 1:2:3 を線形空間で保つ。sRGBでは厳密でないため緩い許容で確かめる。
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });
});

describe("最小表示寸法の計算", () => {
  it("最小ワールド寸法と画面画素高は逆算で一致する", () => {
    const args = { minPixelHeight: 100, distance: 10, fovYDegrees: 60, viewportPixelHeight: 1000 };
    const world = minWorldFontSize(args);
    const pixels = projectedPixelHeight({
      worldHeight: world,
      distance: args.distance,
      fovYDegrees: args.fovYDegrees,
      viewportPixelHeight: args.viewportPixelHeight,
    });
    expect(pixels).toBeCloseTo(100, 6);
  });
  it("累積拡大が2なら必要な fontSize は半分になる", () => {
    const base = minWorldFontSize({
      minPixelHeight: 50,
      distance: 8,
      fovYDegrees: 50,
      viewportPixelHeight: 800,
    });
    const scaled = minWorldFontSize({
      minPixelHeight: 50,
      distance: 8,
      fovYDegrees: 50,
      viewportPixelHeight: 800,
      worldScale: 2,
    });
    expect(scaled).toBeCloseTo(base / 2, 9);
  });
  it("距離が遠いほど必要な fontSize は大きい", () => {
    const near = minWorldFontSize({
      minPixelHeight: 30,
      distance: 5,
      fovYDegrees: 60,
      viewportPixelHeight: 900,
    });
    const far = minWorldFontSize({
      minPixelHeight: 30,
      distance: 20,
      fovYDegrees: 60,
      viewportPixelHeight: 900,
    });
    expect(far).toBeGreaterThan(near);
  });
});

const FULL_CAPABILITY: ReadabilityCapability = {
  stroke: true,
  outlineOffset: true,
  outlineBlur: true,
};
const NO_STROKE_CAPABILITY: ReadabilityCapability = {
  stroke: false,
  outlineOffset: true,
  outlineBlur: true,
};

describe("描画モードの決定", () => {
  it("全機能ありで下地不要なら縁取りと影モード", () => {
    expect(resolveReadabilityMode(FULL_CAPABILITY, false)).toBe("borderAndShadow");
  });
  it("stroke非対応なら縁取りのみモード", () => {
    expect(resolveReadabilityMode(NO_STROKE_CAPABILITY, false)).toBe("borderOnly");
  });
  it("下地が要るなら縁取りと下地モード", () => {
    expect(resolveReadabilityMode(FULL_CAPABILITY, true)).toBe("borderAndBacking");
  });
});

describe("確定可読性指定の生成", () => {
  it("全機能ありなら縁取りstroke・影outline・下地なし、塗りは上限以下へ収める", () => {
    const style = resolveReadabilityStyle({
      options: { ...DEFAULT_READABILITY_OPTIONS, maxBrightLuminance: 0.45 },
      baseFillColor: 0xffffff,
      capability: FULL_CAPABILITY,
      bloomThreshold: 0.5,
      fallbackFontUsed: false,
      needsBacking: false,
    });
    expect(style.mode).toBe("borderAndShadow");
    expect(style.borderVia).toBe("stroke");
    expect(style.hasShadow).toBe(true);
    expect(style.backing).toBe("none");
    expect(relativeLuminanceFromSrgbHex(style.fillColor)).toBeLessThanOrEqual(0.45 + 1e-6);
  });
  it("stroke非対応なら縁取りoutline・影なし", () => {
    const style = resolveReadabilityStyle({
      options: DEFAULT_READABILITY_OPTIONS,
      baseFillColor: 0xffffff,
      capability: NO_STROKE_CAPABILITY,
      bloomThreshold: 0.5,
      fallbackFontUsed: false,
      needsBacking: false,
    });
    expect(style.borderVia).toBe("outline");
    expect(style.hasShadow).toBe(false);
  });
  it("発光上限はブルーム閾値を超えない", () => {
    const style = resolveReadabilityStyle({
      options: { ...DEFAULT_READABILITY_OPTIONS, maxBrightLuminance: 0.9 },
      baseFillColor: 0xffffff,
      capability: FULL_CAPABILITY,
      bloomThreshold: 0.5,
      fallbackFontUsed: false,
      needsBacking: false,
    });
    expect(style.maxBrightLuminance).toBeLessThanOrEqual(0.5);
    expect(relativeLuminanceFromSrgbHex(style.fillColor)).toBeLessThanOrEqual(0.5 + 1e-6);
  });
  it("下地が要り代替フォントを使うなら単位背面の暗い面、使わないなら文字形の暗い複製", () => {
    const plate = resolveReadabilityStyle({
      options: DEFAULT_READABILITY_OPTIONS,
      baseFillColor: 0xffffff,
      capability: FULL_CAPABILITY,
      bloomThreshold: 0.5,
      fallbackFontUsed: true,
      needsBacking: true,
    });
    expect(plate.mode).toBe("borderAndBacking");
    expect(plate.backing).toBe("unitPlate");
    const copy = resolveReadabilityStyle({
      options: DEFAULT_READABILITY_OPTIONS,
      baseFillColor: 0xffffff,
      capability: FULL_CAPABILITY,
      bloomThreshold: 0.5,
      fallbackFontUsed: false,
      needsBacking: true,
    });
    expect(copy.backing).toBe("glyphCopy");
  });
});
