// 検査専用の擬似演出（Issue #130 の充足性の証明用）。
// 後続Issue（#23・#24〜#28・#30・#32）が本基盤を改変せず登録1件で追加できることを示すため、
// 公開型 EffectElement だけで8演出を組み立てる。これは実演出ではなく、実演出は各Issueで出荷する。
// 将来モジュールを import しないため固定具に置く。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
  DuplicateCopy,
} from "../effectElement";

function zero(): { x: number; y: number; z: number } {
  return { x: 0, y: 0, z: 0 };
}

/** #23 1文字1拍スマッシュ（P0）。文字単位。位置・大きさの主変形と透明度。 */
export const charSmashSample: EffectElement = {
  id: "sample.charSmash",
  displayName: "1文字1拍スマッシュ",
  targetUnit: "char",
  startCondition: { trigger: "onUnitStart", beatCadence: 2, requiredSignals: ["beat"], selectionHints: ["granularity"] },
  operates: { position: "main", scale: "main", opacity: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const phase = ctx.beatPhase ?? 0;
    const scale = 1 + (1 - phase) * 0.6;
    return {
      position: { layer: "main", value: zero() },
      scale: { layer: "main", value: { x: scale, y: scale, z: scale } },
      opacity: { factor: 1 },
    };
  },
};

/** #24 字間拡大一括。フレーズ単位。字間の主変形と透明度。 */
export const letterSpacingSpreadSample: EffectElement = {
  id: "sample.letterSpacingSpread",
  displayName: "字間拡大一括表示",
  targetUnit: "phrase",
  startCondition: { trigger: "onUnitStart", requiredSignals: ["duration"], selectionHints: ["granularity"] },
  operates: { letterSpacing: "main", opacity: true },
  estimateCost(_input: EffectCostInput): EffectCost {
    // 字間補間中は毎フレーム再配置するため、補間区間のフレーム数を troika 同期の上限とする。
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 30, glowTargets: 0, duplication: false };
  },
  defaultPriority: 0,
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const span = Math.max(1, ctx.unitEndMs - ctx.unitStartMs);
    const progress = Math.min(1, Math.max(0, (ctx.gameTimeMs - ctx.unitStartMs) / span));
    const spacing = 1 + progress * 1.5;
    return {
      letterSpacing: { layer: "main", value: spacing },
      opacity: { factor: 1 },
    };
  },
};

/** #25 円状回転・重ね増殖。単語単位。回転の主変形と複製（円状）。 */
const CIRCLE_MAX_COPIES = 8;
export const circularMultiplySample: EffectElement = {
  id: "sample.circularMultiply",
  displayName: "円状回転・重ね増殖",
  targetUnit: "word",
  startCondition: { trigger: "onUnitStart", selectionHints: ["granularity"] },
  operates: { rotation: "main", duplication: true },
  defaultPriority: 0,
  estimateCost(input: EffectCostInput): EffectCost {
    return {
      extraGlyphs: CIRCLE_MAX_COPIES * input.unitGlyphCount,
      gsapTargetsPerFrame: CIRCLE_MAX_COPIES,
      troikaSyncs: 1,
      glowTargets: 0,
      duplication: true,
    };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const angle = (ctx.gameTimeMs / 1000) % (Math.PI * 2);
    const copies: DuplicateCopy[] = [];
    for (let index = 0; index < CIRCLE_MAX_COPIES; index += 1) {
      const theta = (index / CIRCLE_MAX_COPIES) * Math.PI * 2;
      copies.push({ offset: { x: Math.cos(theta), y: Math.sin(theta), z: 0 } });
    }
    return {
      rotation: { layer: "main", value: { x: 0, y: 0, z: angle } },
      duplication: { layout: "polar", copies, minCount: 3 },
    };
  },
};

