// 読ませる役の可読性の計算（純粋関数のみ。troika・three.js に依存しない）。
// 依存規則（docs/decisions/architecture.md §5）: 判定・得点・時刻の論理を持たず、profiles・tools は import しない。
//
// 設計の要点（プラン「色値はsRGBの16進で持ち、輝度の計算と比較は線形空間で行う」）:
// - 可読性の色値（塗り色・縁取り色・影色）は sRGB の16進で持つ。既存エンジンが塗り色を sRGB の16進で
//   扱う（engine.ts の applyTextProperties が text.color へ16進を渡す）ことに合わせるためである。
// - 相対輝度・コントラスト比・発光抑制の判定は、ここで sRGB を線形化してから行う。理由は、コントラスト比
//   の式（WCAG 2.1）とブルーム閾値がともに線形空間で定義されるためである。
// - 明るい成分の輝度上限（maxBrightLuminance）は、ブルーム閾値（線形空間0.5）と同じ線形空間の相対輝度で持つ。

import type {
  ReadabilityOptions,
  ReadabilityCapability,
  ResolvedReadabilityStyle,
  ReadabilityMode,
  ReadabilityBacking,
} from "./types";

/**
 * sRGB の1成分（0から1）を線形へ変換する。WCAG 2.1 の相対輝度の定義に従う。
 * 採用理由を先に述べる。コントラスト比の式は線形の成分を前提とするため、sRGB をそのまま使えない。
 */
