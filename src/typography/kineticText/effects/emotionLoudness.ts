// 演出文法「感情・声量→発光/色/動き」の実演出（Issue #30 の動きの演出側）。
// 声量で発光と揺らぎの強さを、感情で色を決める。設計根拠: docs/decisions/visual-expression-design.md
// §3.1（差し色をオレンジとネオンブルー）・§2.3.3（細部の動きは声量の山に乗せる）。文字単位。常時重ねる小演出で、
// 主張色・発光・位置の揺らぎを出す（揺らぎは合成器が加算する唯一の層であり、主変形の軸と衝突しない）。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
} from "../effectElement";

/** 明るい感情の差し色（オレンジ）。docs/idea/concept-final.md §11 の差し色。☆確定。 */
export const EMOTION_WARM_COLOR = 0xff8800;
/** 暗い感情の差し色（ネオンブルー）。同上。☆確定。 */
export const EMOTION_COOL_COLOR = 0x33aaff;
/** 感情の明暗を分ける閾値。0.5を境にオレンジとネオンブルーを切り替える初期値。★暫定。 */
export const EMOTION_THRESHOLD = 0.5;
/** 声量1のときの揺らぎ振幅（ワールド単位）。細部の生気を出す小さな初期値。★暫定。 */
export const LOUDNESS_JITTER_AMPLITUDE = 0.05;
/** 揺らぎの周波数（毎秒の周期数）。声量の山で細かく震える速さの初期値。★暫定。 */
export const LOUDNESS_JITTER_FREQ_HZ = 6;
/**
 * 声量1のときに大きさへ加える増分。
 * 採用理由を先に述べる。微振動だけでは「上下左右に小さく振動するだけ」で声量の大きさが伝わらない。声量を大きさの
 * 脈動にも効かせ、声が大きいほど文字が膨らむようにする。揺らぎ層（加算）で出し、軸の主変形と衝突させない。声量1で
 * 0.35倍膨らむ値とする。★暫定。
 */
export const LOUDNESS_SCALE_GAIN = 0.35;

export const emotionLoudness: EffectElement = {
  id: "effect.emotionLoudness",
  displayName: "感情・声量マッピング",
  targetUnit: "char",
  startCondition: {
    trigger: "duringUnit",
    requiredSignals: ["loudness", "emotion"],
    selectionHints: ["loudness", "emotion"],
  },
  operates: { color: "assertive", glow: true, position: "jitter", scale: "jitter" },
  defaultPriority: 10,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 1, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const loud = ctx.loudness ?? 0;
    const emotion = ctx.emotion ?? EMOTION_THRESHOLD;
    // 揺らぎは声量に比例した振幅で、時間に対して正弦で振動させる（声量の山で細部が震える）。
    // 縦横の位相を脱相関させ、機械的な斜め一方向のずれに見えないようにする。
    const amplitude = loud * LOUDNESS_JITTER_AMPLITUDE;
    const w = 2 * Math.PI * LOUDNESS_JITTER_FREQ_HZ * (ctx.gameTimeMs / 1000);
    // 大きさの脈動は声量に比例した増分を揺らぎ層（加算）で出す。合成器が等倍へ加算するため、声が大きいほど膨らむ。
    const scaleGain = loud * LOUDNESS_SCALE_GAIN;
    return {
      color: { layer: "assertive", color: emotion >= EMOTION_THRESHOLD ? EMOTION_WARM_COLOR : EMOTION_COOL_COLOR },
      glow: { intensity: loud },
      position: { layer: "jitter", value: { x: amplitude * Math.sin(w), y: amplitude * Math.sin(w * 1.37 + 1.1), z: 0 } },
      scale: { layer: "jitter", value: { x: scaleGain, y: scaleGain, z: scaleGain } },
    };
  },
};
