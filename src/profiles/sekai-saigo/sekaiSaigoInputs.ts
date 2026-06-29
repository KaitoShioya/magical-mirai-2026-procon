// 世界最後の音楽隊の曲別手動入力。音楽地図から導出できないフィールドを与える（TAKEOVER の takeoverInputs.ts と同じ枠組み）。
//
// 値の決め方の根拠を先に述べる。
// - musicalKey と climaxAnchorMs は音楽地図ダンプ docs/analysis/sekai-saigo.songmap.json の解析から定める。
// - colors と sfx は作品仕様で全曲固定のため TAKEOVER と同じ値にする（理由は各フィールドのコメントに述べる）。
// - camera は曲の構造（見せ場・サビ）に合わせて手作りする（ユーザー確定の方針。本曲はカメラ軌跡のみ専用に作る）。
// - diversityZoneLabels と ncTreatmentOverrides は省略し、生成層の自動決定（汎用ラベル・既定の埋め方規則）に任せる
//   （省略してよい根拠は各箇所のコメントに述べる）。
//
// 依存方針: スキーマの型と生成層の手動入力型だけを取り込み、中核・rendering・tools・three.js は取り込まない。

import type { ManualProfileInputs } from "../generate/buildProfile";
import type { CameraKeyframe } from "../schema/profileSchema";

/**
 * カメラ軌跡のキーフレーム（本編実データ）。本曲のために専用に設計する。
 * 時刻間隔は不均一にして速度に変化を与える。位置は深夜の湖を一方向に巡る開いた曲線で、第1サビ入り（67380ミリ秒）と
 * 最終サビのクライマックス（191600ミリ秒、climaxAnchorMs と同時刻）に節目の視点を置く。クライマックスでは視点を湖の中心
 * （初音ミク）へ寄せ高さを上げる。理由を先に述べる。作品仕様 §5 は見せ場区間でカメラ軌跡を湖の中心へ偏らせ、灯しの分布を
 * 中心へ集中させると定めるためである。末尾時刻249600ミリ秒は曲長に一致させ、全ノーツがこの時刻範囲に収まるようにする
 *（曲長の二重管理を避けるため、末尾キーフレームの時刻を曲長として公開する）。各時刻の軌跡上速度が正であること（停止区間が
 * 無いこと）は sekaiSaigoInputs.test.ts が固定する。座標の大きさの基準は TAKEOVER と同じ舞台（同じ湖・同じ中心のミク）であり、
 * 中心から概ね前後左右30単位以内・高さ5から12単位の範囲に収める。★暫定（見栄えは実装後のプレイ検証で調整しうる）。
 */
export const sekaiSaigoCameraKeyframes: CameraKeyframe[] = [
  { timeMs: 0, position: { x: -30, y: 5, z: 30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 67380, position: { x: -9, y: 9, z: 13 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 125000, position: { x: 19, y: 5, z: 15 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 185576, position: { x: 27, y: 7, z: -17 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 191600, position: { x: 5, y: 12, z: -31 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 249600, position: { x: -26, y: 7, z: 21 }, target: { x: 0, y: 2, z: 1 } },
];

/**
 * 世界最後の音楽隊の曲長（ミリ秒）。
 * カメラ軌跡の末尾時刻を曲長に一致させているため、末尾キーフレームの時刻を曲長として公開し値の二重管理を避ける。
 * カメラ軌跡の診断・テストが掃引の上限に使う。
 */
export const SEKAI_SAIGO_DURATION_MS =
  sekaiSaigoCameraKeyframes[sekaiSaigoCameraKeyframes.length - 1].timeMs;

export const sekaiSaigoInputs: ManualProfileInputs = {
  // 確定値: 曲頭の調は ト長調。主音の音名クラスは G＝7。
  // 根拠を先に述べる。musicalKey は無和音「N」区間を音階へ解決する処理にのみ使われ、本曲の無和音区間（和音索引
  // 0・57・78・113・116・118・128・154 の8個）のうち既定規則で音階へ倒れるのは曲頭の区間（直前の和音が無い索引0、
  // 0から780ミリ秒）だけである（他の7区間は直前に実在和音が境界で隣接するため直前和音を保持する）。よって musicalKey は
  // 曲頭の短い導入区間の音階だけを左右する。曲頭を含む前半は Bm7・Gsus2・A・Dsus2・GM7・A6 が多数で、これらは ト長調の
  // 音域に収まるため曲頭区間の音階解決は ト長調が正しい。後半は ヘ長調へ転調するが、後半の無和音区間はいずれも直前和音を
  // 保持して音階を使わないため、単一の調を ト長調にしても破綻しない（この正しさは sekaiSaigoInputs.test.ts が固定する）。
  musicalKey: { tonicPitchClass: 7, mode: "major" },

  // 確定値: クライマックス（最終見せ場）の代表時刻。
  // 根拠を先に述べる。本曲はサビが2区間（第1サビ 67380から93555ミリ秒、最終サビ 185576から211750ミリ秒）で、最終サビが
  // 最高潮である。最終サビ区間の声量曲線 amplitudeCurve（刻み200ミリ秒）が最大になる時刻が191600ミリ秒（振幅47900）で
  // あったため、これを感情のピークの代表時刻とする。この時刻は最終サビ区間の内側にあり最終見せ場として妥当である。★暫定。
  climaxAnchorMs: 191600,

  // 実カメラ軌跡（上の sekaiSaigoCameraKeyframes）。生成パイプラインの自動の暫定2点直線軌跡を置き換える。
  camera: sekaiSaigoCameraKeyframes,

  // X軸の色。作品仕様 §6 は灯しの色を固定（蝶のネオンブルー・ひまわりの橙）と定め、§5 は色の調和を固定パレットで保つと
  // 定めるため、曲ごとに変えず TAKEOVER と同じ停止点（x=0 を青、x=0.5 を白、x=1 を橙）にする。先頭x=0・末尾x=1・昇順・
  // #RRGGBB を満たす。得点には寄与しない。
  colors: {
    xAxisStops: [
      { x: 0, color: "#3ea8ff" },
      { x: 0.5, color: "#ffffff" },
      { x: 1, color: "#ff9a3e" },
    ],
  },

  // 操作音の音色。作品仕様 §4 は全レーン共通の単一の水滴音を全曲で洗練して使うと定めるため、曲ごとに音色を変えず
  // TAKEOVER と同じ値にする。通常時は三角波で持続音が無く減衰のみのため保持量0、立ち上がり4ミリ秒・減衰200ミリ秒・
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

  // diversityZoneLabels は省略する。根拠を先に述べる。多様性逓減区間の境界と役割（主題・回帰）は音楽地図のサビ区間から
  // 自動決定され（generate 層の deriveDiversityZones。サビ2区間のため先頭=主題・末尾=回帰）、ラベルは表示文言のみで
  // 採点に寄与しないため、省略時の汎用ラベルで足りる。
  // ncTreatmentOverrides も省略する。根拠を先に述べる。本曲の無和音区間は曲頭の索引0を除き全て直前に実在和音が隣接し、
  // 既定規則で「直前和音を保持」に倒れる。連続する無和音区間も無く、既定規則が意図どおりに各区間を決めるため上書きは要らない。
};
