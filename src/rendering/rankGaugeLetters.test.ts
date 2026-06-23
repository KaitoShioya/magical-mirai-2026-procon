import { describe, expect, it } from "vitest";
import { RANK_GAUGE_LETTERS } from "./rankLetterAtlas";
import { RANKS_ASCENDING } from "../scoring/rank";

// ランク文字図版の並び（rendering 層の表示資産）が、ランク判定の唯一所有元 src/scoring/rank.ts の
// RANKS_ASCENDING と一致することを固定する。図版は rankIndex（rankOrdinal の値）でセルを選ぶため、
// この並びがずれると表示ランクと色・帯分けが食い違う。テストファイルが両者を比較してドリフトを防ぐ
// （rendering の実行時コードは scoring を import しない）。
describe("RANK_GAUGE_LETTERS", () => {
  it("並びが scoring の RANKS_ASCENDING と一致する", () => {
    expect([...RANK_GAUGE_LETTERS]).toEqual([...RANKS_ASCENDING]);
  });
});
