// 画面状態の有限状態機械が扱う型の定義。
// ここには型だけを置き、DOMの生成・遷移の論理は持たない（責務の出典 src/screens/README.md）。

/** 5つの画面状態を表すキー。題名・ウォームアップ・プレイ・結果・再挑戦。 */
export type ScreenKey = "title" | "warmup" | "play" | "result" | "retry";

/**
 * 画面1つの契約。
 * element は自状態のキーを表す data-screen 属性（例 data-screen="title"）を必ず持つ。
 * この属性は単一画面の検証とスモークテストの両方が依拠する契約である。
 */
export interface Screen {
  /** この画面の文書要素。data-screen 属性に自状態のキーを持つ。 */
  element: HTMLElement;
  /** 状態へ進入したときに1回呼ばれる。事象listenerの登録などを行う。 */
  onEnter(): void;
  /** 毎フレーム呼ばれる。経過時間（ミリ秒）を受け取り、状態内の時間進行と自動遷移を判定する。 */
  onUpdate(deltaMs: number): void;
  /** 状態から抜けるときに1回呼ばれる。事象listenerの登録解除と要素内の後始末を行う。 */
  onExit(): void;
}

/**
 * 題名画面が一覧表示する課題曲1曲ぶんの表示用情報。
 * 楽曲ロードの詳細（URL・音楽地図ID）は含めない。統括（src/app）が表示に必要な部分だけを写して渡す。
 */
export interface SongChoice {
  /** アプリ内部で曲を引くためのキー。 */
  readonly key: string;
  readonly title: string;
  readonly artist: string;
  /** 遊べる状態まで実装が済んでいれば true。題名画面はこの値で開始可否を分ける。 */
  readonly implemented: boolean;
}

/**
 * 各画面へ渡す文脈。
 * 画面は遷移先のキーを要求するだけで、他の画面や機械の内部実装を知らない。
 */
export interface ScreenContext {
  /** 題名画面が一覧表示する課題曲カタログ。統括（src/app）が解決して渡す。 */
  readonly songs: readonly SongChoice[];
  /** 遷移を要求する。許可遷移表に無い遷移は機械が例外で拒否する。 */
  requestTransition(to: ScreenKey): void;
}

/** 状態へ進入するたびに新しい画面を生成する関数。 */
export type ScreenFactory = (context: ScreenContext) => Screen;
