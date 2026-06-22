// rendering 層の公開窓口。単一WebGL描画領域の土台（Issue #8）を集約する。
// 統括（src/app）はここから生成関数と型を取り込む。profiles・tools は import しない
// （依存規則 docs/decisions/architecture.md §5）。
export type { RenderRoot, RenderState, PerformanceLevelApplyResult } from "./renderRoot";
export type { BloomState } from "./bloom";
export type { CenterFigureStatus } from "./entities/centerFigure";
export { createRenderRoot } from "./renderRoot";
export { resolveReflectionResolution } from "./reflection";
export { createPerfBudget } from "./performanceBudget";
export type { PerfBudget, PerfBudgetDecision, PerfBudgetState } from "./performanceBudget";
export type { GlowPoints, GlowInstance, GlowPointsOptions } from "./entities/glowPoints";
export { createGlowPoints } from "./entities/glowPoints";
export type { SunflowerGeometry, SunflowerGeometryOptions } from "./entities/sunflowerGeometry";
export { createSunflowerGeometry } from "./entities/sunflowerGeometry";
export type { SunflowerFigures, SunflowerSetInput, SunflowerMetrics } from "./entities/sunflowerFigures";
export { createSunflowerFigures } from "./entities/sunflowerFigures";
export type { FallingLane, FallingLaneProbeNote } from "./fallingLane";
export { createFallingLane } from "./fallingLane";
