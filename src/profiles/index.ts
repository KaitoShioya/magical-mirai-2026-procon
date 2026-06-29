// 曲束（バンドル）レジストリ。曲キーごとに、統括（src/app）が本編プレイの結線で使う曲依存データを1つにまとめて引けるようにする。
// 統括が個々のプロファイル・タイポ譜面・読ませる役の既定を曲ごとに直接 import する代わりに、本レジストリからキーで束を引く。
// これにより題名画面で選んだ曲へ統括が結線を差し替えられる。
//
// 依存方針: スキーマ型・各曲のプロファイルとタイポ譜面・型置き場 src/types のデータ型・曲ロード設定の既定キーだけを取り込み、
// 中核（engine 等）・rendering・tools・three.js は取り込まない（docs/decisions/architecture.md §5 の依存規則）。

import { DEFAULT_SONG_KEY } from "../config/songs";
import type { SongProfile } from "./schema";
import type { TypographyChart, TypographyDisplayRegion, ReadingDisplayUnit } from "../types/typography";
import { takeoverProfile } from "./takeover/profile";
import {
  takeoverTypographyChart,
  TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
  TAKEOVER_DEFAULT_READING_REGION,
} from "./takeover/typographyChart";
import { afterTheCurtainProfile } from "./after-the-curtain/profile";
import {
  afterTheCurtainTypographyChart,
  AFTER_THE_CURTAIN_DEFAULT_READING_PIXEL_HEIGHT,
  AFTER_THE_CURTAIN_DEFAULT_READING_REGION,
} from "./after-the-curtain/typographyChart";
import { toritsukuLogyProfile } from "./toritsuku-logy/profile";
import {
  toritsukuLogyTypographyChart,
  TORITSUKU_LOGY_DEFAULT_READING_PIXEL_HEIGHT,
  TORITSUKU_LOGY_DEFAULT_READING_REGION,
} from "./toritsuku-logy/typographyChart";
import { kotaeteProfile } from "./kotaete/profile";
import {
  kotaeteTypographyChart,
  KOTAETE_DEFAULT_READING_PIXEL_HEIGHT,
  KOTAETE_DEFAULT_READING_REGION,
} from "./kotaete/typographyChart";

/** 1曲分の曲依存データの束。統括が本編プレイの結線で使う。 */
export interface SongBundle {
  /** 検証済みの曲プロファイル（譜面・カメラ・色・操作音・見せ場・多様性逓減区間・タップ上限など）。 */
  readonly profile: SongProfile;
  /** 曲固有のタイポ譜面（演出割付の上書きと読ませる役の配置）。 */
  readonly typographyChart: TypographyChart;
  /** 配置指定の無いフレーズの既定の読ませる役の表示単位。 */
  readonly defaultReadingUnit: ReadingDisplayUnit;
  /** 配置指定の無いフレーズの既定の想定表示寸法（デバイス画素）。 */
  readonly defaultReadingPixelHeight: number;
  /** 配置指定の無いフレーズの既定の表示領域。 */
  readonly defaultReadingRegion: TypographyDisplayRegion;
}

// 曲キーから曲束を引く表。横展開で曲を増やすときはここへ追加する。読ませる役の既定の表示単位は両曲ともフレーズ単位とする。
const BUNDLES_BY_KEY: Record<string, SongBundle> = {
  takeover: {
    profile: takeoverProfile,
    typographyChart: takeoverTypographyChart,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: TAKEOVER_DEFAULT_READING_REGION,
  },
  "after-the-curtain": {
    profile: afterTheCurtainProfile,
    typographyChart: afterTheCurtainTypographyChart,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: AFTER_THE_CURTAIN_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: AFTER_THE_CURTAIN_DEFAULT_READING_REGION,
  },
  "toritsuku-logy": {
    profile: toritsukuLogyProfile,
    typographyChart: toritsukuLogyTypographyChart,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: TORITSUKU_LOGY_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: TORITSUKU_LOGY_DEFAULT_READING_REGION,
  },
  kotaete: {
    profile: kotaeteProfile,
    typographyChart: kotaeteTypographyChart,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: KOTAETE_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: KOTAETE_DEFAULT_READING_REGION,
  },
};

/** 選べる全曲の曲束（灯しの収容上限など全曲にまたがる値の算出に使う）。 */
export const ALL_SONG_BUNDLES: readonly SongBundle[] = Object.values(BUNDLES_BY_KEY);

/** 曲キーで曲束を引く。未登録のキーでは既定曲の束へ倒す（findSong の既定曲フォールバックと同じ方針）。 */
export function songBundle(key: string): SongBundle {
  return BUNDLES_BY_KEY[key] ?? BUNDLES_BY_KEY[DEFAULT_SONG_KEY];
}
