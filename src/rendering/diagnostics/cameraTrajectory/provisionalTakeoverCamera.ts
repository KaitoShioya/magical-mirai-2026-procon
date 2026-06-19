// 受け入れ診断専用の暫定カメラキーフレーム（Issue #13）。
// これは検証のための仮データであり、本編は参照しない。実データは Issue #46（TAKEOVER曲プロファイル）が
// 生成し、本編プレイ中の駆動は Issue #59 が行う。本ファイルは #46 完了時に削除または置換する。
// 曲長237250ミリ秒は docs/analysis/takeover.songmap.json の duration に一致させ、位置は試作
// （docs/poc/src/prototype/main.js）の軌跡を開いた曲線へ広げたもの。
import type { CameraTrajectoryKeyframe } from "../../../utils/cameraTrajectory";

/** TAKEOVERの曲長（ミリ秒）。出典 docs/analysis/takeover.songmap.json の duration。 */
export const TAKEOVER_DURATION_MS = 237250;

/** 検証専用の暫定キーフレーム。時刻間隔は不均一（速度変動を診断に含めるため）。 */
export const PROVISIONAL_TAKEOVER_CAMERA: readonly CameraTrajectoryKeyframe[] = [
  { timeMs: 0, position: { x: -30, y: 5, z: 30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 24000, position: { x: -10, y: 8, z: 10 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 60000, position: { x: 15, y: 4, z: 12 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 120000, position: { x: 25, y: 6, z: -20 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 189000, position: { x: 0, y: 11, z: -34 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: TAKEOVER_DURATION_MS, position: { x: -22, y: 7, z: 18 }, target: { x: 0, y: 2, z: 1 } },
];
