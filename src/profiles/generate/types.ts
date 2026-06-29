// 見せ場マップ生成（Issue #41）の入力・オプション・内部受け渡し型。
// 曲解析データ（songmap 由来の素の配列）から見せ場6箇所を決定論的に生成するための型を定める。
// この層はどの処理モジュールにも依存せず、Showcase 型だけをスキーマから取り込む。

import type { Showcase } from "../schema/profileSchema";

/** 時間範囲（ミリ秒）。区間や窓の最小表現。 */
export interface TimeRange {
  startMs: number;
  endMs: number;
}

/** 反復区間（songmap の isChorus 区間）。startMs 以上 endMs 未満を chorus の内側とする（右半開）。 */
export type ChorusSegment = TimeRange;

/** 見せ場生成の入力。すべて songmap 由来の素の配列で受け取り、TextAlive や tools の型に依存しない。 */
export interface ShowcaseInput {
  /** 曲長（ミリ秒）。 */
  durationMs: number;
  /** 声量サンプル列。等間隔（amplitudeStepMs 刻み）で、負値（−1）は無音センチネル。 */
  amplitudeCurve: number[];
  /** 声量サンプルの間隔（ミリ秒）。TAKEOVER は200。 */
  amplitudeStepMs: number;
  /** 歌詞の各文字の開始時刻（ミリ秒）。歌詞密度の素。 */
  lyricCharOnsetsMs: number[];
  /** 反復区間（isChorus）。 */
  chorusSegments: ChorusSegment[];
  /** 拍の開始時刻（ミリ秒、昇順想定）。非chorus窓の拍数えに使う。 */
  beatsMs: number[];
}

/** 見せ場生成のオプション。すべて既定値を持ち、曲横展開時に上書きできる。 */
export interface ShowcaseOptions {
  /** 見せ場の個数。 */
  count: number;
  /** climax として最大重みにする時点（ミリ秒）。既定値はTAKEOVER専用で、横展開時は #45 が曲別に渡す。 */
  climaxAnchorMs: number;
  /** 合成格子の刻み（ミリ秒）。 */
  gridMs: number;
  /** 平滑化の片側ビン数（前後この数ぶんずつ、計 2×この数＋1 ビンの中心移動平均）。 */
  smoothHalfBins: number;
  /** 合成における正規化声量の重み。 */
  amplitudeWeight: number;
  /** 合成における正規化歌詞密度の重み。 */
  densityWeight: number;
  /** 非chorusピーク間の最小間隔（ミリ秒）。 */
  minSpacingMs: number;
  /** climax 窓の前後で非chorus候補を除外する幅（ミリ秒）。 */
  climaxGuardMs: number;
  /** 非chorusピークの信頼比（全体最大比）の目安下限。選定を止めるゲートではなく、低信頼を見分けるための
   *  診断用の基準値。生成ロジック（generateShowcases）はこの値を参照せず、見せ場の選定結果も変えない。
   *  信頼比を見る呼び出し側（本Issueの実データ検証テスト、横展開時は #45 の生成スクリプト）がこの基準値と
   *  selectNonChorusPeaks の compositeRatio を比べて低信頼を判定する。命名で閾値ゲートと誤解されないよう
   *  confidence とする。 */
  peakConfidenceRatio: number;
  /** 非chorus窓の片側拍数。 */
  windowHalfBeats: number;
  /** 拍が使えない場合の非chorus窓の片側ミリ秒幅。 */
  windowHalfMsFallback: number;
  /** climax の重み（固定値）。 */
  climaxWeight: number;
  /** 非climax見せ場の重みの下限。 */
  nonClimaxWeightFloor: number;
  /** 非climax見せ場の重みの上限。 */
  nonClimaxWeightCeil: number;
  /** 非chorus窓の切り詰め後に許す最小の長さ（ミリ秒）。 */
  minWindowMs: number;
  /** 重み写像で代表合成値を同値とみなす差の上限。貪欲選択の同点処理には使わない。 */
  compositeEqualEpsilon: number;
  /**
   * 連続するサビ区間を1つのサビ群へ統合してから見せ場窓にするか。既定は真。
   * 役割と既定理由を先に述べる。多くの曲は1つのサビ群が複数の反復区間に分かれて隣接記録され、接する区間を別々の
   * 不変窓にするとクライマックス窓の延長で窓どうしが重なる。これを防ぐため既定では統合する（mergeContiguousChorusSegments）。
   * 一方、各反復区間をそれぞれ独立の見せ場として扱いたい曲（隣接区間でも別個の見せ場にしたい曲）は偽にして統合を止める。
   * 偽にする曲は、各サビ区間を独立の不変窓にしてもクライマックス窓の延長が隣接窓へ食い込まないこと（重ならないこと）を
   * 呼び出し側で確認した上で指定する。
   */
  mergeContiguousChorus: boolean;
}

/**
 * 既定オプション。
 * 各値の採用理由は docs（app-overall-decisions.md §3.5・§3.6・§3.7、research/04・07）と実データ解析にある。
 * climaxAnchorMs=189000 はTAKEOVER専用の便宜値で、生成関数はこの値を引数として受け取るだけで内部固定しない。
 */
export const DEFAULT_SHOWCASE_OPTIONS: ShowcaseOptions = {
  count: 6,
  climaxAnchorMs: 189000,
  gridMs: 1000,
  smoothHalfBins: 2,
  amplitudeWeight: 0.5,
  densityWeight: 0.5,
  minSpacingMs: 20000,
  climaxGuardMs: 8000,
  peakConfidenceRatio: 0.6,
  windowHalfBeats: 16,
  windowHalfMsFallback: 5500,
  climaxWeight: 1.0,
  nonClimaxWeightFloor: 0.4,
  nonClimaxWeightCeil: 0.9,
  minWindowMs: 2000,
  compositeEqualEpsilon: 1e-9,
  mergeContiguousChorus: true,
};

/** 合成ボルテージ曲線。values[i] はビン i（時間範囲 [i×gridMs, (i+1)×gridMs)）の合成値。 */
export interface CompositeCurve {
  values: number[];
  gridMs: number;
}

/** 非chorusピーク。timeMs は代表時刻（ビン中心）、compositeRatio は信頼比（ピーク位置の合成値÷全体最大）。 */
export interface NonChorusPeak {
  timeMs: number;
  compositeRatio: number;
}

/** 見せ場の窓（重み付与前の中間表現）。chorus と climax は不変窓、nonChorus だけが切り詰め対象。 */
export interface ShowcaseWindow {
  startMs: number;
  endMs: number;
  /** 代表時刻。chorus は区間中心、非chorus はピーク時刻。重なり中点分割と重み計算に使う。 */
  representativeMs: number;
  /** 区間の出所。chorus 窓は切り詰めで動かさない。 */
  source: "chorus" | "nonChorus";
  isClimax: boolean;
}

export type { Showcase };
