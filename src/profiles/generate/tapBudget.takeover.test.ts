import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { estimateFullPossibleTaps, generateTapBudget, type TapBudgetInput } from "./tapBudget";
import { TAP_LIMIT_RATIO_MIN, TAP_LIMIT_RATIO_MAX } from "../../config/tuning";
import { validateProfile } from "../schema/validateProfile";
import { minimalValidProfile } from "../schema/fixtures/minimalValidProfile";
import type { SongProfile } from "../schema/profileSchema";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない
// （profiles から tools への依存禁止に抵触しない）。songmap → TapBudgetInput の変換はテスト側で行い、
// 生成関数を songmap の形から切り離す。これは #45 の生成スクリプトが行う変換と同じである。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as {
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
  beats: { startTime: number }[];
};

function toTapBudgetInput(): TapBudgetInput {
  return {
    beatsMs: songmap.beats.map((b) => b.startTime),
    chorusSegments: songmap.segments
      .filter((s) => s.isChorus)
      .map((s) => ({ startMs: s.startTime, endMs: s.endTime })),
  };
}

// 期待値の出典。docs/research/07-feasibility-and-parameters.md §2.1（フル母数434）と §2.2（上限260=母数×0.6）。
const EXPECTED_FULL_POSSIBLE = 434;
const EXPECTED_LIMIT = 260;

describe("タップ総数上限算出 実データ検証（Issue #44 受け入れ基準）", () => {
  const input = toTapBudgetInput();

  it("達成基準1: フルに可能なタップの総数（母数）が434になる", () => {
    expect(estimateFullPossibleTaps(input)).toBe(EXPECTED_FULL_POSSIBLE);
  });

  it("達成基準2: tapBudget が母数434・上限260で、比率が許容範囲に収まる", () => {
    const budget = generateTapBudget(input);
    expect(budget).toEqual({ fullPossible: EXPECTED_FULL_POSSIBLE, limit: EXPECTED_LIMIT });
    const ratio = budget.limit / budget.fullPossible;
    expect(ratio).toBeGreaterThanOrEqual(TAP_LIMIT_RATIO_MIN);
    expect(ratio).toBeLessThanOrEqual(TAP_LIMIT_RATIO_MAX);
  });

  it("達成基準3: 上限が母数より小さい（取捨選択が生じる一回性の成立条件）", () => {
    const budget = generateTapBudget(input);
    expect(budget.limit).toBeLessThan(budget.fullPossible);
  });

  it("達成基準4: 算出した tapBudget はプロファイルのスキーマ検証に合格する", () => {
    const budget = generateTapBudget(input);
    const profile: SongProfile = { ...structuredClone(minimalValidProfile), tapBudget: budget };
    const result = validateProfile(profile);
    expect(result.ok).toBe(true);
  });
});
