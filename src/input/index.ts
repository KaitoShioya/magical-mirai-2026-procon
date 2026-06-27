// input 層の公開窓口。画面座標の純粋関数群と入力ファクトリを集約する。
// 統括（src/app）と診断ページはここから関数と型を取り込む。
// 依存規則（docs/decisions/architecture.md §5）に従い、profiles・tools・rendering・three.js は import しない。

export type { PointerInputSource, RectLike } from "./coordinateMapping";
export {
  clamp01,
  inputSourceFromPointerType,
  mapToReactionCore,
  normalizePointerPosition,
  resolveSlotCount,
  slotIndexFromNormalizedX,
} from "./coordinateMapping";
export type { Input, InputOptions, InputSource, Reaction } from "./pointerInput";
export { createInput } from "./pointerInput";
export type {
  JudgeWindowsDistance,
  JudgeWindowsMs,
  TrajectoryTimingSource,
} from "./timingTranslation";
export {
  noteDistanceWindows,
  timeWindowToDistance,
  trajectoryDistanceFromNote,
} from "./timingTranslation";
