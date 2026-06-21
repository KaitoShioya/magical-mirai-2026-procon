// TAKEOVER曲プロファイルの手動定義（Issue #46）。
// 解析データから機械的に導けない、人が決める内容だけをここに置く。責務ごとに独立した名前付き定義に分ける。
// 値は採用理由を先に述べてから示す。実装後のプレイ検証や見栄え調整で変える見積もり値は ★暫定、
// 標準仕様・作品仕様・解析事実で固定される値は ☆確定 とする。
//
// 依存方針: 本ファイルは曲非依存の中核（engine 等）を取り込まない。スキーマの型だけを取り込む
// （src/profiles/README.md の依存規則）。

import type {
  CameraKeyframe,
  DiversityRole,
  MusicalKey,
  NcTreatment,
  Sfx,
  TapColors,
} from "../schema/profileSchema";

/** 楽曲ロード設定 SONGS で曲を引くキー。☆確定（src/config/songs.ts と一致）。 */
export const TAKEOVER_SONG_KEY = "takeover";

/**
 * 代表テンポ（毎分拍数）。
 * 拍ごとの正確な時刻は beats が持つため、ここでは曲全体の代表値だけを置く。
 * docs/decisions/app-overall-decisions.md と profileSchema.ts が175を代表テンポとする。★暫定。
 */
export const TAKEOVER_TEMPO_BPM = 175;

/**
 * 楽曲の調。
 * 無和音区間の音階埋め（#37）が参照する。TAKEOVERはファ短調で、主音の音名クラスはファ＝5。
 * 出典 profileSchema.ts の MusicalKey 注釈・docs/research/07-feasibility-and-parameters.md §1.1。☆確定。
 */
export const TAKEOVER_MUSICAL_KEY: MusicalKey = { tonicPitchClass: 5, mode: "minor" };

/**
 * 無和音区間（コード名 "N"）の索引ごとの埋め方。
 * 既定は直前和音の保持（previous）。ただし曲頭の索引0は直前和音が無いため調の音階（scale）、
 * 歌唱中の実質的な欠落である索引24も調の音階（scale）とする。
 * この対応はファ短調で Fm/Eb/Fm/Eb/Fm/Fm に解決する（noChordResolution の独立テストが固定する解）。
 * 出典 docs/research/07-feasibility-and-parameters.md §1.2。☆確定（実データの無和音6区間に対応）。
 */
export const takeoverNoChordTreatments: Readonly<Record<number, NcTreatment>> = {
  0: "scale",
  22: "previous",
  24: "scale",
  99: "previous",
  170: "previous",
  209: "previous",
};

/**
 * 多様性逓減区間の役割ごとのラベル。
 * 区間の時刻は反復区間（サビ）から写すため手動で持たず、役割を表す短い文字列だけをここに置く。
 * 第1サビと第3サビは「Clap to the Beat」を主題と回帰として持ち、第2サビは中盤の見せ場（変奏）に当たる
 * （docs/decisions/app-overall-decisions.md §3.5）。☆確定。
 */
export const takeoverDiversityLabels: Readonly<Record<DiversityRole, string>> = {
  theme: "第1サビ Clap to the Beat（主題）",
  variation: "第2サビ（変奏）",
  reprise: "第3サビ Clap to the Beat（回帰）",
};

/**
 * カメラ軌跡のキーフレーム（本編実データ）。
 * 時刻間隔は不均一にして速度に変化を与える。位置は深夜の湖を一方向に巡る開いた曲線で、
 * 24秒地点（主題のClap）と189秒地点（回帰のClap、見せ場の最終アンカー）に節目の視点を置く。
 * 末尾時刻237250ミリ秒は曲長に一致させ、全ノーツがこの時刻範囲に収まるようにする。
 * Issue #13 の受け入れ診断（16ミリ秒掃引で軌跡上速度が正）を通した暫定値を本編実キーフレームへ移管した。
 * 見栄え（滑らかさ・構図）の確認は Issue #59 で行う。★暫定。
 */
export const takeoverCameraKeyframes: CameraKeyframe[] = [
  { timeMs: 0, position: { x: -30, y: 5, z: 30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 24000, position: { x: -10, y: 8, z: 10 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 60000, position: { x: 15, y: 4, z: 12 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 120000, position: { x: 25, y: 6, z: -20 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 189000, position: { x: 0, y: 11, z: -34 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 237250, position: { x: -22, y: 7, z: 18 }, target: { x: 0, y: 2, z: 1 } },
];

/**
 * 曲長（ミリ秒）。
 * カメラ軌跡の末尾時刻を曲長に一致させているため、末尾キーフレームの時刻を曲長として公開し、
 * 値の二重管理を避ける。診断ページ（cameraTrajectory）が掃引の上限に使う。☆確定（237250）。
 */
export const TAKEOVER_DURATION_MS =
  takeoverCameraKeyframes[takeoverCameraKeyframes.length - 1].timeMs;

/**
 * タップ効果のX軸の色。
 * 得点には寄与せず（消費側 #71 が停止点を補間する）、世界観の二色を横方向の両端に対応させる。
 * x=0を蝶のネオンブルー、x=1をひまわりの橙、中間を白でつなぐ。先頭x=0・末尾x=1・昇順・#RRGGBB を満たす。★暫定。
 */
export const takeoverTapColors: TapColors = {
  xAxisStops: [
    { x: 0, color: "#3ea8ff" },
    { x: 0.5, color: "#ffffff" },
    { x: 1, color: "#ff9a3e" },
  ],
};

/**
 * 操作音の音色（通常時と投下時）。
 * 通常時は操作音エンジンの調整値（src/audio/synthConstants.ts）に揃える。撥弦系で持続音が無く減衰のみのため
 * 保持量（sustain）は0、立ち上がり4ミリ秒・減衰200ミリ秒・末尾余裕20ミリ秒とする。帯域は楽曲低音と歌声基音に
 * 重ねないため下限300ヘルツ、耳障りな高次倍音を抑えるため上限4500ヘルツとする。
 * 投下時は倍音を増やして存在感を出すため、のこぎり波にし減衰をやや延ばし帯域上限を5000ヘルツへ上げる。
 * 投下時の作り込みは Issue #53 で深める。通常時 ☆確定（エンジンと同根拠）／投下時 ★暫定。
 */
export const takeoverOperationSound: Sfx = {
  normal: {
    waveform: "triangle",
    envelope: { attackMs: 4, decayMs: 200, sustain: 0, releaseMs: 20 },
    bandpassLowHz: 300,
    bandpassHighHz: 4500,
  },
  powerUp: {
    waveform: "sawtooth",
    envelope: { attackMs: 4, decayMs: 250, sustain: 0, releaseMs: 20 },
    bandpassLowHz: 300,
    bandpassHighHz: 5000,
  },
};
