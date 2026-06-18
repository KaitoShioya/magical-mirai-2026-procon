// engine 層の公開窓口。曲非依存の中核（時計・固定時間刻みスケジューラ・進行状態・ループ）を集約する。
// 統括（src/app）はここから生成関数と型を取り込む。profiles・tools は import しない（依存規則 docs/decisions/architecture.md §5）。

export type { TimeSource } from "./timeSource";
export type { Clock, ClockSample } from "./clock";
export { createClock } from "./clock";
export type { Scheduler, AdvanceResult } from "./scheduler";
export { createScheduler } from "./scheduler";
export type { World } from "./world";
export { createWorld } from "./world";
export type { Environment } from "./environment";
export { createBrowserEnvironment } from "./environment";
export type {
  Loop,
  LoopOptions,
  LoopState,
  FrameDeps,
  FrameInput,
  FrameOutcome,
} from "./loop";
export { createLoop, advanceFrame } from "./loop";
