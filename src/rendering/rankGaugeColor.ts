// ランク専用ゲージ（Issue #65）の色。スコア蓄積の百分位に応じて、ランク4段階（C・B・A・S）の色を
// OKLCH 表色系で知覚的に滑らかに補間する純粋ロジック。状態を読んで描くビューに属する色定義であり、
// 判定・得点・時刻の論理を持たず、scoring を import しない（依存規則 docs/decisions/architecture.md §5）。
// 設計の出典は docs/idea/concept-final.md §9 と docs/research/03-rendering-ui.md §2。
//
// 色補間の中核 rankGaugeColorAt は主入力を t∈[0,1] に限り、百分位を知らない純粋関数にする。
// 百分位から t への換算は fillFractionFromPercentile の1か所だけで行う（丸めの責任を1か所へ固定する）。
// 色域への丸め（各チャンネルを [0,1] に収める）も最終 sRGB の1段階だけで行い、中間の OKLab・線形 sRGB では
// 丸めない（中間で丸めると色相が歪むため）。

/** OKLCH 表色系の色。l=明度（0..1）、c=彩度（0以上）、h=色相（度、0..360）。 */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** ガンマ補正済み sRGB の色。各チャンネル 0..1。 */
export type Srgb = readonly [number, number, number];

/**
 * ランク4段階のアンカー色（OKLCH）。配列はランクの昇順 C・B・A・S に対応する。
 * 値はユーザー確定の配色（4色相を巡回）。採用理由: 段階の違いが一目で分かるよう色相を巡らせる。
 * 場面の固定色（深夜の暗青・ひまわりのオレンジ・蝶のネオンブルー）とは別概念のゲージ専用色である。
 */
export const RANK_GAUGE_OKLCH: readonly Oklch[] = [
  { l: 0.55, c: 0.12, h: 250 }, // C 青
  { l: 0.65, c: 0.13, h: 150 }, // B 緑
  { l: 0.6, c: 0.15, h: 320 }, // A 紫
  { l: 0.85, c: 0.14, h: 85 }, // S 金
] as const;

/**
 * 各アンカーを置く t の位置（百分位帯の中心）。
 * 採用理由: ランク帯は C=[0,25) B=[25,50) A=[50,75) S=[75,100]（百分位）であり、各帯の中心
 * （0.125・0.375・0.625・0.875、t=percentile/100）にその帯の純色を置くと、帯の内側では表示文字の
 * ランクと同じ純色が支配し、帯境界では隣接色へ滑らかに遷移する。色はランク帯の塗り分けでなく百分位の
 * 連続表現であり、帯境界付近では「文字は A だが色は B と A の中間」という状態が起こりうる（仕様）。
 */
export const RANK_GAUGE_ANCHOR_T: readonly number[] = [0.125, 0.375, 0.625, 0.875] as const;

/** 値を下限と上限で挟む。 */
function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * 線形 sRGB の1チャンネルをガンマ補正 sRGB へ変換する（標準の sRGB 伝達関数）。
 * 負の値は下側の線形区間（12.92×x）を通り負のまま返す。色域への丸めはここでは行わず、最終段で1回だけ行う。
 */
function linearToGammaChannel(value: number): number {
  if (value <= 0.0031308) {
    return 12.92 * value;
  }
  return 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/**
 * OKLCH を ガンマ補正 sRGB（各チャンネル 0..1）へ変換する。
 * 経路: OKLCH → OKLab（a=c·cosh, b=c·sinh）→ 線形 sRGB（Björn Ottosson の OKLab 逆行列、
 * CSS Color Module Level 4 の定義）→ ガンマ補正 sRGB。色域への丸め（[0,1] への収め）は最終段の
 * 1回だけ行い、中間では丸めない。
 */
export function oklchToSrgb(color: Oklch): Srgb {
  const hRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hRad);
  const b = color.c * Math.sin(hRad);

  // OKLab → 非線形中間量（立方根空間）。
  const lPrime = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = color.l - 0.0894841775 * a - 1.291485548 * b;

  // 立方して線形錐応答へ。
  const lCone = lPrime * lPrime * lPrime;
  const mCone = mPrime * mPrime * mPrime;
  const sCone = sPrime * sPrime * sPrime;

  // 線形錐応答 → 線形 sRGB。
  const rLinear = 4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone;
  const gLinear = -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone;
  const bLinear = -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone;

  // ガンマ補正したのち、最終段で色域へ丸める（[0,1]）。
  return [
    clamp(linearToGammaChannel(rLinear), 0, 1),
    clamp(linearToGammaChannel(gLinear), 0, 1),
    clamp(linearToGammaChannel(bLinear), 0, 1),
  ];
}