/** #26 縦伸ばし・渦。文字単位。大きさの主変形（縦のみ）か、変形（渦）。同一単位で同時に出さない。 */
export const verticalStretchSwirlSample: EffectElement = {
  id: "sample.verticalStretchSwirl",
  displayName: "縦伸ばし・渦",
  targetUnit: "char",
  startCondition: { trigger: "duringUnit", requiredSignals: ["duration", "loudness"], selectionHints: ["loudness"] },
  operates: { scale: "main", deform: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const loud = ctx.loudness ?? 0;
    // 声量が大きいときは渦、小さいときは縦伸ばし。どちらか一方のみを返し、変形排他を守る。
    if (loud >= 0.5) {
      return {
        deform: {
          kind: "swirl",
          params: { strength: 0.8, speed: 1, spatialFreq: 1, phaseOffset: 0 },
        },
      };
    }
    const stretch = 1 + loud;
    return { scale: { layer: "main", value: { x: 1, y: stretch, z: 1 } } };
  },
};

/** #27 残像トレイル。文字単位。複製（残像、写しごとに減衰する不透明度）と透明度。 */
const TRAIL_LENGTH = 5;
export const afterimageTrailSample: EffectElement = {
  id: "sample.afterimageTrail",
  displayName: "残像トレイル",
  targetUnit: "char",
  startCondition: { trigger: "duringUnit", selectionHints: ["beat"] },
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
        offset: { x: -back * 0.1, y: 0, z: 0 },
        opacity: Math.max(0, 0.8 - back * 0.15),
      });
    }
    return {
      duplication: { layout: "trail", copies, minCount: 2 },
      opacity: { factor: 1 },
    };
  },
};

/** #28 減衰・暗転。画面全体単位。透明度のみ。 */
export const fadeBlackoutSample: EffectElement = {
  id: "sample.fadeBlackout",
  displayName: "減衰・暗転",
  targetUnit: "fullscreen",
  startCondition: { trigger: "onUnitEnd", requiredSignals: ["sectionBoundary"], selectionHints: ["sectionBoundary"] },
  operates: { opacity: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const span = Math.max(1, ctx.unitEndMs - ctx.unitStartMs);
    const progress = Math.min(1, Math.max(0, (ctx.gameTimeMs - ctx.unitStartMs) / span));
    return { opacity: { factor: 1 - progress } };
  },
};

/** #30 感情・声量→発光/色/動き。文字単位。主張色・発光・位置の揺らぎ。 */
export const emotionLoudnessSample: EffectElement = {
  id: "sample.emotionLoudness",
  displayName: "感情・声量マッピング",
  targetUnit: "char",
  startCondition: { trigger: "duringUnit", requiredSignals: ["loudness", "emotion"], selectionHints: ["loudness", "emotion"] },
  operates: { color: "assertive", glow: true, position: "jitter" },
  defaultPriority: 10,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 1, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const loud = ctx.loudness ?? 0;
    const emotion = ctx.emotion ?? 0.5;
    const jitter = loud * 0.05;
    return {
      color: { layer: "assertive", color: emotion >= 0.5 ? 0xff8800 : 0x33aaff },
      glow: { intensity: loud },
      position: { layer: "jitter", value: { x: jitter, y: jitter, z: 0 } },
    };
  },
};

/** #32 3次元カメラワーク文字。文字単位。位置・回転の主変形。 */
export const depthFlightSample: EffectElement = {
  id: "sample.depthFlight",
  displayName: "3次元カメラワーク文字",
  targetUnit: "char",
  startCondition: { trigger: "onUnitStart", selectionHints: ["granularity"] },
  operates: { position: "main", rotation: "main" },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const depth = ((ctx.gameTimeMs % 1000) / 1000) * 4 - 2;
    return {
      position: { layer: "main", value: { x: 0, y: 0, z: depth } },
      rotation: { layer: "main", value: { x: 0, y: 0.2, z: 0 } },
    };
  },
};

/** 充足性の証明に使う8演出の一覧（#23・#24〜#28・#30・#32）。 */
export const allSampleEffects: readonly EffectElement[] = [
  charSmashSample,
  letterSpacingSpreadSample,
  circularMultiplySample,
  verticalStretchSwirlSample,
  afterimageTrailSample,
  fadeBlackoutSample,
  emotionLoudnessSample,
  depthFlightSample,
];
