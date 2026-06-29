// トリツクロジーの曲別手動入力。songmap から導出できない値を与える（横展開。TAKEOVER の takeoverInputs.ts と同じ枠組み）。
//
// 値の出どころを先に述べる。musicalKey と climaxAnchorMs は曲解析（docs/analysis/toritsuku-logy.songmap.json）から
// 決定論的に導出した。camera は曲長と見せ場の時刻に合わせて設計した。colors・sfx は作品テーマ「湖のソナーレ」が
// TAKEOVER と共通であるため TAKEOVER の値を流用する（★暫定。実装後のプレイ検証で調整しうる）。多様性逓減区間の
// ラベルと無和音区間の埋め方の上書きは与えず、汎用ラベルと既定規則に任せる。
//
// 依存方針: スキーマの型と生成層の手動入力型だけを取り込み、中核・rendering・tools・three.js は取り込まない。

import type { ManualProfileInputs } from "../generate/buildProfile";
import type { CameraKeyframe } from "../schema/profileSchema";

/**
 * カメラ軌跡のキーフレーム（本編実データ）。
 * 深夜の湖を一方向に巡る開いた曲線とし、時刻間隔を不均一にして速度に変化を与える。節目の視点を曲構成に合わせて置く。
 * 時刻 0=曲頭、30225=第1サビ入り、56324=第1サビ明け、92545=第2サビ入り、99386=最終見せ場（climaxAnchorMs と同時刻）、
 * 140650=曲尾（曲長に一致）。位置と注視点の値域は TAKEOVER のカメラ軌跡（takeoverInputs.ts）に倣う。各時刻で軌跡上速度が
 * 正であること（停止区間が無いこと）は toritsukuLogyInputs.test.ts が固定する。見栄えの調整は実装後のプレイ検証で行いうる。★暫定。
 */
