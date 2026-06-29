// 演出文法④「縦伸ばし・渦」の実演出（Issue #26）。
// ロングトーン・シャウトを、縦に伸ばす（大きさの縦のみ）か、渦の変形で表す。設計根拠:
// docs/decisions/visual-expression-design.md §2.1.5（ロングトーン・シャウト＝縦に伸ばす、渦や円の歪み）・
// §2.2.3-1（変形は1文字ごとの幾何チャネルと排他）。文字単位。声量で縦伸ばしと渦を時間で切り替え、同一単位で
// 同時に出さない（変形排他を守る）。渦の角速度は1フレームあたり10度以下に収める（受け入れ基準）。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
} from "../effectElement";

/** 渦へ切り替える声量の閾値。これ以上で渦、未満で縦伸ばし。★暫定。 */
export const SWIRL_LOUDNESS_THRESHOLD = 0.5;
/** 縦伸ばしの最大倍率の増分。ロングトーンの伸びを明確にするため声量1で縦2.8倍（増分1.8）へ強める。★暫定。 */
export const VERTICAL_STRETCH_GAIN = 1.8;
/**
 * 渦の歪みの強さ（ねじれ振幅、ラジアン）と速さ。
 * 採用理由を先に述べる。ねじれ振幅は半径依存で最大このラジアンだけ字形をねじる。0.8ラジアン（約46度）は漢字の
 * 字形を破壊して読めなくするため、可読を保つ上限として0.3ラジアン（約17度）へ下げる。速さは1フレーム（約16.67
 * ミリ秒）あたりの回転を10度以下に収める受け入れ基準を満たす値1のまま据え置く。★暫定。
 */
export const SWIRL_STRENGTH = 0.3;
export const SWIRL_SPEED = 1;

export const verticalStretchSwirl: EffectElement = {
  id: "effect.verticalStretchSwirl",
  displayName: "縦伸ばし・渦",
  targetUnit: "char",
  startCondition: { trigger: "duringUnit", requiredSignals: ["duration", "loudness"], selectionHints: ["loudness", "duration"] },
  operates: { scale: "main", deform: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const loud = ctx.loudness ?? 0;
    // 声量が大きいときは渦、小さいときは縦伸ばし。どちらか一方のみを返し、変形排他を守る。
    if (loud >= SWIRL_LOUDNESS_THRESHOLD) {
      return {
        deform: {
          kind: "swirl",
          params: { strength: SWIRL_STRENGTH, speed: SWIRL_SPEED, spatialFreq: 1, phaseOffset: 0 },
        },
      };
    }
    const stretch = 1 + loud * VERTICAL_STRETCH_GAIN;
    return { scale: { layer: "main", value: { x: 1, y: stretch, z: 1 } } };
  },
};