/** 2値を線形補間する。 */
function lerp(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction;
}

/**
 * 色相（度）を最短角度方向で補間する。
 * 採用理由: 色相は角度量のため、隣接アンカー間で差が ±180度以内になる最短方向を採ると、遠回りの遷移を
 * 避けて知覚的に自然な色変化になる（CSS Color 4 の oklch 既定と同じ最短色相補間）。
 */
function lerpHueShortest(h0: number, h1: number, fraction: number): number {
  let delta = ((h1 - h0) % 360 + 360) % 360; // 0..360 の正の差
  if (delta > 180) {
    delta -= 360; // -180..180 の最短差へ
  }
  return h0 + delta * fraction;
}

/**
 * 補間パラメータ t∈[0,1] から、補間したランクゲージ色を OKLCH のまま返す純粋関数。
 * アンカー（RANK_GAUGE_OKLCH）を RANK_GAUGE_ANCHOR_T の位置に置き、明度 l と彩度 c は線形、色相 h は
 * 最短角度方向で補間する。両端（最下位アンカーより下・最上位アンカーより上）はそれぞれの端の色で一定とする
 * （両端の外側補間を避けるため）。t は防御的に [0,1] へ丸めるが、通常は fillFractionFromPercentile が
 * 既に [0,1] にしている。
 * sRGB へ変換する前の OKLCH を返すのは、知覚的滑らかさを OKLab 空間で直接検証できるようにするためである。
 */
export function rankGaugeOklchAt(t: number): Oklch {
  const value = Number.isFinite(t) ? clamp(t, 0, 1) : 0;
  const anchorCount = RANK_GAUGE_OKLCH.length;

  // 最下位アンカーより下は最下位の色で一定。
  if (value <= RANK_GAUGE_ANCHOR_T[0]) {
    return RANK_GAUGE_OKLCH[0];
  }
  // 最上位アンカーより上は最上位の色で一定。
  if (value >= RANK_GAUGE_ANCHOR_T[anchorCount - 1]) {
    return RANK_GAUGE_OKLCH[anchorCount - 1];
  }

  // value を挟む2つのアンカー区間を見つけて区間内の割合で補間する。
  for (let i = 0; i < anchorCount - 1; i += 1) {
    const tLow = RANK_GAUGE_ANCHOR_T[i];
    const tHigh = RANK_GAUGE_ANCHOR_T[i + 1];
    if (value >= tLow && value <= tHigh) {
      const fraction = (value - tLow) / (tHigh - tLow);
      const low = RANK_GAUGE_OKLCH[i];
      const high = RANK_GAUGE_OKLCH[i + 1];
      return {
        l: lerp(low.l, high.l, fraction),
        c: lerp(low.c, high.c, fraction),
        h: lerpHueShortest(low.h, high.h, fraction),
      };
    }
  }

  // 到達しない（上の両端判定と区間探索で全域を覆う）。防御として最上位の色を返す。
  return RANK_GAUGE_OKLCH[anchorCount - 1];
}

/**
 * 補間パラメータ t∈[0,1] からランクゲージの色（ガンマ補正 sRGB）を返す純粋関数。
 * rankGaugeOklchAt で補間した OKLCH を oklchToSrgb で sRGB へ変換するだけであり、丸めは oklchToSrgb の
 * 最終段の1か所だけで起きる（呼び出し側で再度丸めない）。
 */
export function rankGaugeColorAt(t: number): Srgb {
  return oklchToSrgb(rankGaugeOklchAt(t));
}

/**
 * 百分位 [0,100] を、満ち量と色補間の共通入力 t∈[0,1] へ換算する。
 * 採用理由: concept-final §9「スコアの増加でゲージが蓄積」を満ち量へ写す。#55 の simplePercentile は
 * 得点に対して線形のため percentile/100 は正規化した得点に一致し、満ち量はスコア増加に単調比例する。
 * 非有限・負は0、100超は1へ丸める。百分位→t の丸めはこの1か所だけで行う。
 */
export function fillFractionFromPercentile(percentile: number): number {
  if (!Number.isFinite(percentile)) {
    return 0;
  }
  return clamp(percentile, 0, 100) / 100;
}
