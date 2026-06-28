// クレジット（出典）の集約。分散した出典データを参照して、表示の単一の出典を組み立てる。
// 複数のサブシステムからデータを集める結線であり、統括（src/app）の責務に置く
// （既存の src/app/attribution.ts・src/app/overlay.ts と同じ位置付け）。

import { PCL_CREDIT } from "../../config/character";
import { AI_PROVENANCE_STATEMENT } from "../../config/credits";
import type { Song } from "../../config/songs";
import { LAKE_STAGE } from "../../config/stage";
// 出典の値だけを直接取り込み、文字エンジン本体や three.js を巻き込まない。
import {
  MPLUS_1_CREDIT,
  ZEN_KAKU_GOTHIC_NEW_CREDIT,
} from "../../typography/kineticText/fontCredits";
import type { CreditRegistry } from "../../types/credits";

/**
 * 使用楽曲から、表示の単一の出典（CreditRegistry）を組み立てる。
 * character は PCL_CREDIT をそのまま入れて二重定義を避ける。
 * songs には実際にロードする曲を1件入れる（曲選択のアプリ反映は未実装のため、現状で渡された曲を表示する）。
 */
export function buildCreditRegistry(
  song: Pick<Song, "title" | "artist" | "songUrl">
): CreditRegistry {
  return {
    character: PCL_CREDIT,
    fonts: [ZEN_KAKU_GOTHIC_NEW_CREDIT, MPLUS_1_CREDIT],
    songs: [
      {
        title: song.title,
        artist: song.artist,
        sourceUrl: song.songUrl,
      },
    ],
    terrain: LAKE_STAGE.sourceCredit,
    provenance: AI_PROVENANCE_STATEMENT,
  };
}
