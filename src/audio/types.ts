// audio サブシステムの公開型。実装の詳細を持たない型だけを置く。

/**
 * 操作音エンジンが報告する AudioContext の状態。
 * 標準の AudioContextState（"suspended"・"running"・"closed"）に、AudioContext を生成する前を表す
 * "uninitialized" を加える。これにより「起動前は無音」の状態を起動後の状態と区別して観測できる。
 */
export type EngineContextState = "uninitialized" | "suspended" | "running" | "closed";

/**
 * 操作音エンジンの外部契約。発音の生成と起動、同時発音の観測、後始末を公開する。
 * コードトーン格子（スロット→音高）の中身は外から `setSlotPitches` で与える。和音名の解析や音域配置は
 * 本サブシステムの責務外（Issue #35・#36）であり、本エンジンは割り当て済みの音高配列を受け取るだけにする。
 */
export interface OperationSoundEngine {
  /**
   * 利用者操作中に呼び、AudioContext を生成・起動する。起動後の状態を返す。
   * 進行中・完了後の再呼び出しは同じ約束を返し無作用にする（冪等）。
   * 起動の確実化のため無音の短い音源を一度だけ出力へ直結して鳴らすが、これは発音中の音にも接続中の音にも数えない。
   * 起動に失敗（拒否）した場合はキャッシュを消し、次回の呼び出しで再試行できるようにする。
   */
  unlock(): Promise<EngineContextState>;
  /** 操作音の有効・無効を切り替える。無効のあいだ playSlot・playNote は無音。既定は有効。 */
  setEnabled(enabled: boolean): void;
  /** 各Y軸スロットの音高（音高番号、低い順）を設定する。未設定や非有限値は無効化する。鳴っている音は再調整しない。 */
  setSlotPitches(midiNotes: readonly number[] | null | undefined): void;
  /** スロット番号を発音する（0が最下、増えるほど高い）。即座に鳴らす。未起動・無効・範囲外・該当音高なしは無音。 */
  playSlot(slotIndex: number): void;
  /** 音高番号を直接発音する（スロットを介さない経路）。未起動・無効・非有限値は無音。 */
  playNote(midiNote: number): void;
  /** 発音中（奪取の対象になる）音の数。常に上限以下を保つ。 */
  readonly soundingVoiceCount: number;
  /** 接続中（発音中と消音中の合計、まだ再生終了通知に達していない）音の数。起動用の無音音源は含めない。 */
  readonly activeVoiceCount: number;
  /** AudioContext の状態。 */
  readonly contextState: EngineContextState;
  /** 後始末。全音停止・接続切断・AudioContext の破棄。 */
  dispose(): void;
}
