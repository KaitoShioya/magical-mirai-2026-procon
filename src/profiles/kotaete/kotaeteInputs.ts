// 「こたえて」の曲別手動入力（Issue #90・横展開）。songmap から導出できないフィールドを与える。
//
// 確定値の出所を先に述べる。曲長・サビ区間・コード進行・無和音区間は音楽地図ダンプ
// docs/analysis/kotaete.songmap.json の観察から定めた。色と操作音は世界観の二色（蝶の青・ひまわりの橙）と
// 水滴音で全曲共通のため TAKEOVER の値を再利用する（ユーザー決定）。カメラ軌跡は曲構造に合わせて手設計する。
//
// 依存方針: スキーマの型と生成層の手動入力型、同層の TAKEOVER 入力（色・操作音の再利用元）、コーラス補正データだけを
// 取り込み、中核・rendering・tools・three.js は取り込まない。

import type { ManualProfileInputs } from "../generate/buildProfile";
import type { CameraKeyframe } from "../schema/profileSchema";
import { takeoverInputs } from "../takeover/takeoverInputs";

/** 「こたえて」の曲長（ミリ秒）。音楽地図ダンプの song.duration（252.66秒）に一致させる。
 *  カメラ軌跡の末尾時刻を曲長に一致させ、値の二重管理を避けるためここで公開する。 */
export const KOTAETE_DURATION_MS = 252660;

/**
 * カメラ軌跡のキーフレーム（本編実データ。手設計）。
 * 設計方針を先に述べる。深夜の湖を一方向に巡る開いた曲線とし、時刻間隔を不均一にして速度に変化を与える。
 * 節目の視点を、第1サビ（79910〜145530ミリ秒の反復ブロック）の入り口付近である86000ミリ秒地点と、最終サビ区間
 *（223240〜236050ミリ秒）の声量ピークである223600ミリ秒地点（クライマックス）に置く。先頭時刻0・末尾時刻を曲長
 * 252660ミリ秒に一致させ、全ノーツがこの範囲に収まるようにする。各時刻で軌跡上速度が正であること（停止区間が無いこと）は
 * kotaeteInputs.test.ts が固定する。見栄え（滑らかさ・構図）の調整は実機検証で行う。★暫定。
 */
export const kotaeteCameraKeyframes: CameraKeyframe[] = [
  { timeMs: 0, position: { x: -28, y: 5, z: 28 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 86000, position: { x: -10, y: 8, z: 12 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 145000, position: { x: 16, y: 5, z: 14 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 196000, position: { x: 26, y: 7, z: -18 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 223600, position: { x: 0, y: 11, z: -34 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 252660, position: { x: -22, y: 7, z: 18 }, target: { x: 0, y: 2, z: 1 } },
];

export const kotaeteInputs: ManualProfileInputs = {
  // 確定値: 「こたえて」の調はト長調。終止が D→G（属和音→主和音）で、最頻出かつ最終和音が G であることから主音は G。
  // 主音の音名クラスは G＝7（C=0 起点）。出典: docs/analysis/kotaete.songmap.json のコード進行。
  musicalKey: { tonicPitchClass: 7, mode: "major" },

  // 確定値: クライマックス（最終見せ場）の代表時刻。最終サビ区間（223240〜236050ミリ秒）内の声量カーブ最大時刻。
  // この区間内へ置くことで、見せ場生成の climax 選定（アンカーを含むサビを climax にする）が最後のサビ区間を選ぶ。
  // 出典: docs/analysis/kotaete.songmap.json の声量カーブ。
  climaxAnchorMs: 223600,

  // 見せ場の個数は曲別入力で指定しない。生成側（buildProfile）がサビ区間数と既定個数の大きい方を自動採用するため、
  // サビ区間が9個の「こたえて」は自動で9個の見せ場（全サビ区間）になる。

  // 実カメラ軌跡（上の kotaeteCameraKeyframes）。
  camera: kotaeteCameraKeyframes,

  // X軸の色。世界観の二色（蝶の青・ひまわりの橙）と中間の白は全曲共通のため TAKEOVER の値を再利用する（ユーザー決定）。
  colors: takeoverInputs.colors,

  // 操作音の音色。水滴音は全曲共通の世界観のため TAKEOVER の値を再利用する（ユーザー決定）。
  sfx: takeoverInputs.sfx,

  // コーラス補正（Issue #90）はプロファイル生成入力には含めない。補正後のコーラスは2段落目の発声中に重なる重唱で、
  // 時刻昇順・非重複を要するプロファイルの lyricChars と両立せず、また lyricChars は実行時に消費されないためである。
  // 補正は実行時のキネティックタイポにのみ適用する（補正データは src/profiles/kotaete/chorusTimings.ts、適用関数は
  // src/utils/chorusCorrection.ts の applyChorusCorrectionToLyricVideo。再生層への結線は多曲対応の結線で行う）。

  // サビ共有テンプレートを無効化する。「こたえて」はサビ区間が不均一に隣接し（各32〜33拍、連続併合で65/97/64/65拍）、
  // 全反復が同一拍数である前提を満たさないため、サビ区間も非サビと同じ個別スコアでノーツを選別する。サビ間の多様性逓減は
  // 発火しないが、配分・一回性・ゲージ投下・ランクは従来どおり機能する（ユーザー決定）。
  chorusSharedTemplate: false,

  // 無和音区間の埋め方の上書きは設けない。音楽地図の無和音「N」区間（和音索引0・49・119・163）は、索引0が曲頭で
  // 「調の音階」、索引49・119・163は直前が非無和音のため「直前和音を保持」となり、いずれも既定規則で意図どおりに決まる。

  // 多様性逓減区間のラベルの曲別上書きは設けない。サビ区間が9個あり、時刻順に主題・変奏・回帰の役割と汎用ラベルが
  // 自動付与される。曲固有の文言は実機検証時に必要なら加える。
};
