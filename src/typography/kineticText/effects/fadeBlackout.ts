// 演出文法⑥「減衰・暗転」の実演出（Issue #28）。
// 曲の切れ目に画面全体の不透明度を落として暗転し、場面の句読点を打つ。設計根拠:
// docs/decisions/visual-expression-design.md §2.1.5（曲の切れ目＝暗転）・§3.1（句読点は最も安価で効く区切り）。
// 画面全体単位の不透明度のみを操作する。色反転やグリッチの後処理は別経路（PostprocessMotionSet）が担う。
//
// 退場の窓で不透明度を1から0へ落とす。落とす速さは入りの指数（加速して抜ける）を既定とし、滑らかに暗くする。

import { createMotionSetEffect } from "../motionSet";
import type { EffectElement } from "../effectElement";

/**
 * 暗転に要する時間（ミリ秒）。
 * 採用理由を先に述べる。暗転は場面の句読点として滑らかに沈む読後感が目的で、240ミリ秒では沈みが速く「パッと消える」
 * 印象になる。500ミリ秒へ延ばして沈む過程を見せる。★暫定。
 */
export const FADE_BLACKOUT_MS = 500;

export const fadeBlackout: EffectElement = createMotionSetEffect({
  kind: "scalar",
  id: "effect.fadeBlackout",
  displayName: "減衰・暗転",
  targetUnit: "fullscreen",
  startCondition: { trigger: "onUnitEnd", requiredSignals: ["sectionBoundary"], selectionHints: ["sectionBoundary"] },
  priority: 0,
  channel: "opacity",
  window: { entranceMs: 0, exitMs: FADE_BLACKOUT_MS },
  // 退場の既定（§2.2.4 の入りの指数）は加速して抜ける曲線で、画面全体の暗転には急峻すぎる。暗転は両端の遅い正弦の
  // 入り出（番号4）で滑らかに沈ませる（設計書§2.2.4 が「カメラと同期して塊全体を動かす場合＝両端の遅い正弦の入り出」と
  // 定めるのと同じ、滑らかさが要件の局面のため既定から外す）。
  easing: { exit: "inOutSine" },
  values: { from: 1, rest: 1, to: 0 },
  cost: () => ({ extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false }),
});
