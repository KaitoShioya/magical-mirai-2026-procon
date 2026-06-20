// kineticText 副領域の公開窓口。troika製の3次元演出文字エンジンを集約する。
// 後続のM3演出Issue（#21〜#30・#32）はここから取り込む。profiles・tools は import しない
// （依存規則 docs/decisions/architecture.md §5）。

export { createKineticTextEngine } from "./engine";
export type { KineticTextEngineInternals } from "./engine";
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
  EngineUpdateArgs,
  EngineStats,
  KineticTextEngine,
} from "./types";
