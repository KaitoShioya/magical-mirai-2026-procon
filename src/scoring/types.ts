// タップ判定エンジン（Issue #48）の型契約。
// 判定は時間（ミリ秒）だけで行い、軌跡上距離は使わない（出典 docs/research/04-ux-and-chart-design.md §1
// 「内部の判定は音楽の時刻と入力の時刻の差で行い、軌跡上の距離はその視覚的な表現とする」）。
// 依存規則（docs/decisions/architecture.md §5、src/scoring/README.md）に従い、profiles・rendering・tools・three.js を
// 取り込まない。曲固有のデータ（ノーツ・判定窓）は呼び出し側（#59）から自前型で受け取る。

/** 判定窓（ミリ秒）。perfectMs は満点とする許容幅、outerMs は線形減衰の外端かつ対応付けの窓。
 *  数値の出所は src/config/tuning.ts（perfectMs=JUDGE_PERFECT_WINDOW_MS、outerMs=JUDGE_DECAY_OUTER_WINDOW_MS）であり、
 *  本モジュールでは再定義せず引数として受け取る。 */
export interface JudgmentWindows {
  perfectMs: number;
  outerMs: number;
}

/** 判定対象のノーツ（自前の最小入力型）。profiles の Note 型は取り込まない。
 *  timeMs は判定基準の音楽時刻で、拍格子時刻（beats[note.beatIndex].startTimeMs）であり演出実時刻 note.timeMs ではない
 *  （出典 src/profiles/schema/profileSchema.ts の Note 型注釈「beatIndex は判定とJUST認定に使う拍格子の索引」）。
 *  slot0 は0始まりの正解スロット（profiles の Note.slotIndex は1始まりのため呼び出し側が note.slotIndex - 1 で変換して渡す）。 */
export interface JudgmentNote {
  id: string;
  timeMs: number;
  slot0: number;
}

/** 判定の入力となる1回のタップ。呼び出し側（#59）が入力イベント（Reaction）とフレーム時刻標本から組み立てる。
 *  musicTimeMs は tapMusicTimeMs で音楽時刻へ変換済みの値、slot0 は0始まりのタップ音程スロット（Reaction.slotIndex をそのまま使う）。
 *  reliableMusicTime は §8 の信頼性前提（再生中かつ準備完了かつ非再同期フレーム）を満たすときだけ真。
 *  偽のときは音楽時刻の復元が信頼できないため、judgeTap は床のタップとして返す。 */
export interface TapSample {
  musicTimeMs: number;
  slot0: number;
  reliableMusicTime: boolean;
}

/** フレーム時刻標本。入力時刻を音楽時刻へ変換する tapMusicTimeMs の基準を与える。
 *  musicPositionMs は engine のゲーム時計 clock.gameTimeMs（player.timer.position を平滑化・単調化・ずれ補正した値）。
 *  生値ではない理由を先に述べる。docs/decisions/architecture.md の時刻系の決定「判定・得点・ノーツの配置はこの時計で行う」に従い、
 *  判定だけが engine の単調化・再同期と非整合な時刻基準で動くのを避けるためである。
 *  frameWallTimeMs はそのゲーム時計を採取したフレームの実時計（performance.now 基準。requestAnimationFrame が渡す時刻）。
 *  reliableMusicTime は呼び出し側が isReady かつ isPlaying かつ当該フレームが再同期でないとき真にする。 */
export interface FrameTimeSample {
  musicPositionMs: number;
  frameWallTimeMs: number;
  reliableMusicTime: boolean;
}

/** 判定結果。下流が必要とする判定の出力だけを持つ。
 *  入力側の値（音程スロット・色・座標）は元の Reaction が保持するため重複させない（呼び出し側が Reaction と対にして下流へ渡す）。
 *  boundNoteId が null かつ isFloor が真のとき床のタップ（対応ノーツ無し、または音楽時刻が信頼できないフレーム）。
 *  床のタップでは centeredDiffMs は非数（対応ノーツが無く差が定義できないため）、各精度は0、各JUSTは偽。
 *  timingAccuracy・pitchAccuracy は #51 反応強度が消費し、timingJust・pitchJust は #54 ゲージと #55 スコアが消費する。 */
export interface JudgmentResult {
  boundNoteId: string | null;
  isFloor: boolean;
  centeredDiffMs: number;
  timingAccuracy: number;
  pitchAccuracy: number;
  timingJust: boolean;
  pitchJust: boolean;
}
