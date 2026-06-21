// kineticText 副領域の公開窓口。troika製の3次元演出文字エンジンを集約する。
// 後続のM3演出Issue（#21〜#30・#32）はここから取り込む。profiles・tools は import しない
// （依存規則 docs/decisions/architecture.md §5）。

export { createKineticTextEngine } from "./engine";
export type { KineticTextEngineInternals } from "./engine";
// 変形テキストの公開窓口は createDeformingTextUnit のみとする。低レベルの createDeformMaterial と
// buildBaseDeformTransform は取り込み層が前提のため単独利用で劣化する。よって窓口には出さず、内部とテストから
// 直接の取り込み（"./deformMaterial"）に留める。
export { createDeformingTextUnit } from "./deformMaterial";
export type { DeformingTextUnit } from "./deformMaterial";
export { createFontRegistry } from "./fontRegistry";
export { warmUpFont } from "./warmup";
export { createGlyphAnimation } from "./glyphAnimation";
export type {
  AnimationKeyframe,
  GlyphAnimationSpec,
  GlyphAnimationPhase,
  GlyphAnimation,
  AnimationTimeline,
  GlyphAnimationInternals,
} from "./glyphAnimation";
export {
  computeMaxConcurrent,
  computeSingleLayerLimit,
  computeBatchedLayerLimit,
} from "./layerLimits";
export { ZEN_KAKU_GOTHIC_NEW_CREDIT } from "./fontCredits";
// 可読性の計算（純粋関数）と既定値。#131 はこれらを取り込んで合成の各段で適用する。
// troika への反映部分（readabilityRenderer）は本体側の利用に限るため公開しない。
export {
  srgbChannelToLinear,
  linearChannelToSrgb,
  srgbHexToChannels,
  srgbChannelsToHex,
  relativeLuminanceFromSrgbHex,
  contrastRatio,
  clampLuminanceSrgbHex,
  minWorldFontSize,
  projectedPixelHeight,
  resolveReadabilityMode,
  resolveReadabilityStyle,
  DEFAULT_READABILITY_OPTIONS,
} from "./readability";
export {
  buildGranularityPlan,
  granularityAt,
  findGranularityPlanIssues,
} from "./granularity";
export type {
  Granularity,
  GranularityReason,
  GranularityUnitRef,
  GranularitySegment,
  GranularityPlan,
  GranularityPlanIssue,
  LoudnessCurveInput,
  SectionRange,
  GranularityInput,
} from "./granularity";
export { DEFAULT_ORIENTATION } from "./orientation";
export type { OrientationPolicy, OrientationMode, PhraseOrientationGranularity } from "./orientation";
// 演出要素の登録・共通インターフェース基盤（#130）。後続の合成（#131）・割付（#132）・個別演出
// （#23・#24〜#28・#30・#32）はこれらの型と登録の仕組みを取り込み、本基盤を改変せず追加する。
export { createEffectRegistry, validateEffectElement, findContributionIssues } from "./effectElement";
export type {
  EffectTargetUnit,
  TransformLayer,
  ColorLayer,
  OperatedAttributes,
  EffectCostInput,
  EffectCost,
  EffectPriority,
  UnitLifecyclePhase,
  ConditionDimension,
  StartCondition,
  TransformContribution,
  ScaleContribution,
  LetterSpacingContribution,
  ColorContribution,
  GlowContribution,
  OpacityContribution,
  DeformContribution,
  DuplicateCopy,
  DuplicationContribution,
  AttributeContribution,
  EffectContext,
  EffectElement,
  EffectElementIssue,
  EffectRegistry,
} from "./effectElement";
export type {
  FontCredit,
  FontEntry,
  FontRegistry,
  LayerLimits,
  EngineInitDeps,
  Vector3Like,
  GlyphSpawnRequest,
  PhraseSpawnRequest,
  GlyphHandle,
  DeformKind,
  DeformParams,
  DeformingTextSpawnRequest,
  DeformingTextHandle,
  EngineUpdateArgs,
  EngineStats,
  KineticTextEngine,
  ReadabilityOptions,
  ReadabilityCapability,
  ReadabilityMode,
  ReadabilityBacking,
  ResolvedReadabilityStyle,
} from "./types";