export const toritsukuLogyCameraKeyframes: CameraKeyframe[] = [
  { timeMs: 0, position: { x: -30, y: 5, z: 30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 30225, position: { x: -10, y: 8, z: 12 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 56324, position: { x: 18, y: 4, z: 14 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 92545, position: { x: 25, y: 6, z: -16 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 99386, position: { x: 8, y: 11, z: -30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 140650, position: { x: -24, y: 7, z: 20 }, target: { x: 0, y: 2, z: 1 } },
];

/**
 * トリツクロジーの曲長（ミリ秒）。
 * カメラ軌跡の末尾時刻を曲長に一致させているため、末尾キーフレームの時刻を曲長として公開し値の二重管理を避ける。
 */
export const TORITSUKU_LOGY_DURATION_MS = toritsukuLogyCameraKeyframes[toritsukuLogyCameraKeyframes.length - 1].timeMs;

export const toritsukuLogyInputs: ManualProfileInputs = {
  // 確定値: トリツクロジーの調は変ロ短調。主音の音名クラスは A#/Bb＝10。
  // 出典 docs/analysis/toritsuku-logy.songmap.json の和音列を区間長で重み付けして集計した結果、最頻の根音が Bb（25.6パーセント、
  // うち短和音が支配的）で、続く Gb（長和音）と Ab（長和音）が Bb 短調の第6音上・第7音上の和音に一致するため、変ロ短調と判定した。
  musicalKey: { tonicPitchClass: 10, mode: "minor" },

  // 確定値: クライマックス（最終見せ場）の代表時刻。
  // 出典 docs/analysis/toritsuku-logy.songmap.json。曲後半（曲長の0.7倍＝98455ミリ秒以降）で、声量に0.65・歌詞密度に0.35を
  // 掛けた合成値が最大になる拍の時刻が99386ミリ秒であった。この重みは見せ場生成 src/profiles/generate/showcases.ts の既定
  //（声量0.65・歌詞密度0.35）と一致させ恣意を避けた。この時刻は第2サビ区間（92545〜118644ミリ秒）の内側にあり最終見せ場として妥当である。
  climaxAnchorMs: 99386,

  // 実カメラ軌跡（上の toritsukuLogyCameraKeyframes）。生成パイプラインの自動の暫定2点直線軌跡を置き換える。
  camera: toritsukuLogyCameraKeyframes,

  // X軸の色。作品テーマ「湖のソナーレ」が TAKEOVER と共通のため、同じ二色（x=0を蝶のネオンブルー、x=1をひまわりの橙、
  // 中間を白）を流用する。先頭x=0・末尾x=1・昇順・#RRGGBB を満たす。得点には寄与しない。★暫定。
  colors: {
    xAxisStops: [
      { x: 0, color: "#3ea8ff" },
      { x: 0.5, color: "#ffffff" },
      { x: 1, color: "#ff9a3e" },
    ],
  },

  // 操作音の音色。世界観共通のため TAKEOVER の水滴音を流用する。通常時は三角波で持続音が無く減衰のみ（保持量0）、
  // 帯域は楽曲低音と歌声基音に重ねない下限300ヘルツ・耳障りな高次倍音を抑える上限4500ヘルツ。投下時はのこぎり波で
  // 倍音を増やし減衰をやや延ばし帯域上限を5000ヘルツへ上げる。★暫定。
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

  // 譜面密度の曲別上書き。サビを難易度のピーク（毎拍）にし、サビ以外は偏り（緩急）を保つための上書きである。
  // 採用理由を先に述べる。難易度は「1拍あたり密度×毎秒拍数」で定まり、トリツクロジーは TextAlive の拍格子が約66拍毎分と粗いため
  // 既定の0.5では簡単すぎる。1拍あたり密度を上限の1.0にすると目標ノーツ数が全拍数に達してオンセット選択が全拍を無選択で採り、
  // 偏り（緩急）が消えて単調になる（onsetNotes.ts の selectWithLocalCap は目標数が拍数以上のとき全拍を返す）。
  // そこで、最も盛り上がるサビ区間だけ密度を上限の1.0（毎拍）にして難易度のピークを作り、サビ以外は偏りが働く0.75にして
  // 局所上限（4拍に3ノーツ）で各小節の最も弱い拍を空け、楽曲内容に沿った緩急を保つ。countTargetNotes は0.25刻みのため
  // 選べる値は0.5・0.75・1.0であり、この組み合わせ（サビ1.0・サビ以外0.75）はその刻みに収まる。
  density: {
    chorusDensityPerBeat: 1.0,
    baseDensityPerBeat: 0.75,
  },

  // オンセット選択（強調による拍の偏り）の曲別上書き。空く拍（緩急の谷）を楽曲の声量・歌詞の起伏へ強く寄せるための上書きである。
  // 採用理由を先に述べる。既定の重みは反復不変の強拍・和音変化を重く（1.0・0.9）し、声量・歌詞を中程度（各0.6）にしている。
  // トリツクロジーでは「TextAlive の内容（歌の起伏）に沿った偏り」を強めたいので、声量と歌詞の重みを和音変化と同程度の1.0へ上げ、
  // 歌が立つ拍にノーツが寄り、間奏や息継ぎの拍が空くようにする。強拍・和音変化の重みは据え置き、骨格の安定は保つ。
  onset: {
    loudnessWeight: 1.0,
    lyricWeight: 1.0,
  },

  // 多様性逓減区間のラベルは与えない。境界と役割は songmap のサビ区間から自動抽出され（サビ2区間のため先頭=主題・末尾=回帰）、
  // ラベルは汎用文言（第N反復区間（役割））が自動生成される。曲固有の文言が必要になれば後から与える。

  // 無和音区間の埋め方の上書きは与えない。無和音区間は既定規則（直前に非無和音の和音が隣接すれば直前和音を保持、
  // それ以外は調の音階）で決まる。既定規則で破綻しないことは生成の検証で確かめる。
};
