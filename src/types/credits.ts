// クレジット（出典）の共有型。型のみを置く層に集約する。
// 既存の CharacterCredit を src/types/character.ts に置く先例に合わせ、クレジットの共有型をここに集める。
// これらの型は、出典データの集約（src/app/credits）と、その表示、後続の設定・クレジット画面（Issue #77）が
// 依存方向を乱さずに参照できるよう、共有の型の層に置く。

import type { CharacterCredit } from "./character";

/**
 * フォントの出典情報（アプリ内クレジットとREADMEに記す素材）。
 * 配布元は名称とアドレスの2項目に分ける。名称（sourceLabel）は表示の文言にし、
 * アドレス（sourceUrl）は配布元の絶対アドレスとして、他の外部アドレスと同じ基準で検証でき、
 * 名称を文言にしたリンクにできる。
 */
export interface FontCredit {
  /** 書体名。 */
  readonly fontName: string;
  /** 作者。 */
  readonly author: string;
  /** 配布元の名称（表示の文言。例: Google Fonts）。 */
  readonly sourceLabel: string;
  /** 配布元のアドレス（絶対アドレス）。 */
  readonly sourceUrl: string;
  /** ライセンス名（例: SIL Open Font License 1.1）。 */
  readonly license: string;
  /** 同梱したライセンス本文の場所（配信物の中のルート相対パス）。 */
  readonly licenseFileUrl: string;
}

/** 使用楽曲の出典情報。出所のアドレスは、版の番号まで含む完全な楽曲のアドレス。 */
export interface SongCredit {
  /** 題名。 */
  readonly title: string;
  /** 作者。 */
  readonly artist: string;
  /** 出所のアドレス（ピアプロの楽曲のアドレス）。 */
  readonly sourceUrl: string;
}

/**
 * 舞台土台の地形素材の出典情報（Issue #105）。地形は静的な3Dモデルとして用意し、素材源を明示する。
 * source は素材源の名称（配布元）、sourceUrl はその配布元のアドレス、note は素材の扱い（形式変換のみで
 * AI生成物でない旨など）を表す。最終的な文言と規約適合は Issue #106 で確定した。
 */
export interface TerrainSourceCredit {
  /** 地形素材の説明（例: 舞台土台の地形）。 */
  readonly label: string;
  /** 素材源の名称（配布元。例: 国土地理院 地理院地図（3D機能の数値標高データ））。 */
  readonly source: string;
  /** 素材源のアドレス（絶対アドレス）。 */
  readonly sourceUrl: string;
  /** 素材の扱いの説明（形式変換のみでAI生成物でない旨など）。 */
  readonly note: string;
}

/**
 * クレジットの集約結果。分散した出典データを1つに束ねた、表示の単一の出典。
 * character は初音ミクの指定文言、fonts は使用フォント、songs は使用楽曲、
 * terrain は舞台土台の地形素材、provenance はAI生成物を使っていない旨である。
 */
export interface CreditRegistry {
  readonly character: CharacterCredit;
  readonly fonts: readonly FontCredit[];
  readonly songs: readonly SongCredit[];
  readonly terrain: TerrainSourceCredit;
  readonly provenance: string;
}
