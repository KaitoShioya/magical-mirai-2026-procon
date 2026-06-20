import { describe, it, expect } from "vitest";

// README の本文は、ビルド工具の生文字列取り込み（?raw）で文字列として取り込む。
// node:fs を使わない理由を先に述べる。アプリ本体の型設定（tsconfig.json）が取り込む型は vite/client だけで
// Node の型を含まず、node:fs を使うと型検査が失敗する。?raw の型は vite/client が文字列として宣言するため通る。
import readmeText from "../../../README.md?raw";

import { PCL_CREDIT } from "../../config/character";
import { AI_PROVENANCE_STATEMENT } from "../../config/credits";
import { DEFAULT_SONG_KEY, findSong } from "../../config/songs";
import { ZEN_KAKU_GOTHIC_NEW_CREDIT } from "../../typography/kineticText/fontCredits";

describe("README のライセンス・出典がアプリ内の出典と一致する", () => {
  const song = findSong(DEFAULT_SONG_KEY);

  // 達成基準で列挙した全項目を、元データの定数から組み立てる。
  // 一部だけの確認では、抜けた項目が README から欠けても検出できないため、全項目を対象にする。
  const required: readonly string[] = [
    PCL_CREDIT.subject,
    PCL_CREDIT.licenseName,
    PCL_CREDIT.licenseUrl,
    PCL_CREDIT.rightsHolder,
    PCL_CREDIT.guidelineNote,
    ZEN_KAKU_GOTHIC_NEW_CREDIT.fontName,
    ZEN_KAKU_GOTHIC_NEW_CREDIT.author,
    ZEN_KAKU_GOTHIC_NEW_CREDIT.sourceLabel,
    ZEN_KAKU_GOTHIC_NEW_CREDIT.sourceUrl,
    ZEN_KAKU_GOTHIC_NEW_CREDIT.license,
    ZEN_KAKU_GOTHIC_NEW_CREDIT.licenseFileUrl,
    song.title,
    song.artist,
    song.songUrl,
    AI_PROVENANCE_STATEMENT,
  ];

  for (const text of required) {
    it(`README に「${text}」が含まれる`, () => {
      expect(readmeText).toContain(text);
    });
  }
});
