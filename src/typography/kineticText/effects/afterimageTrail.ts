// 演出文法⑤「残像トレイル」の実演出（Issue #27）。
// 速度の強調を、進行方向と逆へ尾を引く残像（写しごとに減衰する不透明度）で表す。設計根拠:
// docs/decisions/visual-expression-design.md §2.1.5（速度の強調＝モーションブラーか押し潰しと引き伸ばし）・
// §5.1（モーションブラーは複製の残像で実現しスマホで60fpsを保てる）。文字単位。複製（残像）と不透明度を出す。
// 写しの不透明度は奥（古い残像）ほど減衰させ、尾が見える最低3枚を保つ（受け入れ基準「尾が見える最低3フレーム」）。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
  DuplicateCopy,
} from "../effectElement";

/** 残像の枚数。尾を筋として読ませつつ長すぎないよう5枚にする（受け入れ基準の最低3枚を満たす）。★暫定。 */
export const TRAIL_LENGTH = 5;
/**
 * 1枚あたりの後退量（ワールド単位）。
 * 採用理由を先に述べる。後退量が文字の径より十分小さいと残像が同じ位置に重なり「ぶれて静止」に見える。文字の径の
 * およそ4割ずつ後退させると尾が筋として流れて読める。長すぎない尾にするため5枚・歩幅0.9で文字2個分ほどの尾を引く。★暫定。
 */
export const TRAIL_STEP = 0.9;
/** 先頭残像の不透明度と1枚ごとの減衰量。奥（古い残像）ほど薄くする。★暫定。 */
export const TRAIL_HEAD_OPACITY = 0.8;
export const TRAIL_DECAY = 0.18;
/**
 * 縮退で減らせる下限の写し数。受け入れ基準「尾が見える（最低3枚）」を満たすため、費用が逼迫しても残像を3枚は
 * 残す。☆確定（受け入れ基準由来）。
 */
export const TRAIL_MIN_COUNT = 3;

export const afterimageTrail: EffectElement = {
  id: "effect.afterimageTrail",
  displayName: "残像トレイル",
  targetUnit: "char",
  startCondition: { trigger: "duringUnit", selectionHints: ["beat", "duration"] },
  operates: { duplication: true, opacity: true },
  defaultPriority: 0,
  estimateCost(input: EffectCostInput): EffectCost {
    return {
      extraGlyphs: TRAIL_LENGTH * input.unitGlyphCount,
      gsapTargetsPerFrame: TRAIL_LENGTH,
      troikaSyncs: 0,
      glowTargets: 0,
      duplication: true,
    };
  },
  evaluate(_ctx: EffectContext): AttributeContribution | null {
    const copies: DuplicateCopy[] = [];
    for (let index = 0; index < TRAIL_LENGTH; index += 1) {
      const back = index + 1;
      copies.push({
        offset: { x: -back * TRAIL_STEP, y: 0, z: 0 },
        opacity: Math.max(0, TRAIL_HEAD_OPACITY - back * TRAIL_DECAY),
      });
    }
    return {
      duplication: { layout: "trail", copies, minCount: TRAIL_MIN_COUNT },
      opacity: { factor: 1 },
    };
  },
};
