// 画面状態の有限状態機械が扱う型の定義。
// ここには型だけを置き、DOMの生成・遷移の論理は持たない（責務の出典 src/screens/README.md）。

import type { Scene, PerspectiveCamera, Object3D } from "three";
import type { MusicMapSource } from "../textalive/musicMap";
import type { TypographyChart, TypographyDisplayRegion, ReadingDisplayUnit } from "../types/typography";
import type { LaneNote } from "../types/judgmentLane";

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
  /** プレイ画面の本編表示の結線（Issue #33）。診断・本番の双方で統括が渡す。 */
  readonly play?: PlayWiring;
}

/** 状態へ進入するたびに新しい画面を生成する関数。 */
export type ScreenFactory = (context: ScreenContext) => Screen;
