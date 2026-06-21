// TAKEOVER の曲別手動入力。songmap から導出できないフィールドを与える（Issue #45）。
//
// 確定値と暫定値の区別を先に述べる。musicalKey と climaxAnchorMs は作品仕様・曲解析で定まる確定値である。
// camera・colors・sfx は検証を通すための暫定値（プレースホルダ）であり、diversityZones は空である。これらの実内容の
// 確定は後続 Issue の責務であり、本ファイル末尾のプレースホルダ目録に置換先を明記する。
//
// 依存方針: スキーマの型と生成層の手動入力型だけを取り込み、中核・rendering・tools・three.js は取り込まない。

import type { ManualProfileInputs } from "../generate/buildProfile";

// TAKEOVER の曲長（ミリ秒）。docs/analysis/takeover.songmap.json の song.duration に一致する。
// 暫定カメラの末尾キーフレームの時刻に使う。検証関数はカメラが曲頭0ミリ秒から曲長まで覆うことを要求するためである。
// 音楽地図ダンプを取り直して曲長が変わった場合は、この値も更新する必要がある（暫定カメラは後続 Issue #32 で実軌跡に置換する）。
const TAKEOVER_DURATION_MS = 237250;

export const takeoverInputs: ManualProfileInputs = {
  // 確定値: TAKEOVER の調はファ短調。主音の音名クラスはファ＝5。出典 docs/research/07-feasibility-and-parameters.md §1.2。
  musicalKey: { tonicPitchClass: 5, mode: "minor" },

  // 確定値: クライマックス（最終見せ場）の代表時刻。出典 docs/decisions/app-overall-decisions.md §3.5（189秒地点の回帰）。
  climaxAnchorMs: 189000,

  // 暫定値: カメラ軌跡。曲頭と曲尾の2点だけの直線的な軌跡で、検証（曲頭0・曲尾が曲長以上）とカメラ軌跡評価器
  //   （2点以上・時刻が厳密増加）の要求を満たす最小構成である。実カメラ軌跡の設計は後続 Issue #32・#46 が行う。
  camera: [
    { timeMs: 0, position: { x: 0, y: 6, z: 14 }, target: { x: 0, y: 0, z: 0 } },
    { timeMs: TAKEOVER_DURATION_MS, position: { x: 0, y: 6, z: 14 }, target: { x: 0, y: 0, z: 0 } },
  ],

  // 暫定値: X軸の色。先頭x=0・末尾x=1の2停止点で全X範囲を覆う最小構成である。実配色の確定は後続 Issue #46 が行う。
  colors: {
    xAxisStops: [
      { x: 0, color: "#ff8800" },
      { x: 1, color: "#0088ff" },
    ],
  },

  // 暫定値: 操作音の音色。300ヘルツ以下を削り4000ヘルツまでの帯域に置く最小構成である（出典 docs/research/07 §1.3）。
  //   実音色の確定は後続 Issue #46 が行う。
  sfx: {
    normal: {
      waveform: "triangle",
      envelope: { attackMs: 1, decayMs: 50, sustain: 0, releaseMs: 80 },
      bandpassLowHz: 300,
      bandpassHighHz: 4000,
    },
    powerUp: {
      waveform: "sawtooth",
      envelope: { attackMs: 1, decayMs: 60, sustain: 0.1, releaseMs: 100 },
      bandpassLowHz: 300,
      bandpassHighHz: 4000,
    },
  },

  // 空: 多様性逓減の三部形式の区間。手動記述は後続 Issue #46 が行う（スキーマは空配列を許容する）。
  diversityZones: [],

  // 無和音区間の埋め方の上書きは指定しない（既定規則で決める）。
  // 後続 Issue #46 で、和音索引24（32915から34286ミリ秒の歌唱中の無和音）を docs/research/07 §1.2 に従い "scale" へ
  // 上書きする予定である。既定規則ではこの区間は直前和音が隣接するため "previous" になる。
};

// ── プレースホルダ目録（後続 Issue で実内容へ置換する箇所） ──
// 1. camera: 暫定の2点直線軌跡。実カメラ軌跡の設計は Issue #32（3Dカメラワーク文字演出）と Issue #46（TAKEOVER内容）。
// 2. colors.xAxisStops: 暫定の橙→青の2停止点。実配色は Issue #46。
// 3. sfx: 暫定の音色2種。実音色は Issue #46。
// 4. diversityZones: 空。三部形式（theme=24秒・variation=中盤・reprise=189秒）の手動記述は Issue #46。
// 5. ncTreatmentOverrides: 未指定。和音索引24の歌唱中無和音を "scale" へ上書きする精緻化は Issue #46。
