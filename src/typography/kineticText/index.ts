// kineticText 副領域の公開窓口。troika製の3次元演出文字エンジンを集約する。
// 後続のM3演出Issue（#21〜#30・#32）はここから取り込む。profiles・tools は import しない
// （依存規則 docs/decisions/architecture.md §5）。

export { createKineticTextEngine } from "./engine";
export type { KineticTextEngineInternals } from "./engine";
export { createFontRegistry } from "./fontRegistry";
export { warmUpFont } from "./warmup";
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
  ReadabilityOptions,
  ReadabilityCapability,
  ReadabilityMode,
  ReadabilityBacking,
  ResolvedReadabilityStyle,
} from "./types";
