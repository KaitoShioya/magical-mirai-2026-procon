// 曲プロファイルのレジストリ（Issue #88 横展開）。
// 曲キーから、その曲の実装データ束（検証済みプロファイル・タイポ譜面・読ませる役の既定）を引く。
// 統括（src/app）は起動曲の束をここから取り、曲依存の構築（カメラ軌跡・セッション・落下式レーン等）に使う。
//
// 依存方針: src/profiles 配下（各曲の profile.ts・typographyChart.ts とスキーマ型）と src/types のデータ型・
// src/config の曲キーだけを取り込み、engine・rendering・tools・three.js は取り込まない（依存規則 docs/decisions/architecture.md §5、
// src/profiles/README.md）。レジストリ自身が profiles を集約することは規則に反しない。

import { DEFAULT_SONG_KEY } from "../config/songs";
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
import { shutterChanceProfile } from "./shutter-chance/profile";
import {
  shutterChanceTypographyChart,
  SHUTTER_CHANCE_DEFAULT_READING_PIXEL_HEIGHT,
  SHUTTER_CHANCE_DEFAULT_READING_REGION,
} from "./shutter-chance/typographyChart";

/** 1曲ぶんの実装データ束。曲依存の構築に必要な値だけをまとめる。 */
export interface SongProfileBundle {
  /** 検証済みの曲プロファイル（譜面・見せ場・カメラ軌跡・スロット等）。 */
  profile: SongProfile;
  /** 曲固有のタイポ譜面。 */
  typographyChart: TypographyChart;
  /** 配置指定の無いフレーズの既定の読ませる役の表示単位。 */
  defaultReadingUnit: ReadingDisplayUnit;
  /** 配置指定の無いフレーズの既定の想定表示寸法（デバイス画素）。 */
  defaultReadingPixelHeight: number;
  /** 配置指定の無いフレーズの既定の表示領域。 */
  defaultReadingRegion: TypographyDisplayRegion;
}

// 既定の読ませる役の表示単位はフレーズ単位。理由を先に述べる。歌詞は文節（フレーズ）でひとまとまりに読ませるのが
// 自然で、TAKEOVER の本編結線もフレーズ単位を既定にしている。曲ごとに変える必要が生じたら束の値で上書きする。
const DEFAULT_READING_UNIT: ReadingDisplayUnit = "phrase";

/** 曲キー→実装データ束の対応表。実装済み（題名画面で開始でき通しプレイできる）曲だけを登録する。 */
const REGISTRY: Record<string, SongProfileBundle> = {
  takeover: {
    profile: takeoverProfile,
    typographyChart: takeoverTypographyChart,
    defaultReadingUnit: DEFAULT_READING_UNIT,
    defaultReadingPixelHeight: TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: TAKEOVER_DEFAULT_READING_REGION,
  },
  "shutter-chance": {
    profile: shutterChanceProfile,
    typographyChart: shutterChanceTypographyChart,
    defaultReadingUnit: DEFAULT_READING_UNIT,
    defaultReadingPixelHeight: SHUTTER_CHANCE_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: SHUTTER_CHANCE_DEFAULT_READING_REGION,
  },
};

/** 曲キーに実装データ束が登録されている（遊べる曲である）かを返す。 */
export function hasSongBundle(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRY, key);
}

/** 曲キーで実装データ束を引く。未登録なら既定曲の束へ退避する（既定曲は必ず登録される）。 */
export function getSongBundle(key: string): SongProfileBundle {
  const bundle = REGISTRY[key] ?? REGISTRY[DEFAULT_SONG_KEY];
  if (bundle === undefined) {
    throw new Error(`曲プロファイル束が見つかりません: "${key}"（既定曲 "${DEFAULT_SONG_KEY}" も未登録）`);
  }
  return bundle;
}

/**
 * 起動曲キーを解決する。
 * 動作を先に述べる。引数のキーがレジストリに登録済み（実装データ束が存在する＝遊べる曲）であればそのキーを、
 * そうでなければ DEFAULT_SONG_KEY を返す。
 * 採用理由を先に述べる。findSong（src/config/songs.ts）は未実装曲（束が無い曲）でもキー一致なら返すため、
 * 未実装キーをそのまま起動曲にすると束が無く起動が破綻する。起動曲キーは必ず登録済みへ丸める。DEFAULT_SONG_KEY は
 * 常に登録するため退避先は必ず存在する。
 */
export function resolveSongKey(raw: string | null): string {
  return raw !== null && hasSongBundle(raw) ? raw : DEFAULT_SONG_KEY;
}

/** 登録済み（実装済み）の曲キー一覧。 */
export function implementedSongKeys(): string[] {
  return Object.keys(REGISTRY);
}
