// rendering 層の公開窓口。単一WebGL描画領域の土台（Issue #8）を集約する。
// 統括（src/app）はここから生成関数と型を取り込む。profiles・tools は import しない
// （依存規則 docs/decisions/architecture.md §5）。
export type { RenderRoot, RenderState } from "./renderRoot";
export { createRenderRoot } from "./renderRoot";
export { resolveReflectionResolution } from "./reflection";
export type { GlowPoints, GlowInstance, GlowPointsOptions } from "./entities/glowPoints";
export { createGlowPoints } from "./entities/glowPoints";
