// 画面状態の有限状態機械が扱う型の定義。
// ここには型だけを置き、DOMの生成・遷移の論理は持たない（責務の出典 src/screens/README.md）。

import type { Scene, PerspectiveCamera, Object3D } from "three";
import type { MusicMapSource } from "../textalive/musicMap";
import type { TypographyChart, TypographyDisplayRegion, ReadingDisplayUnit } from "../types/typography";
import type { LaneNote } from "../types/judgmentLane";
import type { ScoreHistory } from "../scoring/scoreHistoryStore";

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
 * ランク専用ゲージ（Issue #65）の現在入力。百分位（0〜100）と表示ランクの添字（0=C, 1=B, 2=A, 3=S）。
 * 百分位→ランクの帯分けは統括（src/app）が scoring で行い、レンダリング層へはこの確定値を渡す（依存規則 §5）。
 */
export interface RankGaugeInput {
  /** スコア蓄積の百分位（0〜100）。 */
  readonly percentile: number;
  /** 表示するランクの添字（rankOrdinal の値、0=C, 1=B, 2=A, 3=S）。 */
  readonly rankIndex: number;
}

/**
 * プレイ画面が本編表示（キネティックタイポ）を駆動するための結線（Issue #33）。
 * 統括（src/app）が描画基盤・再生・ゲーム時刻・タイポ譜面を解決して渡す。プレイ画面はこれを用いて
 * 文字エンジンと駆動部を組み立てる。WebGL が無い端末では描画を組み立てず、画面遷移だけを成立させる。
 */
export interface PlayWiring {
  /** 3次元表示ツリーの場面（文字エンジンの表示先）。 */
  getWorldScene(): Scene;
  /** 3次元表示ツリーの透視投影カメラ（正対と配置の画素↔ワールド変換に使う）。 */
  getWorldCamera(): PerspectiveCamera;
  /** WebGL が使えるか。偽のときプレイ画面は文字エンジンを組み立てない。 */
  webglAvailable(): boolean;
  /** 音楽データの読取窓口（歌詞・ビート・コーラス区間・声量・曲長）。 */
  musicMapSource(): MusicMapSource;
  /** ゲーム時刻（再生位置の平滑化値、ミリ秒）を読む。同期の基準。 */
  currentGameTimeMs(): number;
  /** 曲固有のタイポ譜面。 */
  readonly typographyChart: TypographyChart;
  /** 配置指定の無いフレーズの既定の読ませる役の表示単位。 */
  readonly defaultReadingUnit: ReadingDisplayUnit;
  /** 配置指定の無いフレーズの既定の想定表示寸法（デバイス画素）。 */
  readonly defaultReadingPixelHeight: number;
  /** 配置指定の無いフレーズの既定の表示領域。 */
  readonly defaultReadingRegion: TypographyDisplayRegion;
  /** 画面の横デバイス画素数（読ませる役の収まり判定に使う）。 */
  viewportPixelWidth(): number;
  /** 画面の縦デバイス画素数（最小表示寸法の下限計算に使う）。 */
  viewportPixelHeight(): number;
  /** 2次元層へ表示物を足す（落下式レーン #57 を最前面へ載せる。統括が renderRoot へ委譲する）。 */
  addOverlayObject(object: Object3D): void;
  /** 2次元層から表示物を外す。 */
  removeOverlayObject(object: Object3D): void;
  /** 落下式レーン（判定UI #57）が描画するノーツ列（時刻と音程番号と識別子）。曲プロファイルの notes を渡す。 */
  readonly laneNotes: readonly LaneNote[];
  /** レーンガイド（Issue #58・Issue #202。レーンの仕切り線と単一判定線）を表示する。プレイ画面の表示中だけ出す。
   *  音程スロット数（レーン数）は統括（src/app）が注入し、画面層は楽曲非依存の設定を知らない。WebGL が無い端末では統括の結線先が何もしない。 */
  showPitchAxisGuide(): void;
  /** レーンガイド（Issue #58・Issue #202）を非表示にする。プレイ画面から抜けるときに呼ぶ。 */
  hidePitchAxisGuide(): void;
  /**
   * プレイヤーのタップを画面全体の波紋へ届ける受け口を登録する（Issue #202）。統括（src/app）はタップ反応ごとに
   * 登録された受け口へそのレーン（音程スロット、0始まり）を渡す。プレイ画面は落下式レーンの spawnTapRipple を登録し、
   * 画面から抜けるときに何もしない受け口へ戻す。波紋はプレイヤーのタップでのみ立て、ノーツの自動通過では立てない。
   */
  registerTapRipple(sink: (slotIndex0: number) => void): void;
  /** ランク専用ゲージ（Issue #65）の現在入力を読む。実スコア未供給（Issue #59 の結線前）の間は null を返す。
   *  null のときプレイ画面は百分位0・ランク添字0（空・ランクC）でゲージを更新する。 */
  currentRankGaugeState(): RankGaugeInput | null;
}