export function srgbChannelToLinear(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * 線形の1成分（0から1）を sRGB へ変換する。srgbChannelToLinear の逆関数。
 */
export function linearChannelToSrgb(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB の16進色を sRGB の各成分（0から1）へ分解する。 */
export function srgbHexToChannels(hex: number): { r: number; g: number; b: number } {
  const value = Math.trunc(hex);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

/** sRGB の各成分（0から1）を sRGB の16進色へ合成する。 */
export function srgbChannelsToHex(r: number, g: number, b: number): number {
  const to255 = (c: number): number => Math.round(Math.min(1, Math.max(0, c)) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

/**
 * sRGB の16進色から WCAG 2.1 の相対輝度（線形、0から1）を求める。
 * 係数 0.2126・0.7152・0.0722 は WCAG 2.1 の定義値である。
 */
export function relativeLuminanceFromSrgbHex(hex: number): number {
  const { r, g, b } = srgbHexToChannels(hex);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/**
 * 2つの相対輝度からコントラスト比を求める。WCAG 2.1 の式 (明+0.05)/(暗+0.05) を用いる。
 * 定数 0.05 は WCAG 2.1 の定義値である。
 */
export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const high = Math.max(luminanceA, luminanceB);
  const low = Math.min(luminanceA, luminanceB);
  return (high + 0.05) / (low + 0.05);
}

/**
 * sRGB の16進色の相対輝度を、上限（線形）以下へ収める。色相を保つため線形空間で各成分を一様に縮小する。
 * 採用理由を先に述べる。相対輝度は線形成分の一次結合のため、線形空間で全成分を同じ倍率で縮小すると
 * 相対輝度もその倍率で縮小し、色相（成分の比）を変えずに上限へ収められる。
 */
export function clampLuminanceSrgbHex(hex: number, maxLinearLuminance: number): number {
  const luminance = relativeLuminanceFromSrgbHex(hex);
  if (luminance <= maxLinearLuminance || luminance <= 0) {
    return hex;
  }
  const scale = maxLinearLuminance / luminance;
  const { r, g, b } = srgbHexToChannels(hex);
  const rLinear = srgbChannelToLinear(r) * scale;
  const gLinear = srgbChannelToLinear(g) * scale;
  const bLinear = srgbChannelToLinear(b) * scale;
  // 8ビット（0から255）へ量子化する際は切り捨てる。理由を先に述べる。最近接へ丸めると量子化で輝度がわずかに
  // 上限を超える場合があり、塗りがブルーム閾値を越えてにじむ恐れがある。切り捨てれば各成分が目標以下になり、
  // 線形の一次結合である相対輝度も上限以下に収まる（わずかに暗くなるが上限超えは起こさない）。
  const floor255 = (channel: number): number =>
    Math.floor(Math.min(1, Math.max(0, channel)) * 255);
  return (
    (floor255(linearChannelToSrgb(rLinear)) << 16) |
    (floor255(linearChannelToSrgb(gLinear)) << 8) |
    floor255(linearChannelToSrgb(bLinear))
  );
}

/**
 * 最小画面画素高を満たす最小のワールド寸法（fontSize）を求める。
 * 採用理由を先に述べる。読ませる役はカメラへ正対する（engine.ts のカメラ正対）ため遠近の縮みがなく、
 * 透視投影では距離 distance で見える縦のワールド高さが 2 × distance × tan(縦視野角 ÷ 2) で、これが画面の
 * 縦画素高へ写る。よってワールド高さ H の画面画素高は H × viewportPixelHeight ÷ (2 × distance × tan(縦視野角 ÷ 2))
 * となり、目標 minPixelHeight について解くと最小ワールド高さが定まる。worldScale は単位の累積した拡大
 * （自身と親）で、既定は1とする。worldScale を渡すと拡大を考慮した正確な値になり、1のままなら高速な概算になる。
 * minPixelHeight と viewportPixelHeight はデバイス画素で扱う。理由は、読める可否は実際に描かれるデバイス画素で
 * 決まるためである。
 */
export function minWorldFontSize(args: {
  minPixelHeight: number;
  distance: number;
  fovYDegrees: number;
  viewportPixelHeight: number;
  worldScale?: number;
}): number {
  const fovYRadians = (args.fovYDegrees * Math.PI) / 180;
  const worldHeightAtDistance = 2 * Math.max(0, args.distance) * Math.tan(fovYRadians / 2);
  const scale = args.worldScale ?? 1;
  if (args.viewportPixelHeight <= 0 || scale <= 0) {
    return 0;
  }
  return (args.minPixelHeight * worldHeightAtDistance) / (args.viewportPixelHeight * scale);
}

/**
 * 与えられたワールド高さが画面上で何デバイス画素になるかを求める（正確な検証に使う）。
 * minWorldFontSize と同じ透視投影の関係を用いる。worldHeight は単位の実効ワールド高さ（fontSize × 累積拡大）。
 */
export function projectedPixelHeight(args: {
  worldHeight: number;
  distance: number;
  fovYDegrees: number;
  viewportPixelHeight: number;
}): number {
  const fovYRadians = (args.fovYDegrees * Math.PI) / 180;
  const worldHeightAtDistance = 2 * Math.max(0, args.distance) * Math.tan(fovYRadians / 2);
  if (worldHeightAtDistance <= 0) {
    return 0;
  }
  return (args.worldHeight * args.viewportPixelHeight) / worldHeightAtDistance;
}

/**
 * 機能可否と下地の要否から、読ませる役の描画モードを決める。
 * - 下地が要るときは「縁取りと下地モード」。
 * - stroke と outline のずれ・ぼかしが使えるときは「縁取りと影モード」（縁取りstroke・影outline）。
 * - それ以外は「縁取りのみモード」（縁取りoutline、別建ての影なし）。
 */
export function resolveReadabilityMode(
  capability: ReadabilityCapability,
  needsBacking: boolean
): ReadabilityMode {
  const canStrokeAndShadow =
    capability.stroke && capability.outlineOffset && capability.outlineBlur;
  if (needsBacking) {
    return "borderAndBacking";
  }
  return canStrokeAndShadow ? "borderAndShadow" : "borderOnly";
}

/**
 * 可読性属性・元の塗り色・機能可否・ブルーム閾値・下地の要否から、実際に適用する確定可読性指定を返す。
 * 確定可読性指定は #131 の合成の段（大きさ・発光・最後段の可読性補正）に対応づけた確定値の集合である。
 * troika へ直接書き込まず確定値を返す理由は、合成（#131）が各段へ正しい順序で適用できるようにするためである。
 *
 * borderVia と hasShadow は機能可否から定める。縁取りは暗い分離側のため発光抑制の対象に含めない。
 * 発光抑制の対象は塗りに限り、塗り色を maxBrightLuminance（ブルーム閾値以下）へ収める。
 */
export function resolveReadabilityStyle(args: {
  options: ReadabilityOptions;
  baseFillColor: number;
  capability: ReadabilityCapability;
  bloomThreshold: number;
  /** その文字が代替フォントへ回ったか、または字形の収録が確かでないか。下地の形の選択に使う。 */
  fallbackFontUsed: boolean;
  /** 縁取りと影だけで不利な背景の代表集合に対し4.5:1へ届かないと計測で判明したか。 */
  needsBacking: boolean;
}): ResolvedReadabilityStyle {
  const { options, capability, bloomThreshold } = args;
  // 発光抑制の上限は、可読性属性の指定値とブルーム閾値の小さい方とする。理由は、塗りがブルームの対象に
  // ならないことを保証するため、いかなる指定でもブルーム閾値を超えさせないためである。
  const maxBrightLuminance = Math.min(options.maxBrightLuminance, bloomThreshold);
  const fillColor = clampLuminanceSrgbHex(args.baseFillColor, maxBrightLuminance);

  const mode = resolveReadabilityMode(capability, args.needsBacking);
  const canStrokeAndShadow =
    capability.stroke && capability.outlineOffset && capability.outlineBlur;
  // 縁取りを stroke で描けるか。stroke が使えるときは縁取り stroke・影 outline、使えないときは縁取り outline。
  const borderVia: "stroke" | "outline" = capability.stroke ? "stroke" : "outline";
  // 別建ての影を持つのは、縁取りを stroke で描き outline を影へ回せるときに限る。
  const hasShadow = canStrokeAndShadow;
  // 下地の形。代替フォントへ回った文字や収録が確かでない文字は、文字形の暗い複製では字形を欠くため単位背面の暗い面を使う。
  const backing: ReadabilityBacking =
    mode === "borderAndBacking"
      ? args.fallbackFontUsed
        ? "unitPlate"
        : "glyphCopy"
      : "none";

  return {
    // 大きさの段
    minPixelHeight: options.minPixelHeight,
    // 発光の段
    fillColor,
    maxBrightLuminance,
    clampBrightBelowBloom: true,
    // 最後段の可読性補正
    mode,
    borderVia,
    hasShadow,
    backing,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth,
    borderOpacity: options.borderOpacity,
    shadowColor: options.shadowColor,
    shadowWidth: options.shadowWidth,
    shadowOffsetX: options.shadowOffsetX,
    shadowOffsetY: options.shadowOffsetY,
    shadowBlur: options.shadowBlur,
    shadowOpacity: options.shadowOpacity,
  };
}

/**
 * 読ませる役の既定の可読性属性。診断フィクスチャと、本番で具体値を決める前の初期値に使う。
 * 値の具体は線形空間と最終出力段のトーンマッピングの相互作用を机上で正確に導けないため、可読性診断で計測して
 * 確定する想定の初期値である。塗りは明るく（発光抑制で閾値以下へ収める）、縁取りと影は暗い色とする。
 * 縁取りと影の幅・ずれ・ぼかしは fontSize に対する百分率の文字列で持ち、文字の寸法に追従させる。
 */
export const DEFAULT_READABILITY_OPTIONS: ReadabilityOptions = {
  // 縁取り幅は、明るい塗りを主に残しつつ背景から分離できる細さにする。縁取り（stroke）は輪郭の中心線に沿い
  // 半分が内側に入るため、太いと塗りが消える。塗りを主役にし細い暗縁で囲む方針で4%を初期値とする。
  borderColor: 0x000000,
  borderWidth: "4%",
  borderOpacity: 1,
  shadowColor: 0x000000,
  shadowWidth: "3%",
  shadowOffsetX: "3%",
  shadowOffsetY: "-3%",
  shadowBlur: "8%",
  shadowOpacity: 0.85,
  maxBrightLuminance: 0.45,
  minPixelHeight: 18,
};
