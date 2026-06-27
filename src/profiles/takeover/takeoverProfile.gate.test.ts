// 解析先行スキーマ検証ゲート（Issue #96 第2層）。
// コミット済み成果物 takeover.profile.json そのものを対象に、JSONスキーマで表現できない深い不変条件を
// validateProfile で検査し、加えて生成器の出力と一致すること（鮮度）を確かめる。
// 第1層（ajv のJSONスキーマ構造検査）は scripts/harness/profile-schema.test.mjs が担う。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateProfile } from "../schema/validateProfile";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { takeoverInputs } from "./takeoverInputs";
import { SONGS } from "../../config/songs";
import type { ProfileSource } from "../schema/profileSchema";

// 実データ（TAKEOVERの音楽地図ダンプ）と、コミット済みの曲プロファイルを素のデータファイルとして読む。
// src/tools/ への import は一切しない（profiles から tools への依存禁止に抵触しない）。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

const committedPath = fileURLToPath(new URL("./takeover.profile.json", import.meta.url));
const committed = JSON.parse(readFileSync(committedPath, "utf8"));

// ロード元は登録済みの TAKEOVER 設定から組む。検証関数は source が SONGS の登録値と一致することを要求するためである。
const takeoverSong = SONGS.find((s) => s.key === "takeover");
if (takeoverSong === undefined) {
  throw new Error("ロード設定 SONGS に takeover が登録されていません");
}
const source: ProfileSource = {
  songKey: takeoverSong.key,
  songUrl: takeoverSong.songUrl,
  video: takeoverSong.video,
};

describe("解析先行スキーマ検証ゲート 第2層（Issue #96 受け入れ基準）", () => {
  it("深い検査: コミット済み takeover.profile.json が validateProfile を通る", () => {
    // ゲート入力（docs/research/08-quality-assurance.md §3）は「曲プロファイルのJSON」と定義される。再生成物では
    // なくコミット済み成果物そのものを、JSONスキーマで表現できない深い不変条件（連続被覆・slots↔chords1対1対応・
    // source照合・ncRanges対応など）で直接検査することで、成果物の正しさを保証する。
    const validation = validateProfile(committed);
    // 不合格時に原因を一覧で見せるため、誤りの配列を空配列と比較する。
    const errors = validation.ok ? [] : validation.errors;
    expect(errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("基準N: コミット済み takeover.profile.json に同一 beatIndex を持つノーツが0件", () => {
    // 配置の理由を先に述べる。判定は playSession が beatIndex から判定時刻を引くため、同一 beatIndex の重複は
    // 同時刻判定と多様性逓減の beatOffset キー衝突を招く重大な不変条件であり、コミット済み成果物そのものを検査する
    // ゲートで強く守るのが適切だからである（再設計プラン フェーズ3・新節5）。
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
    // 文字列比較では JSON.stringify の整形差やキー順で誤検出するため、解析後オブジェクトの構造比較を用いる。
    // buildProfile は時刻・乱数に依存しない決定的関数であり再生成物は一意であるため、不一致は「生成器または手動入力を
    // 変えたのに npm run profile:gen を再実行していない（古い成果物の混入）」を意味する。
    const { profile: rebuilt } = buildProfile({ songmap, manual: takeoverInputs, source });
    expect(committed).toEqual(rebuilt);
  });
});
