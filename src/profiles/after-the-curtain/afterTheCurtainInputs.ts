// アフター・ザ・カーテンの曲別手動入力。音楽地図から導出できないフィールドを与える（TAKEOVER の takeoverInputs.ts と同じ枠組み）。
//
// 値の決め方の根拠を先に述べる。
// - musicalKey と climaxAnchorMs は音楽地図ダンプ docs/analysis/after-the-curtain.songmap.json の解析から定める。
// - colors と sfx は作品仕様で全曲固定のため TAKEOVER と同じ値にする（理由は各フィールドのコメントに述べる）。
// - camera は曲の構造（見せ場・サビ）に合わせて手作りする（ユーザー確定の方針）。
// - diversityZoneLabels と ncTreatmentOverrides は省略し、生成層の自動決定（汎用ラベル・既定の埋め方規則）に任せる
//   （省略してよい根拠は各箇所のコメントに述べる）。
//
// 依存方針: スキーマの型と生成層の手動入力型だけを取り込み、中核・rendering・tools・three.js は取り込まない。

import type { ManualProfileInputs } from "../generate/buildProfile";
import type { CameraKeyframe } from "../schema/profileSchema";

/**
 * カメラ軌跡のキーフレーム（本編実データ）。
 * 時刻間隔は不均一にして速度に変化を与える。位置は深夜の湖を一方向に巡る開いた曲線で、第1サビ（70417ミリ秒）と
 * クライマックス（219617ミリ秒、最終サビの代表時刻）に節目の視点を置く。クライマックスでは視点を湖の中心（初音ミク）へ
 * 寄せる。理由を先に述べる。作品仕様 §5 は見せ場区間でカメラ軌跡を湖の中心へ偏らせ、灯しの分布を中心へ集中させると
 * 定めるためである。末尾時刻260740ミリ秒は曲長に一致させ、全ノーツがこの時刻範囲に収まるようにする（曲長の二重管理を
 * 避けるため、末尾キーフレームの時刻を曲長として公開する）。各時刻の軌跡上速度が正であること（停止区間が無いこと）は
 * afterTheCurtainInputs.test.ts が固定する。座標の大きさの基準は TAKEOVER と同じ舞台（同じ湖・同じ中心のミク）であり、
 * 中心から概ね前後左右30単位以内・高さ5から12単位の範囲に収める。
 */
export const afterTheCurtainCameraKeyframes: CameraKeyframe[] = [
  { timeMs: 0, position: { x: -28, y: 6, z: 28 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 36000, position: { x: -8, y: 9, z: 14 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 70417, position: { x: 18, y: 5, z: 14 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 142417, position: { x: 28, y: 7, z: -18 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 219617, position: { x: 0, y: 12, z: -32 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 260740, position: { x: -24, y: 7, z: 20 }, target: { x: 0, y: 2, z: 1 } },
];

/**
 * アフター・ザ・カーテンの曲長（ミリ秒）。
 * カメラ軌跡の末尾時刻を曲長に一致させているため、末尾キーフレームの時刻を曲長として公開し値の二重管理を避ける。
 * カメラ軌跡の診断・テストが掃引の上限に使う。
 */
export const AFTER_THE_CURTAIN_DURATION_MS =
  afterTheCurtainCameraKeyframes[afterTheCurtainCameraKeyframes.length - 1].timeMs;

export const afterTheCurtainInputs: ManualProfileInputs = {
  // 確定値: 序盤の調は D 短調。主音の音名クラスは D＝2。
  // 根拠を先に述べる。musicalKey は無和音「N」区間を音階へ解決する処理にのみ使われ、本曲の無和音区間のうち
  // 既定規則で音階へ倒れるのは曲頭の区間（直前の和音が無い索引0、0から545ミリ秒）だけである（他の無和音区間は
  // 直前に和音があるため直前和音を保持する）。よって musicalKey は曲頭の短い導入区間の音階だけを左右する。
  // 曲頭を含む序盤は Dm7 が最頻かつ最長（出現21回・通算約38秒で全和音中で最大）の和音であり、Bb・F・G7sus4・BbM7 と
  // 合わせて D 短調（その平行調 F 長調と構成音は同一）の音域である。平行調と構成音が同一のため、曲頭区間の音階解決は
  // D 短調と F 長調のどちらを選んでも同じ音の集合になる。最頻和音 Dm7 に合わせて D 短調を採る。
  musicalKey: { tonicPitchClass: 2, mode: "minor" },

  // 確定値: クライマックス（最終見せ場）の代表時刻。
  // 根拠を先に述べる。音楽地図のサビ区間のうち最後のサビ（219617から233377ミリ秒）の声量曲線の平均が、全サビ区間の中で
  // 最大（平均振幅24101、他のサビ区間は17868から20792）であり、ここが曲の最高潮である。よって最後のサビの開始時刻
  // 219617ミリ秒を代表時刻とする。
  climaxAnchorMs: 219617,

  // X軸の色。作品仕様 §6 は灯しの色を固定（蝶のネオンブルー・ひまわりの橙）と定め、§5 は色の調和を固定パレットで保つと
  // 定めるため、曲ごとに変えず TAKEOVER と同じ停止点（x=0 を青、x=0.5 を白、x=1 を橙）にする。先頭x=0・末尾x=1・昇順・
  // #RRGGBB を満たす。
  colors: {
    xAxisStops: [
      { x: 0, color: "#3ea8ff" },
      { x: 0.5, color: "#ffffff" },
      { x: 1, color: "#ff9a3e" },
    ],
  },

  // 操作音の音色。作品仕様 §4 は全レーン共通の単一の水滴音を全曲で洗練して使うと定めるため、曲ごとに音色を変えず
  // TAKEOVER と同じ値にする。通常時は撥弦系で持続音が無く減衰のみのため保持量0、立ち上がり4ミリ秒・減衰200ミリ秒・
  // 末尾余裕20ミリ秒、帯域は下限300ヘルツ・上限4500ヘルツ。投下時はのこぎり波で減衰をやや延ばし帯域上限を5000ヘルツへ上げる。
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

  // 実カメラ軌跡（上の afterTheCurtainCameraKeyframes）。
  camera: afterTheCurtainCameraKeyframes,

  // diversityZoneLabels は省略する。根拠を先に述べる。多様性逓減区間の境界と役割（主題・変奏・回帰）は音楽地図のサビ区間から
  // 自動決定され（generate 層の deriveDiversityZones）、ラベルは表示文言のみで採点に寄与しないため、省略時の汎用ラベルで足りる。
  // ncTreatmentOverrides も省略する。根拠を先に述べる。本曲の無和音区間は曲頭の索引0を除き全て直前に和音があり、既定規則で
  // 「直前和音を保持」に倒れる。連続する無和音区間も無く、既定規則が意図どおりに各区間を決めるため、上書きは要らない。
};
