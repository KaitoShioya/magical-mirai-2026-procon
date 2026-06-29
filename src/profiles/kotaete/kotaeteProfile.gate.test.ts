// 解析先行スキーマ検証ゲート（Issue #96 第2層）の「こたえて」版。
// コミット済み成果物 kotaete.profile.json そのものを対象に、JSONスキーマで表現できない深い不変条件を
// validateProfile で検査し、加えて生成器の出力と一致すること（鮮度）を確かめる。
// 第1層（ajv のJSONスキーマ構造検査）は scripts/harness/profile-schema.test.mjs が担う。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateProfile } from "../schema/validateProfile";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { kotaeteInputs } from "./kotaeteInputs";
import { SONGS } from "../../config/songs";
import type { ProfileSource } from "../schema/profileSchema";

// 実データ（「こたえて」の音楽地図ダンプ）と、コミット済みの曲プロファイルを素のデータファイルとして読む。
// src/tools/ への import は一切しない（profiles から tools への依存禁止に抵触しない）。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/kotaete.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

const committedPath = fileURLToPath(new URL("./kotaete.profile.json", import.meta.url));
const committed = JSON.parse(readFileSync(committedPath, "utf8"));

// ロード元は登録済みの「こたえて」設定から組む。検証関数は source が SONGS の登録値と一致することを要求するためである。
const kotaeteSong = SONGS.find((s) => s.key === "kotaete");
if (kotaeteSong === undefined) {
  throw new Error("ロード設定 SONGS に kotaete が登録されていません");
}
const source: ProfileSource = {
  songKey: kotaeteSong.key,
  songUrl: kotaeteSong.songUrl,
  video: kotaeteSong.video,
};

describe("解析先行スキーマ検証ゲート 第2層「こたえて」（Issue #96 受け入れ基準）", () => {
  it("深い検査: コミット済み kotaete.profile.json が validateProfile を通る", () => {
    const validation = validateProfile(committed);
    const errors = validation.ok ? [] : validation.errors;
    expect(errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("基準N: コミット済み kotaete.profile.json に同一 beatIndex を持つノーツが0件", () => {
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
    const { profile: rebuilt } = buildProfile({ songmap, manual: kotaeteInputs, source });
    expect(committed).toEqual(rebuilt);
  });

  it("構造基準: 見せ場ちょうど9個・クライマックス1個・タップ上限比率が0.4以上0.8以下", () => {
    const profile = committed as {
      showcases: Array<{ isClimax: boolean }>;
      tapBudget: { fullPossible: number; limit: number };
    };
    // 「こたえて」はサビ区間9個を全て見せ場にする（showcaseCount=9）。
    expect(profile.showcases).toHaveLength(9);
    expect(profile.showcases.filter((s) => s.isClimax)).toHaveLength(1);
    const ratio = profile.tapBudget.limit / profile.tapBudget.fullPossible;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.8);
  });
});
