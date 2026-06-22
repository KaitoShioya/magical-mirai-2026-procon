// 判定UI（落下式レーン Issue #57）が描画に必要とするノーツの最小情報の型。
// 共有の型置き場に置く理由を先に述べる。描画層（src/rendering）は曲プロファイル（src/profiles）を
// import しない依存規則（docs/decisions/architecture.md §5）のため、落下式レーンは曲プロファイルの
// Note 型を直接取り込めない。曲プロファイルの Note のうち、落下位置の基準となる時刻と表示する音程番号と
// 識別子だけを取り出した構造的部分型をここに定義し、描画層と画面層と統括が共有する。
// 曲プロファイルの Note はこの型の必須項目を全て持つため、Note[] はそのまま readonly LaneNote[] へ代入できる。

/** 落下式レーンが描画に必要とするノーツの最小情報。 */
export interface LaneNote {
  /** プロファイル内で一意の識別子。プールの割り当て追跡と、受け入れ診断で特定ノーツを引く鍵に使う。 */
  readonly id: string;
  /** ノーツの実時刻（ミリ秒）。落下位置の基準。 */
  readonly timeMs: number;
  /** 音程スロット番号（1からスロット数まで）。表示する数字。 */
  readonly slotIndex: number;
}
