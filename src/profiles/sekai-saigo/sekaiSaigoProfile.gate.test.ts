// 解析先行スキーマ検証ゲート（Issue #96 第2層）の世界最後の音楽隊版（横展開 Issue #89）。
// コミット済み成果物 sekai-saigo.profile.json そのものを対象に、JSONスキーマで表現できない深い不変条件を
// validateProfile で検査し、加えて生成器の出力と一致すること（鮮度）と、多様性逓減が本曲で実際に働くことを確かめる。
// 第1層（ajv のJSONスキーマ構造検査）は scripts/harness/profile-schema.test.mjs が担う。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateProfile } from "../schema/validateProfile";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { buildDiversityIndex, type DiversityNoteInput } from "../../scoring/diversityIndex";
import { sekaiSaigoInputs } from "./sekaiSaigoInputs";
import { SONGS } from "../../config/songs";
import type { ProfileSource } from "../schema/profileSchema";

// 実データ（世界最後の音楽隊の音楽地図ダンプ）と、コミット済みの曲プロファイルを素のデータファイルとして読む。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/sekai-saigo.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

const committedPath = fileURLToPath(new URL("./sekai-saigo.profile.json", import.meta.url));
const committed = JSON.parse(readFileSync(committedPath, "utf8"));

// ロード元は登録済みの sekai-saigo 設定から組む。検証関数は source が SONGS の登録値と一致することを要求するためである。
const sekaiSaigoSong = SONGS.find((s) => s.key === "sekai-saigo");
if (sekaiSaigoSong === undefined) {
  throw new Error("ロード設定 SONGS に sekai-saigo が登録されていません");
}
const source: ProfileSource = {
  songKey: sekaiSaigoSong.key,
  songUrl: sekaiSaigoSong.songUrl,
  video: sekaiSaigoSong.video,
};

describe("解析先行スキーマ検証ゲート 第2層・世界最後の音楽隊（Issue #89 横展開）", () => {
  it("深い検査: コミット済み sekai-saigo.profile.json が validateProfile を通る", () => {
    const validation = validateProfile(committed);
    const errors = validation.ok ? [] : validation.errors;
    expect(errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("基準N: コミット済み sekai-saigo.profile.json に同一 beatIndex を持つノーツが0件", () => {
    // 判定は playSession が beatIndex から判定時刻を引くため、同一 beatIndex の重複は同時刻判定と多様性逓減の
    // beatOffset キー衝突を招く重大な不変条件であり、コミット済み成果物そのものを検査するゲートで強く守る。
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
    const { profile: rebuilt } = buildProfile({ songmap, manual: sekaiSaigoInputs, source });
    expect(committed).toEqual(rebuilt);
  });

  it("多様性逓減が本曲で働く: 第2サビに第1サビと同じ拍オフセットの正解スロットが1つ以上ある", () => {
    // 判定方法の理由を先に述べる。多様性逓減は前回区間（第1サビ＝区間索引0）に同じ拍オフセットの正解スロットがある
    // 箇所でのみ働き、無い箇所は係数1.0で空振りする。よって第2サビ（区間索引1）のノーツのうち前回区間に同じ拍オフセットが
    // 存在するものが皆無だと、逓減が本曲で完全に無効になる。これを検知する最小条件として「重なり1つ以上」を固定する。
    const notes: DiversityNoteInput[] = (
      committed as { notes: Array<{ id: string; timeMs: number; beatIndex: number; slotIndex: number }> }
    ).notes.map((n) => ({ id: n.id, timeMs: n.timeMs, beatIndex: n.beatIndex, slotIndex: n.slotIndex }));
    const zones = (
      committed as { diversityZones: Array<{ startTimeMs: number; endTimeMs: number }> }
    ).diversityZones.map((z) => ({ startTimeMs: z.startTimeMs, endTimeMs: z.endTimeMs }));
    expect(zones.length).toBeGreaterThanOrEqual(2);

    const index = buildDiversityIndex(notes, zones);
    // 区間索引1（第2サビ）のノーツのうち、前回区間（索引0＝第1サビ）の正解スロット表に同じ拍オフセットが存在する数を数える。
    const previousOfZone1 = index.previousZoneIndex[1];
    expect(previousOfZone1).toBe(0);
    const zone0Slots = index.zoneCorrectSlots[0];
    let overlaps = 0;
    for (const position of index.byNoteId.values()) {
      if (position.zoneIndex === 1 && zone0Slots.has(position.beatOffset)) overlaps += 1;
    }
    expect(overlaps).toBeGreaterThanOrEqual(1);
  });
});
