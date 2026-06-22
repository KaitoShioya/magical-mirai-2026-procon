// scoring の公開窓口。タップ判定エンジン（Issue #48）の型と関数に加え、反応強度（Issue #51）・多様性係数（Issue #42）・
// ゲージと投下（Issue #54）・較正の保存（Issue #50）の型と関数をまとめて再輸出する。得点合成・ランク（#55・#56）は追加時に本ファイルへ再輸出を足す。

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
export {
  loadCalibrationOffsetMs,
  saveCalibrationOffsetMs,
  clearCalibrationOffset,
  CALIBRATION_STORAGE_KEY,
} from "./calibrationStore";
export { reactionStrength, type ReactionStrength } from "./reactionStrength";
export {
  computeDiversityCoefficient,
  type DiversityCoefficientInput,
  type DiversityCoefficientOptions,
} from "./diversityCoefficient";
export {
  DEFAULT_GAUGE_CONFIG,
  gaugeGain,
  accumulateGauge,
  deploymentMultiplier,
  deploy,
  type GaugeConfig,
  type DeployResult,
} from "./gauge";
