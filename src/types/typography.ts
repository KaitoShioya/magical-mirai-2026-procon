// タイポ・コンポジション譜面の共有型（Issue #33）。
//
// 役割: 曲固有の「演出割付の上書き」と「読ませる役の配置」を、データ上で機械的に判定できる形で表す型。
// 演出割付規則（Issue #132）が出す曲非依存の既定に対し、曲固有に「既定を採用する／既定を無効化する／
// 曲固有に追加する」の3種類で上書きし、最終優先度と読ませる役の配置を確定するための入力データである。
//
// 配置の理由: 文字エンジンと駆動部が属する src/typography/kineticText は依存規則で profiles を取り込めない。
// 一方この型は profiles（曲プロファイル）と typography（駆動部）の双方が使う。そこで双方が取り込める共有の
// 型置き場 src/types に型だけを置く。曲ごとの値（TAKEOVER の譜面データ）は src/profiles/takeover に置く。
//
// 値域の検査: この型の文字列項目（演出識別名・上書き種別・表示単位）と数値項目（割合・寸法・拍間隔）の値域は、
// 型では完全に縛れないため、曲プロファイルの検査（src/profiles/schema/validateProfile.ts）が実行時に確かめる。

/** 上書きの種類。既定採用・既定無効化・曲固有追加の3種。データ上でこの文字列により機械的に判定する。 */
export type TypographyOverrideDecision = "adoptDefault" | "disableDefault" | "addSongSpecific";

/** 読ませる役の表示単位。フレーズ全体・単語ごと・分割チャンクのいずれか。 */
export type ReadingDisplayUnit = "phrase" | "word" | "chunk";

/**
 * 適用する文字範囲。フレーズ内の単語番号・文字番号で開始と終了（いずれも含む）を表す。
 * この範囲を省略した上書きはフレーズ全体に適用する。
 */
export interface TypographyCharRange {
  /** 開始単語番号（フレーズ内、0始まり）。 */
  readonly startWordIndex: number;
  /** 開始文字番号（単語内、0始まり）。 */
  readonly startCharIndex: number;
  /** 終了単語番号（フレーズ内、0始まり、含む）。 */
  readonly endWordIndex: number;
  /** 終了文字番号（単語内、0始まり、含む）。 */
  readonly endCharIndex: number;
}

/** 演出割付の開始条件の上書き。指定した項目だけを上書きし、省略した項目は演出の宣言値を使う。 */
export interface TypographyStartConditionOverride {
  /** 発火の拍間隔（正の整数）。1は毎拍、2は2拍に1回。null は拍に同期しない。省略時は演出の宣言値。 */
  readonly beatCadence?: number | null;
}

/**
 * 1件の演出割付の曲固有上書き。あるフレーズ（必要なら文字範囲）に対し、ある演出識別名の既定を
 * 採用・無効化・追加し、開始条件と最終優先度の上書きを与える。
 */
export interface TypographyEffectOverride {
  /** 対象フレーズ番号（歌詞タイムラインのフレーズ番号と一致する安定値）。 */
  readonly phraseIndex: number;
  /** 適用する文字範囲。省略時はフレーズ全体。 */
  readonly range?: TypographyCharRange;
  /** 上書きの種類。 */
  readonly decision: TypographyOverrideDecision;
  /**
   * 対象とする演出識別名（演出割付規則の EFFECT_ID の値のいずれか）。
   * decision が disableDefault または addSongSpecific のときは必須。adoptDefault のときは省略してよい
   * （省略時はそのフレーズの既定全体を明示的に採用する意図を表す）。
   */
  readonly effectId?: string;
  /** 開始条件の上書き（省略時は演出の宣言値）。 */
  readonly startCondition?: TypographyStartConditionOverride;
  /**
   * 最終優先度への加算上書き値。省略時は 0（上書き無し）。
   * 最終優先度 = 演出の既定優先度 + 演出割付規則の条件補正 + この値。
   */
  readonly finalPriority?: number;
}

/**
 * カメラ正対面上の表示領域。画面に対する相対値（割合）で、中心位置と幅・高さを表す。
 * 各割合は 0 以上 1 以下。横は画面の左端を 0、右端を 1、縦は画面の上端を 0、下端を 1 とする。
 */
export interface TypographyDisplayRegion {
  /** 中心の横位置の割合（0 以上 1 以下）。 */
  readonly centerXRatio: number;
  /** 中心の縦位置の割合（0 以上 1 以下）。 */
  readonly centerYRatio: number;
  /** 幅の割合（0 より大きく 1 以下）。 */
  readonly widthRatio: number;
  /** 高さの割合（0 より大きく 1 以下）。 */
  readonly heightRatio: number;
}

/**
 * 1フレーズの読ませる役の配置。表示単位・想定表示寸法・表示領域を持つ。
 * 想定表示寸法と表示領域を譜面に持つ理由は、最小表示寸法を満たすだけでは狭い位置へ出すと衝突するため、
 * 配置の確定を譜面側で行うためである。
 */
export interface TypographyReadingPlacement {
  /** 対象フレーズ番号。 */
  readonly phraseIndex: number;
  /** 読ませる役の表示単位。 */
  readonly unit: ReadingDisplayUnit;
  /** 想定表示寸法（デバイス画素での文字高）。最小表示寸法以上であること。 */
  readonly targetPixelHeight: number;
  /** 表示領域（カメラ正対面上の相対矩形）。 */
  readonly region: TypographyDisplayRegion;
}

/**
 * タイポ・コンポジション譜面。曲固有の演出割付の上書きと読ませる役の配置の集合。
 * 曲プロファイル型 SongProfile には任意項目 typographyChart? としてこの型を合流させる。
 */
export interface TypographyChart {
  /** 演出割付の曲固有上書きの一覧。 */
  readonly effectOverrides: readonly TypographyEffectOverride[];
  /** 読ませる役の配置の一覧。 */
  readonly readingPlacements: readonly TypographyReadingPlacement[];
}
