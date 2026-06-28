// 解析先行スキーマ検証ゲート 第2層（Issue #96 の枠組みをアフター・ザ・カーテンへ適用）。
// コミット済み成果物 after-the-curtain.profile.json そのものを対象に、JSONスキーマで表現できない深い不変条件を
// validateProfile で検査し、加えて生成器の出力と一致すること（鮮度）を確かめる。
// 第1層（ajv のJSONスキーマ構造検査）は scripts/harness/profile-schema.test.mjs が担う。構成は TAKEOVER の
// takeoverProfile.gate.test.ts と同一である。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateProfile } from "../schema/validateProfile";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { afterTheCurtainInputs } from "./afterTheCurtainInputs";
import { SONGS } from "../../config/songs";
import type { ProfileSource } from "../schema/profileSchema";

// 実データ（アフター・ザ・カーテンの音楽地図ダンプ）と、コミット済みの曲プロファイルを素のデータファイルとして読む。
// src/tools/ への import は一切しない（profiles から tools への依存禁止に抵触しない）。
const songmapPath = fileURLToPath(
  new URL("../../../docs/analysis/after-the-curtain.songmap.json", import.meta.url),
);
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

const committedPath = fileURLToPath(new URL("./after-the-curtain.profile.json", import.meta.url));
const committed = JSON.parse(readFileSync(committedPath, "utf8"));

// ロード元は登録済みの設定から組む。検証関数は source が SONGS の登録値と一致することを要求するためである。
const song = SONGS.find((s) => s.key === "after-the-curtain");
if (song === undefined) {
  throw new Error("ロード設定 SONGS に after-the-curtain が登録されていません");
}
const source: ProfileSource = {
  songKey: song.key,
  songUrl: song.songUrl,
  video: song.video,
};

describe("解析先行スキーマ検証ゲート 第2層（アフター・ザ・カーテン）", () => {
  it("深い検査: コミット済み after-the-curtain.profile.json が validateProfile を通る", () => {
    const validation = validateProfile(committed);
    // 不合格時に原因を一覧で見せるため、誤りの配列を空配列と比較する。
    const errors = validation.ok ? [] : validation.errors;
    expect(errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("基準N: コミット済み after-the-curtain.profile.json に同一 beatIndex を持つノーツが0件", () => {
    // 判定は playSession が beatIndex から判定時刻を引くため、同一 beatIndex の重複は同時刻判定と多様性逓減の
    // beatOffset キー衝突を招く重大な不変条件である。
    const notes = (committed as { notes: Array<{ beatIndex: number }> }).notes;
    const seen = new Set<number>();
    const duplicates: number[] = [];
    for (const n of notes) {
      if (seen.has(n.beatIndex)) duplicates.push(n.beatIndex);
      seen.add(n.beatIndex);
    }
    expect(duplicates).toEqual([]);
  });

  it("鮮度検査: コミット済みJSONが生成器の出力と構造一致する（古い成果物の混入検知）", () => {
    // buildProfile は時刻・乱数に依存しない決定的関数であり再生成物は一意であるため、不一致は「生成器または手動入力を
    // 変えたのに npm run profile:gen を再実行していない（古い成果物の混入）」を意味する。
    const { profile: rebuilt } = buildProfile({ songmap, manual: afterTheCurtainInputs, source });
    expect(committed).toEqual(rebuilt);
  });
});
