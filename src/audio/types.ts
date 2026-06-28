// audio サブシステムの公開型。実装の詳細を持たない型だけを置く。

/**
 * 操作音エンジンが報告する AudioContext の状態。
 * 標準の AudioContextState（"suspended"・"running"・"closed"）に、AudioContext を生成する前を表す
 * "uninitialized" を加える。これにより「起動前は無音」の状態を起動後の状態と区別して観測できる。
 */
export type EngineContextState = "uninitialized" | "suspended" | "running" | "closed";

/**
 * 操作音エンジンの外部契約。発音の生成と起動、同時発音の観測、後始末を公開する。
 * どのレーンを叩いても同じ単一の「水滴が弾ける音」を鳴らす（中身は droplet.ts が持つ）。本エンジンはレーン番号を
 * 範囲だけ検査し、音色はレーン番号で変えない。較正用の基準音は playCalibrationCue で別に鳴らす。
 */
export interface OperationSoundEngine {
  /**
   * 利用者操作中に呼び、AudioContext を生成・起動する。起動後の状態を返す。
   * 進行中・完了後の再呼び出しは同じ約束を返し無作用にする（冪等）。
   * 起動の確実化のため無音の短い音源を一度だけ出力へ直結して鳴らすが、これは発音中の音にも接続中の音にも数えない。
   * 起動に失敗（拒否）した場合はキャッシュを消し、次回の呼び出しで再試行できるようにする。
   */
  unlock(): Promise<EngineContextState>;
  /** 操作音の有効・無効を切り替える。無効のあいだ playSlot は無音（playCalibrationCue は鳴る）。既定は有効。 */
  setEnabled(enabled: boolean): void;
  /**
   * 投下中かどうかを切り替える。真のあいだ playSlot は少し大きく・存在感を増して発音する。既定は偽（通常）。
   * 破棄後は発音そのものが無音のため無作用。鳴っている音は再調整しない（以後の発音へ適用する）。
   * 呼び出し側（Issue #59）は投下の開始で真、投下窓の終了で偽へ必ず同期させる（状態の消し忘れによる音色の残留を防ぐ）。
   */
  setDeployTimbre(active: boolean): void;
  /** レーン番号を範囲だけ検査し、どのレーンでも同じ水滴音を即座に鳴らす（音色はレーン番号で変えない）。未起動・無効・範囲外は無音。 */
  playSlot(slotIndex: number): void;
  /**
   * 較正用の基準音（固定の短い音）を鳴らす。レイテンシ較正で点滅に拍を合わせるために使う。
   * 操作音の有効・無効に関わらず鳴らす（較正は設定の準備手順であり基準音が聞こえる必要があるため）。未起動は無音。
   */
  playCalibrationCue(): void;
  /** 発音中（奪取の対象になる）音の数。常に上限以下を保つ。 */
  readonly soundingVoiceCount: number;
  /** 接続中（発音中と消音中の合計、まだ再生終了通知に達していない）音の数。起動用の無音音源は含めない。 */
  readonly activeVoiceCount: number;
  /** AudioContext の状態。 */
  readonly contextState: EngineContextState;
  /**
   * 音声出力の遅れの推定値（ミリ秒）。較正UI #50 が初期つまみ位置の参考値に使う。最終補正値へは自動採用しない。
   * 計算式は (context.outputLatency + context.baseLatency) * 1000。AudioContext が未生成または running でないとき、
   * および値が非有限のときは null（推定不能）。
   */
  readonly outputLatencyMs: number | null;
  /** 後始末。全音停止・接続切断・AudioContext の破棄。 */
  dispose(): void;
}
