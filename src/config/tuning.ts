// 楽曲非依存のチューニング定数（調整値）を一元管理するモジュール。
// ここに置くのは「楽曲が変わっても同じ値であり、複数のサブシステムが横断的に参照する調整値」だけである。
// 値は作品仕様・調査の正典と照合済みである。出典は各定数のコメントにファイル名と節で記す。
// このモジュールは値の定義のみを持ち、判定式・減衰式などの論理は持たない（責務の出典 src/config/README.md、docs/decisions/architecture.md §4）。
//
// 状態の記号:
//   ★暫定 = docs/research/07-feasibility-and-parameters.md §2 と docs/decisions/app-overall-decisions.md §5 に基づき、
//           見積もりを初期値とし、実装後のプレイ検証で調整する値。
//   ☆確定 = 標準仕様・人間工学・作品仕様で固定される値。
//
// ここに置かない値（理由は docs/decisions/architecture.md §3.6・§5 の「曲非依存のエンジンと曲ごとのプロファイルの分離」）:
//   - 楽曲固有の絶対値（1拍343ミリ秒・毎分175拍、フルに可能なタップ数434、タップ総数上限の絶対値260、
//     見せ場6箇所、セクション密度、同時押し2点から3点、量子化の絶対値、満タンゲージの絶対タップ数など）
//     は曲プロファイル（Issue #34・#46）と譜面（Issue #38・#39・#44）に置く。
//   - 単一の所有モジュールが定まる値（得点合成の基準値は scoring の #55・#56、ランクの段階は scoring の #55 と types、
//     ウォームアップのカウントダウンは screens の #2、性能閾値は rendering の #18）は、その所有モジュールが定義する。
//   - 原典に単一の確定値の記載がない値（コンボの総得点に占める上限割合など）は推測で埋めず、所有Issueが確定する。

// --- 判定窓 ---
// 楽曲非依存の人間のタイミング許容。判定窓は時間（ミリ秒）で定め、各ノーツ点でカメラ軌跡上の速さを掛けて
// 距離の窓へ翻訳する（翻訳と減衰の論理は Issue #48）。
// 出典: docs/research/04-ux-and-chart-design.md §1「判定窓」、docs/research/07-feasibility-and-parameters.md §2.4。
// 消費Issue: #48（タップ判定エンジン）、#55（スコアリング合成）。

/** 満点とする判定の許容幅。JUSTの中心の前後40ミリ秒以内を満点とする。★暫定。 */
export const JUDGE_PERFECT_WINDOW_MS = 40;

/** 線形減衰の外端。前後40ミリ秒から90ミリ秒で得点を線形に減らし、90ミリ秒を超えると床の得点（発音のみ、光点は最小）とする。★暫定。 */
export const JUDGE_DECAY_OUTER_WINDOW_MS = 90;

/** タイミング精度の点推定に用いる参考窓（1拍の約17パーセント）。判定窓の調整範囲は前後40ミリ秒から90ミリ秒である。★暫定。 */
export const JUDGE_POINT_ESTIMATE_WINDOW_MS = 60;

// --- 音程スロット ---
// 画面の縦方向（Y軸）を分割し、その瞬間の和音の構成音を割り当てる数。コードトーン格子はエンジン中核であり曲非依存。
// 安全付加音（長調は9度と6度、短調は♭7度と11度）の音高集合の表現は和音名パーサー（#35）と JUST 生成（#36）が定義する。
// 出典: docs/research/07-feasibility-and-parameters.md §2.3、docs/idea/concept-final.md §4。
// 消費Issue: #36（JUST音程7スロット自動生成）、#48、#49（軌跡上距離と時間の翻訳）。

/** 音程スロット数の既定値。3和音6音に根音の重複か安全付加音を1つ加えた数。★暫定。 */
export const PITCH_SLOT_COUNT_DEFAULT = 7;

/** 音程スロット数の調整範囲の下限。★暫定。 */
export const PITCH_SLOT_COUNT_MIN = 5;

/** 音程スロット数の調整範囲の上限。★暫定。 */
export const PITCH_SLOT_COUNT_MAX = 9;

// --- 一回性（タップ総数上限の比率） ---
// 楽曲非依存なのは「フルに可能なタップ数に対する上限の割合」だけである。
// 楽曲固有の絶対値（フル434、上限260、範囲170から350）は TAKEOVER の曲プロファイルと譜面（#44・#46）に置く。
// 出典: docs/decisions/app-overall-decisions.md §3.7、docs/research/07-feasibility-and-parameters.md §2.2。
// 消費Issue: #44（タップ総数上限算出）、#55。

/** タップ総数上限の比率の既定値。フルに可能なタップ数の6割を目安とする。★暫定。 */
export const TAP_LIMIT_RATIO_DEFAULT = 0.6;

/** タップ総数上限の比率の調整範囲の下限（フルの4割）。下げすぎると失敗のない床と矛盾する。★暫定。 */
export const TAP_LIMIT_RATIO_MIN = 0.4;

/** タップ総数上限の比率の調整範囲の上限（フルの8割）。上げると取り切れて一回性が薄れる。★暫定。 */
export const TAP_LIMIT_RATIO_MAX = 0.8;

// --- ゲージ蓄積 ---
// 楽曲非依存なのは蓄積の倍率だけである。満タンの絶対タップ数（約50）と満タンあたりの投下回数（5）は
// TAKEOVER の上限260と見せ場6箇所から導出する曲依存の値であり、ゲージ機構（#54）と曲プロファイルに置く。
// 出典: docs/research/07-feasibility-and-parameters.md §2.5、docs/decisions/app-overall-decisions.md §3.6。
// 消費Issue: #54（ゲージ・投下システム）、#55。

/** ゲージ蓄積の両JUST倍率。タイミングと音程の片方成功で基本量、両方がJUSTのときその2倍を蓄積する。★暫定。 */
export const GAUGE_BOTH_JUST_MULTIPLIER = 2;

// --- 入力の人間工学 ---
// 片手の親指の精度を保つための、タップ対象の最小の大きさ。音程スロットの各ゾーン幅の下限を与えるため
// スロット数と横断的に連動する。画素または長さのいずれかで48画素または11ミリメートル以上とする。
// 出典: docs/research/04-ux-and-chart-design.md §4「横持ち両手の操作性」。
// 消費Issue: #47（3空間分離入力アーキテクチャ）、#49。

/** タップ対象の最小の大きさ（画素）。☆確定。 */
export const MIN_TOUCH_TARGET_PX = 48;

/** タップ対象の最小の大きさ（ミリメートル）。☆確定。 */
export const MIN_TOUCH_TARGET_MM = 11;
