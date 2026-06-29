// 解析先行スキーマ検証ゲート 第2層のシャッターチャンス版（Issue #96 を横展開・Issue #88）。
// コミット済み成果物 shutter-chance.profile.json そのものを対象に、JSONスキーマで表現できない深い不変条件を
// validateProfile で検査し、加えて生成器の出力と一致すること（鮮度）を確かめる。TAKEOVER の gate テストに倣う。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateProfile } from "../schema/validateProfile";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { shutterChanceInputs } from "./shutterChanceInputs";
import { SONGS } from "../../config/songs";
import type { ProfileSource } from "../schema/profileSchema";

const songmapPath = fileURLToPath(new URL("../../../docs/analysis/shutter-chance.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

const committedPath = fileURLToPath(new URL("./shutter-chance.profile.json", import.meta.url));
const committed = JSON.parse(readFileSync(committedPath, "utf8"));

const shutterChanceSong = SONGS.find((s) => s.key === "shutter-chance");
if (shutterChanceSong === undefined) {
  throw new Error("ロード設定 SONGS に shutter-chance が登録されていません");
}
const source: ProfileSource = {
  songKey: shutterChanceSong.key,
  songUrl: shutterChanceSong.songUrl,
  video: shutterChanceSong.video,
};

describe("解析先行スキーマ検証ゲート 第2層 シャッターチャンス（Issue #88）", () => {
  it("深い検査: コミット済み shutter-chance.profile.json が validateProfile を通る", () => {
    const validation = validateProfile(committed);
    const errors = validation.ok ? [] : validation.errors;
    expect(errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("基準N: コミット済み shutter-chance.profile.json に同一 beatIndex を持つノーツが0件", () => {
    // 同一 beatIndex の重複は同時刻判定と多様性逓減の beatOffset キー衝突を招くため、コミット済み成果物そのもので守る。
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
    const { profile: rebuilt } = buildProfile({ songmap, manual: shutterChanceInputs, source });
    expect(committed).toEqual(rebuilt);
  });
});
