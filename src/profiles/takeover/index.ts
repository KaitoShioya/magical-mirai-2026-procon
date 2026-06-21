// TAKEOVER曲プロファイル（Issue #46）の公開窓口。
// 組み立て関数・その入力型・手動定義を再エクスポートする。完成プロファイルJSON
// （takeover.profile.json）の取り込みと起動時の検証は本Issueでは行わない。アーキテクチャ3.6節に従い、
// 読み込んで本編でカメラを駆動する結線は Issue #59 が担う。

export { buildTakeoverProfile, type TakeoverSongmap } from "./buildTakeoverProfile";
export {
  TAKEOVER_DURATION_MS,
  TAKEOVER_MUSICAL_KEY,
  TAKEOVER_SONG_KEY,
  TAKEOVER_TEMPO_BPM,
  takeoverCameraKeyframes,
  takeoverDiversityLabels,
  takeoverNoChordTreatments,
  takeoverOperationSound,
  takeoverTapColors,
} from "./manualData";
