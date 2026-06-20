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
export { DEFAULT_ORIENTATION } from "./orientation";
export type { OrientationPolicy, OrientationMode, PhraseOrientationGranularity } from "./orientation";
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
} from "./types";
