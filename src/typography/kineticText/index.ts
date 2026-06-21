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
// 演出合成エンジン（#131）。複数演出の属性寄与を固定順序で1つの最終文字状態へ畳む合成器、
// 費用合算と縮退指示、合成結果を取っ手へ1回反映する適用層。本編ループへの結線は #33・#59 が行う。
export { composeGlyphState } from "./effectCompositor";
export type { ComposeInput, ContributionEntry, DegradeDirective } from "./effectCompositor";
export type { ComposedGlyphState } from "./composedGlyphState";
export { accountBudget, planDegrade } from "./effectBudget";
export type {
  EffectMeasure,
  BudgetUnit,
  BudgetCaps,
  BudgetTotals,
  CostDifference,
  BudgetReport,
  UnitDirective,
} from "./effectBudget";
export { createCompositionTarget } from "./effectCompositionApplier";
export type { CompositionTarget, CompositionTargetDeps } from "./effectCompositionApplier";
// プール枯渇の検出。複製の写しの確保失敗を駆動・診断側が判定するために使う（#131 の適用層へ null で渡す）。
export { isPlaceholderHandle } from "./engine";

// 個別演出（#130 の基盤の上に登録する実演出）。Issue #23 1文字1拍スマッシュ。
// 本番レジストリへの登録は割付（#132）・譜面（#33）が行うため、ここでは演出要素を公開するにとどめる。
export { charSmash } from "./effects/charSmash";
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
// 演出割付規則（#132）。#29 の表示粒度プランを既定の演出群へ写像する曲非依存の純粋ロジック。
// 後続の曲固有譜面（#33）・本編結線（#59）が割付プランの型と関数を取り込む。EFFECT_ID は
// #24〜#32 の各実演出が識別名に使う命名契約のため値として輸出する。
export {
  buildAssignmentPlan,
  assignmentAt,
  activeAssignmentsAt,
  resolveSegmentAssignments,
  defaultRulesFor,
  signalAvailabilityFrom,
  findAssignmentPlanIssues,
  EFFECT_ID,
  DEFAULT_OVERLAY_RULES,
  EFFECT_PRIORITY_SHORT_DENSE_RUSH_ADJUST,
  EFFECT_PRIORITY_BOUNDARY_BLACKOUT_ADJUST,
} from "./effectAssignment";
export type {
  EffectGrammar,
  SignalAvailability,
  DefaultEffectRule,
  EffectAssignmentStatus,
  EffectAssignment,
  SegmentAssignment,
  AssignmentPlan,
  GranularityOverrides,
  AssignmentPlanInput,
  AssignmentPlanIssue,
} from "./effectAssignment";
// 曲固有譜面の適用と最終優先度の確定（#33）。割付プランへタイポ譜面を適用し確定割付プランを作る。
export {
  resolveTypographyChart,
  computeFinalPriority,
  resolvedSegmentAt,
  activeResolvedAssignmentsAt,
  findUnknownChartEffectIds,
} from "./typographyChartResolve";
export type {
  ResolvedEffectAssignment,
  ResolvedSegment,
  ResolvedAssignmentPlan,
} from "./typographyChartResolve";
// 読ませる役のレイアウトと被覆判定（#33）。表示領域に収まる区間へ落とし、被覆を検証する。
export {
  estimateTextPixelWidth,
  regionPixelWidth,
  fitsWithinRegion,
  buildReadingSpansForPhrase,
  readingSpanAt,
  buildReadingSpansByPhrase,
  createPlacementResolver,
  clampReadingPixelHeight,
  findReadingCoverageGaps,
  READING_CHAR_ADVANCE_FACTOR,
  READING_FIT_SAFETY_MARGIN,
  READING_COVERAGE_SAMPLE_STEP_MS,
} from "./readingLayout";
export type {
  ReadingSpan,
  ReadingSpansByPhrase,
  ReadingLayoutOptions,
  ReadingPlacementResolved,
  ReadingHeightClamp,
} from "./readingLayout";
// 駆動部（指揮者、#33）と内容組み立て、世界座標への配置。本Issueのプレイ結線と本編結線（#59）が使う。
export { createConductor } from "./conductor";
export type {
  Conductor,
  ConductorDeps,
  ConductorEngineLike,
  ConductorPlacement,
  ConductorContent,
} from "./conductor";
export { prepareConductorContent, LOUDNESS_SAMPLE_STEP_MS } from "./conductorContent";
export type { PrepareConductorContentParams } from "./conductorContent";
export {
  createCameraPlacement,
  screenRatioToWorld,
  readingStartWorldPosition,
  worldFontSizeForPixelHeightPure,
} from "./cameraPlacement";
export type { CameraFrame, CameraPlacementOptions, PerspectiveCameraLike } from "./cameraPlacement";
