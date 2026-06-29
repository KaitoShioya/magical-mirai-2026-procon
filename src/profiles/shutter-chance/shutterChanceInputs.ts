// シャッターチャンスの曲別手動入力（Issue #88 横展開）。songmap から導出できないフィールドを与える。
//
// 確定値の内訳を先に述べる。musicalKey と climaxAnchorMs は曲解析と作品仕様で定まる。camera・colors・sfx は
// 見栄え・聴感の調整余地があるため実装後のプレイ検証で調整しうる（★暫定）。diversityZoneLabels は曲固有の文言を
// 持たないため省略し、生成側が汎用ラベルを付ける。ncTreatmentOverrides は既定規則で全無和音区間が妥当に決まるため空にする。
//
// 依存方針: スキーマの型と生成層の手動入力型だけを取り込み、中核・rendering・tools・three.js は取り込まない
//（依存規則 docs/decisions/architecture.md §5）。TAKEOVER の takeoverInputs.ts と同じ構造に倣う。

import type { ManualProfileInputs } from "../generate/buildProfile";
import type { CameraKeyframe } from "../schema/profileSchema";

/**
 * カメラ軌跡のキーフレーム（本編実データ）。
 * 時刻間隔を不均一にして速度に変化を与える。位置は深夜の湖を一方向に巡る開いた曲線で、サビ群の節目に視点を置く。
 * 184000ミリ秒地点は最終回帰サビ（179900〜188200ミリ秒）の代表時刻でクライマックスに対応する。末尾時刻190470ミリ秒は
 * 曲長に一致させ、全ノーツがこの時刻範囲に収まるようにする。各時刻の軌跡上速度が正であること（停止区間が無いこと）は
 * shutterChanceInputs.test.ts が固定する。見栄え（滑らかさ・構図）の調整は実機検証で行う。★暫定。
 */
export const shutterChanceCameraKeyframes: CameraKeyframe[] = [
  { timeMs: 0, position: { x: -28, y: 5, z: 28 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 11000, position: { x: -8, y: 9, z: 9 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 53000, position: { x: 18, y: 4, z: 14 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 110000, position: { x: 26, y: 7, z: -18 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 184000, position: { x: 0, y: 12, z: -32 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 190470, position: { x: -20, y: 6, z: 16 }, target: { x: 0, y: 2, z: 1 } },
];

/**
 * シャッターチャンスの曲長（ミリ秒）。
 * カメラ軌跡の末尾時刻を曲長に一致させているため、末尾キーフレームの時刻を曲長として公開し値の二重管理を避ける。
 */
export const SHUTTER_CHANCE_DURATION_MS =
  shutterChanceCameraKeyframes[shutterChanceCameraKeyframes.length - 1].timeMs;

export const shutterChanceInputs: ManualProfileInputs = {
  // 確定値: 調はト短調。確定方法を先に述べる。楽曲は主和音で終止するため、終端の最後の有音和音が主和音である。
  // 和音列の末尾の有音和音は Gm7 であり、各サビ開始（Cm9＝iv・Bb7＝III・Gm7＝i）も Gm 終止へ収束する。
  // よって主音はソ（音名クラス7）・短調。無和音区間を調の音階へ解決するときに使う。
  musicalKey: { tonicPitchClass: 7, mode: "minor" },

  // 確定値: クライマックス（最終見せ場）の代表時刻。出典 docs/decisions/app-overall-decisions.md §3.5。
  // 最終回帰サビ区間は179900〜188200ミリ秒で、その中心（約184050ミリ秒）に近い清書値184000を採る。区間内かつ曲長以内。
  climaxAnchorMs: 184000,

  // 実カメラ軌跡（上の shutterChanceCameraKeyframes）。
  camera: shutterChanceCameraKeyframes,

  // X軸の色。世界観の二色を横方向の両端に対応させ、x=0を蝶のネオンブルー、x=1をひまわりの橙、中間を白でつなぐ。
  // 色は世界観由来で曲非依存のため TAKEOVER と同値を採る。先頭x=0・末尾x=1・昇順・#RRGGBB を満たす。★暫定。
  colors: {
    xAxisStops: [
      { x: 0, color: "#3ea8ff" },
      { x: 0.5, color: "#ffffff" },
      { x: 1, color: "#ff9a3e" },
    ],
  },

  // 操作音の音色。撥弦系で持続音が無く減衰のみのため保持量（sustain）は0、立ち上がり4ミリ秒・減衰200ミリ秒・末尾余裕
  // 20ミリ秒、帯域は楽曲低音と歌声基音に重ねない下限300ヘルツ・耳障りな高次倍音を抑える上限4500ヘルツとする。投下時は
  // 倍音を増やし存在感を出すためのこぎり波にし減衰をやや延ばし帯域上限を5000ヘルツへ上げる。操作音の根拠は曲非依存の
  // ため TAKEOVER と同値を採る。★暫定。
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

  // 多様性逓減区間のラベルは省略する。理由を先に述べる。シャッターチャンスのサビ区間は10個で、境界と役割（先頭=主題・
  // 末尾=回帰・中間=変奏）は songmap のサビ区間から自動決定される（Issue #42・diversityZones.ts）。曲固有の文言を
  // 捏造しないため上書きを与えず、生成側が汎用ラベル「第N反復区間（役割）」を付ける。

  // 無和音区間の埋め方の上書きは無し（空）。理由を先に述べる。無和音区間（和音索引0・50・113・145・148・182）は
  // 既定規則（直前が非無和音なら直前和音保持、曲頭または直前も無和音なら調の音階）で全て妥当に決まる。索引0は曲頭で
  // 調の音階＝ト短調主和音 Gm へ解決し、他5区間は直前が有音和音のため直前和音保持となる。よって上書き不要。
  ncTreatmentOverrides: {},
};
