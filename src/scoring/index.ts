// scoring の公開窓口。タップ判定エンジン（Issue #48）の型と関数に加え、反応強度（Issue #51）と多様性係数（Issue #42）の
// 型と関数をまとめて再輸出する。得点合成・ランク（#55・#56）は追加時に本ファイルへ再輸出を足す。

export type {
  JudgmentWindows,
  JudgmentNote,
  TapSample,
  FrameTimeSample,
  JudgmentResult,
} from "./types";
export { DEFAULT_JUDGMENT_WINDOWS } from "./defaultWindows";
export { centeredDiffMs, timingAccuracy, isTimingJust } from "./timingAccuracy";
export { pitchAccuracy, isPitchJust, PITCH_MISS_FLOOR } from "./pitchAccuracy";
export { tapMusicTimeMs } from "./tapMusicTime";
export { judgeTap, type JudgeOptions } from "./tapJudgment";
export { reactionStrength, type ReactionStrength } from "./reactionStrength";
export {
  computeDiversityCoefficient,
  type DiversityCoefficientInput,
  type DiversityCoefficientOptions,
} from "./diversityCoefficient";
