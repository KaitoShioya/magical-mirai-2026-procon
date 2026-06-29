// 曲プロファイルの登録窓。実装済み曲のキーから、統括（src/app）が本編表示と判定の結線に必要な「曲の束」
//（曲プロファイル・タイポ譜面・読ませる役の既定）を返す。1ページ読込が1曲に対応する設計（統括が起動時に
// 選択曲で構成し、曲の切り替えは再読込で行う）のため、本窓は1曲分の束を引くだけでよい。
//
// 取り込み範囲の方針を先に述べる。本ファイルが取り込んでよいのは各曲の profile.ts・typographyChart.ts の値と
// スキーマ・型置き場の型のみであり、エンジン・描画・採点・ツールは取り込まない（依存規則 docs/decisions/architecture.md §5。
// 既存の src/profiles/takeover/profile.ts と同じ取り込み範囲）。コーラス補正など実行時の歌詞変換は textalive 層に属するため
// 本束には含めず、統括（src/app）が曲に応じて再生層へ渡す。

import type { SongProfile } from "./schema";
import type {
  TypographyChart,
  TypographyDisplayRegion,
  ReadingDisplayUnit,
} from "../types/typography";
import { takeoverProfile } from "./takeover/profile";
import {
  takeoverTypographyChart,
  TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
  TAKEOVER_DEFAULT_READING_REGION,
} from "./takeover/typographyChart";
import { kotaeteProfile } from "./kotaete/profile";
import {
  kotaeteTypographyChart,
  KOTAETE_DEFAULT_READING_PIXEL_HEIGHT,
  KOTAETE_DEFAULT_READING_REGION,
} from "./kotaete/typographyChart";

/** 統括が1曲を構成するために必要な、曲固有のデータの束。 */
export interface SongBundle {
  /** 検証済みの曲プロファイル（譜面・カメラ・見せ場・スロット・タップ上限など）。 */
  profile: SongProfile;
  /** 曲固有のタイポ譜面（演出上書きと読ませる役の配置）。 */
  typographyChart: TypographyChart;
  /** 配置指定の無いフレーズの既定の読ませる役の表示単位。 */
  defaultReadingUnit: ReadingDisplayUnit;
  /** 配置指定の無いフレーズの既定の想定表示寸法（デバイス画素）。 */
  defaultReadingPixelHeight: number;
  /** 配置指定の無いフレーズの既定の表示領域。 */
  defaultReadingRegion: TypographyDisplayRegion;
}

// 実装済み曲のキーから束への登録表。曲を横展開するときはここへ追加する。
// 既定の読ませる役の表示単位は、いずれの曲もフレーズ単位（既存の統括の既定と同じ）とする。
const BUNDLES: Record<string, SongBundle> = {
  takeover: {
    profile: takeoverProfile,
    typographyChart: takeoverTypographyChart,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: TAKEOVER_DEFAULT_READING_REGION,
  },
  kotaete: {
    profile: kotaeteProfile,
    typographyChart: kotaeteTypographyChart,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: KOTAETE_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: KOTAETE_DEFAULT_READING_REGION,
  },
};

/** 実装済み曲のキーから曲の束を引く。未登録のキーは明確に失敗させる
 *  （プロファイルは設定でなく内容であり、欠落時は明確に失敗させる。architecture.md §3.6）。 */
export function getSongBundle(key: string): SongBundle {
  const bundle = BUNDLES[key];
  if (bundle === undefined) {
    throw new Error(
      `曲プロファイルの束が未登録です: "${key}"（登録済み: ${Object.keys(BUNDLES).join(", ")}）`,
    );
  }
  return bundle;
}

/** 選択可能な全曲の束を列挙する。全曲横断の計算に使う（例: 灯しの収容上限＝全曲のノーツ数の最大）。 */
export function selectableSongBundles(): readonly SongBundle[] {
  return Object.values(BUNDLES);
}
