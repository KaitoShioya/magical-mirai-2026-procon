// 演出文法「3Dカメラワーク文字（奥行き飛び込み）」の実演出（Issue #32 の奥行き飛び込みセット）。
// 軌跡連動の遠近・飛び込み・奥抜けで疾走感を出す。設計根拠: docs/decisions/visual-expression-design.md
// §1.1.3（立体感は文字を奥行き方向に層配置しカメラが回り込むことで作る）・§2.1.2（大きな文字を背景に置く）。
// 文字単位。位置の主変形（奥から手前へ飛び込む z 移動）と回転の主変形（わずかな y 回転）を出す。
// 位置は基準位置からの相対で扱い、登場後に文字の自然な配置へ着地する。二チャネルを出すためモーションセット抽象
// （単一チャネル）ではなく専用に評価する。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
} from "../effectElement";
import { outExpo } from "../easing";

/** 飛び込みの長さ（ミリ秒）。素早く飛来して着地する打撃感のため350とする。★暫定。 */
export const DEPTH_FLIGHT_MS = 350;
/**
 * 飛び込みの開始の奥行き（ワールド単位、奥方向は負）。
 * 採用理由を先に述べる。立体的な飛び込みは見かけ寸法の振り幅で作る（設計書§1.1.2「奥行きのメリハリは大きさの振り幅」）。
 * 透視投影では見かけ寸法はカメラからの距離に反比例し、奥の移動ほど寸法差が小さい。プレビューのカメラ距離26に対し
 * 30だけ奥（距離56）から着地（距離26）へ寄せると、見かけ寸法がおよそ2.2倍に成長し、奥から飛来する立体感が読める。
 * -18（成長約1.7倍）では振り幅が足りず「少し小さくなるだけ」になるため-30へ深める。★暫定。
 */
export const DEPTH_FLIGHT_START_Z = -30;
/** 着地までに添えるわずかな y 回転（ラジアン）。立体感の付与の初期値。★暫定。 */
export const DEPTH_FLIGHT_YAW = 0.2;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export const depthFlight: EffectElement = {
  id: "effect.depthFlight",
  displayName: "3次元カメラワーク文字",
  targetUnit: "char",
  startCondition: { trigger: "onUnitStart", selectionHints: ["granularity", "beat"] },
  operates: { position: "main", rotation: "main" },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const base = ctx.basePosition ?? { x: 0, y: 0, z: 0 };
    const progress = clamp01((ctx.gameTimeMs - ctx.unitStartMs) / DEPTH_FLIGHT_MS);
    // 出の指数で減速して着地する。残り奥行きは (1 - 進行) に比例する。
    const eased = outExpo(progress);
    const z = base.z + DEPTH_FLIGHT_START_Z * (1 - eased);
    // 回転も着地に向けて0へ収束させる（奥にいるほど傾き、手前で正対へ戻す）。
    const yaw = DEPTH_FLIGHT_YAW * (1 - eased);
    return {
      position: { layer: "main", value: { x: base.x, y: base.y, z } },
      rotation: { layer: "main", value: { x: 0, y: yaw, z: 0 } },
    };
  },
};
