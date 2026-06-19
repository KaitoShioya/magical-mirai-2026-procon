// 曲プロファイルのスキーマ（型の契約）と実行時バリデータの公開窓口。
// 生成スクリプト（#45）・TAKEOVERプロファイル（#46）・検証ゲート（#96）はここから型と検証関数を取り込む。
// profiles は中核（engine 等）を import しない（依存規則 docs/decisions/architecture.md §5）。

export type {
  SongProfile,
  SongIdentity,
  ProfileSource,
  MusicalKey,
  Beat,
  Chord,
  RepetitiveSegment,
  LoudnessCurve,
  EmotionCurve,
  EmotionPoint,
  LyricChar,
  LyricDensity,
  LyricDensityWindow,
  NcRange,
  NcTreatment,
  Showcase,
  ChordToneSlotRegion,
  Note,
  CameraKeyframe,
  TapColors,
  ColorStop,
  Sfx,
  SfxTimbre,
  Envelope,
  Waveform,
  DiversityZone,
  DiversityRole,
  TapBudget,
  Vec3,
} from "./profileSchema";
export type { ValidationResult, ValidationError } from "./validateProfile";
export { validateProfile } from "./validateProfile";