/**
 * 結果画面が表示する確定スコアの写し（Issue #74・成果物タスク #71）。
 * 画面層は得点の論理を持たないため、得点型そのものでなく統括（src/app）が整形して渡す表示用の値だけを受け取る。
 * 値は楽曲終了の地点で一度だけ確定（凍結）したもので、撮影や共有のたびに再計算しない。
 */
export interface ResultSnapshot {
  /** 総合得点。 */
  readonly totalScore: number;
  /** ランク（C・B・A・S のいずれか）。文字として扱い、画面層は帯分けの論理を持たない。 */
  readonly rank: string;
  /** 百分位（0以上100以下、値が大きいほど上位）。 */
  readonly percentile: number;
}

/**
 * 結果画面の結線（Issue #74・成果物タスク #71・#69・#70・#68）。統括（src/app）が確定スコア・自己ベスト履歴・作品情報・撮影・画像化・共有を解決して渡す。
 * 結果画面はこれを用いてスコア表示・自己ベスト表示・成果物プレビュー・撮影操作・保存共有を組み立てる。
 * 画面層が得点・描画・共有の論理を持たないための窓口で、論理はすべて統括側にある。
 */
export interface ResultWiring {
  /** 楽曲終了時に凍結した確定スコアの写しを返す。確定前（異常時）は null を返す。 */
  getFinalResult(): ResultSnapshot | null;
  /** 端末内に保存済みの自己ベストと直近履歴（Issue #67・#74）。記録が無い・保存できない環境では null。 */
  getScoreHistory(): ScoreHistory | null;
  /** 作品名（成果物画像の見出し・共有文に使う）。 */
  readonly appTitle: string;
  /** 曲名。 */
  readonly songTitle: string;
  /** 作者名。 */
  readonly songArtist: string;
  /** 撮影モード（#68）を始める。結果画面へ入ったときに呼ぶ。 */
  beginPhotoMode(): void;
  /** 撮影モードを終える。結果画面から抜けるときに呼ぶ。 */
  endPhotoMode(): void;
  /** 現在のカメラ構図で成果物画像を作って返す（#69）。描画できない端末では null を返す。 */
  captureArtifact(): Promise<Blob | null>;
  /** 成果物画像を共有または保存する（#70）。画像が無い端末ではテキストのみで成立させる。 */
  shareArtifact(blob: Blob | null): Promise<void>;
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
  /** 曲を選んで開始を要求する（題名画面の曲選択）。起動曲と同じならウォームアップへ進み、別曲なら統括が起動曲を
   *  切り替えて始め直す（Issue #88）。曲キーは題名画面のボタンの data-song-key から渡す。 */
  requestSong(key: string): void;
  /** プレイ画面の本編表示の結線（Issue #33）。診断・本番の双方で統括が渡す。 */
  readonly play?: PlayWiring;
  /** 結果画面の結線（Issue #74・成果物タスク #71/#69/#70/#68）。統括がプレイ終了時に渡す。 */
  readonly result?: ResultWiring;
}

/** 状態へ進入するたびに新しい画面を生成する関数。 */
export type ScreenFactory = (context: ScreenContext) => Screen;
