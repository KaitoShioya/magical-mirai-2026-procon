// 演出文法②「字間拡大一括表示」の実演出（Issue #24）。
// 流れる連続フレーズを、字間を広げて一括表示し数拍保持する。設計根拠: docs/decisions/visual-expression-design.md
// §2.1.5（流れる連続フレーズ＝全文を一括表示し字間を広げ数拍保持）。字間は単語・フレーズ単位でのみ意味を持つ
// （合成器が文字単位・画面全体では字間寄与を捨てる）ため対象単位はフレーズとする。
//
// 「イージング＋モーション＝差し替え可能な1セット」をモーションセット抽象の上に作る。登場で字間を0から目標へ
// 広げ（出の指数で減速して着地）、以後は目標値で保持する。退場は持たない（句の切れ目は別文法 #28 が担う）。

import { createMotionSetEffect } from "../motionSet";
import type { EffectElement } from "../effectElement";

/** 字間の目標値（ワールド単位）。流れる句の字間を広げて保持する。1.5では広がりが弱いため2.2へ強める。★暫定。 */
export const LETTER_SPACING_TARGET = 2.2;
/**
 * 字間を広げる登場の長さ（ミリ秒）。
 * 採用理由を先に述べる。出の指数（番号23）は最初の約50ミリ秒で広がりの8割が進むため、280ミリ秒では広がる過程が
 * 一瞬で終わり「字間が広がる動き」が見えない。過程を目で追えるよう700ミリ秒へ延ばし、イージングも過程が見える
 * 出の三次（番号13、フロントロードが指数より緩い）にする。★暫定。
 */
export const LETTER_SPACING_SPREAD_MS = 700;

export const letterSpacingSpread: EffectElement = createMotionSetEffect({
  kind: "scalar",
  id: "effect.letterSpacingSpread",
  displayName: "字間拡大一括表示",
  targetUnit: "phrase",
  startCondition: { trigger: "onUnitStart", requiredSignals: ["duration"], selectionHints: ["granularity"] },
  priority: 0,
  channel: "letterSpacing",
  layer: "main",
  window: { entranceMs: LETTER_SPACING_SPREAD_MS, exitMs: 0 },
  easing: { entrance: "outCubic" },
  values: { from: 0, rest: LETTER_SPACING_TARGET, to: LETTER_SPACING_TARGET },
  cost: () => ({
    // 字間補間中は毎フレーム再配置するため、補間区間のフレーム数を troika 同期の上限とする。
    extraGlyphs: 0,
    gsapTargetsPerFrame: 1,
    troikaSyncs: Math.ceil(LETTER_SPACING_SPREAD_MS / (1000 / 60)),
    glowTargets: 0,
    duplication: false,
  }),
});
