// TAKEOVER の曲別手動入力。songmap から導出できないフィールドを与える（Issue #45 が枠組みを用意し、Issue #46 が実内容を確定）。
//
// 確定値の内訳を先に述べる。musicalKey と climaxAnchorMs は作品仕様・曲解析で定まる。camera・colors・sfx・
// diversityZones・無和音区間の埋め方の上書きは、Issue #45 が検証を通すための暫定値で埋めていたものを、Issue #46 が
// 実内容へ置き換えた。camera と diversityZones と操作音は見栄え・聴感の調整余地があるため、実装後のプレイ検証で
// 調整しうる（★暫定）。
//
// 依存方針: スキーマの型と生成層の手動入力型だけを取り込み、中核・rendering・tools・three.js は取り込まない。

import type { ManualProfileInputs } from "../generate/buildProfile";
import type { CameraKeyframe } from "../schema/profileSchema";

/**
 * カメラ軌跡のキーフレーム（本編実データ）。
 * 時刻間隔は不均一にして速度に変化を与える。位置は深夜の湖を一方向に巡る開いた曲線で、24秒地点（主題のClap）と
 * 189秒地点（回帰のClap、最終見せ場の代表時刻）に節目の視点を置く。末尾時刻237250ミリ秒は曲長に一致させ、全ノーツが
 * この時刻範囲に収まるようにする。各時刻の軌跡上速度が正であること（停止区間が無いこと）は takeoverInputs.test.ts が固定する。
 * Issue #13 の受け入れ診断（16ミリ秒掃引で軌跡上速度が正）を通した値を本編実キーフレームへ移管した。見栄え（滑らかさ・構図）の
 * さらなる調整は Issue #32（3Dカメラワーク文字演出）と Issue #59（実データでの視認品質）で行う。★暫定。
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
 * TAKEOVER の曲長（ミリ秒）。
 * カメラ軌跡の末尾時刻を曲長に一致させているため、末尾キーフレームの時刻を曲長として公開し値の二重管理を避ける。
 * カメラ軌跡の診断ページが掃引の上限に使う。
 */
export const TAKEOVER_DURATION_MS = takeoverCameraKeyframes[takeoverCameraKeyframes.length - 1].timeMs;

export const takeoverInputs: ManualProfileInputs = {
  // 確定値: TAKEOVER の調はファ短調。主音の音名クラスはファ＝5。出典 docs/research/07-feasibility-and-parameters.md §1.2。
  musicalKey: { tonicPitchClass: 5, mode: "minor" },

  // 確定値: クライマックス（最終見せ場）の代表時刻。出典 docs/decisions/app-overall-decisions.md §3.5（189秒地点の回帰）。
  climaxAnchorMs: 189000,

  // 実カメラ軌跡（上の takeoverCameraKeyframes）。Issue #45 の自動の暫定2点直線軌跡を置き換える。
  camera: takeoverCameraKeyframes,

  // X軸の色。世界観の二色を横方向の両端に対応させ、x=0を蝶のネオンブルー、x=1をひまわりの橙、中間を白でつなぐ。
  // 先頭x=0・末尾x=1・昇順・#RRGGBB を満たす。得点には寄与せず、消費側 Issue #71 が停止点を補間する。★暫定。
  colors: {
    xAxisStops: [
      { x: 0, color: "#3ea8ff" },
      { x: 0.5, color: "#ffffff" },
      { x: 1, color: "#ff9a3e" },
    ],
  },

  // 操作音の音色。通常時は操作音エンジン（src/audio/synthConstants.ts）と同根拠で、撥弦系で持続音が無く減衰のみのため
  // 保持量（sustain）は0、立ち上がり4ミリ秒・減衰200ミリ秒・末尾余裕20ミリ秒、帯域は楽曲低音と歌声基音に重ねない下限
  // 300ヘルツ・耳障りな高次倍音を抑える上限4500ヘルツとする。投下時は倍音を増やし存在感を出すためのこぎり波にし減衰を
  // やや延ばし帯域上限を5000ヘルツへ上げる。投下時の作り込みは Issue #53 で深める。★暫定。
  sfx: {
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
  },

  // 多様性逓減区間のラベルの曲別上書き。境界と役割は songmap のサビ区間から自動抽出する（Issue #42）。
  // 設計判断の正典 docs/decisions/app-overall-decisions.md §3.5 が「進化の刻みは反復区間に同期させる」と定めるため、
  // 時刻順に主題・変奏・回帰が割り当たる。第1サビと第3サビは歌詞「Clap to the Beat」を主題と回帰として含み、
  // 第2サビは中盤の見せ場（変奏）に当たる。曲固有の文言だけをここで与える。
  diversityZoneLabels: [
    "第1サビ Clap to the Beat（主題）",
    "第2サビ（変奏）",
    "第3サビ Clap to the Beat（回帰）",
  ],

  // 無和音区間の埋め方の上書き。和音索引24（歌唱中の実質的な無和音）を docs/research/07-feasibility-and-parameters.md §1.2 に
  // 従い「調の音階」へ上書きする。既定規則ではこの区間は直前に非無和音の和音が隣接するため「直前和音を保持」になるが、
  // 歌唱の区切りであるため調の主和音へ倒す。他の無和音区間（曲頭の索引0は直前和音が無く調の音階、索引22・99・170・209は
  // 直前和音を保持）は既定規則のままで意図通りに決まる。
  ncTreatmentOverrides: { 24: "scale" },
};
