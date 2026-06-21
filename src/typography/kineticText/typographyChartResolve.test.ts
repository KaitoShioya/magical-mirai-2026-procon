// タイポ譜面の適用と最終優先度確定（Issue #33）の単体テスト。
// 最終優先度の加算式（上書き無しは恒等、上書きありは加算）、採用・無効化・追加の3種、並べ替えを固定する。

import { describe, it, expect } from "vitest";
import {
  computeFinalPriority,
  resolveTypographyChart,
  findUnknownChartEffectIds,
} from "./typographyChartResolve";
import { createEffectRegistry } from "./effectElement";
import type { EffectRegistry } from "./effectElement";
import { charSmash } from "./effects/charSmash";
import { EFFECT_ID } from "./effectAssignment";
import type { AssignmentPlan, EffectAssignment, SegmentAssignment } from "./effectAssignment";
import type { TypographyChart } from "../../types/typography";

function registryWithSmash(): EffectRegistry {
  const registry = createEffectRegistry();
  registry.register(charSmash);
  return registry;
}

function smashAssignment(priorityAdjustment: number): EffectAssignment {
  return {
    effectId: EFFECT_ID.smash,
    grammar: "smash",
    declaredTargetUnit: "char",
    applyGranularity: "char",
    priorityAdjustment,
    segmentCharCadenceBeats: 2,
    effectBeatCadenceBeats: 2,
    status: "active",
  };
}

function singleSegmentPlan(phraseIndex: number, assignments: EffectAssignment[]): AssignmentPlan {
  const segment: SegmentAssignment = {
    startTimeMs: 0,
    endTimeMs: 1000,
    granularity: "char",
    reason: "shortDense",
    phraseIndex,
    unitRefs: [{ phraseIndex }],
    phraseChunk: null,
    charCadenceBeats: 2,
    assignments,
  };
  return { segments: [segment] };
}

describe("computeFinalPriority 最終優先度の加算式", () => {
  it("上書きが無い（0）と既定優先度と条件補正の和になる", () => {
    expect(computeFinalPriority(5, 20, 0)).toBe(25);
  });

  it("3層すべて0なら0（恒等）", () => {
    expect(computeFinalPriority(0, 0, 0)).toBe(0);
  });

  it("上書きありは3層の加算結果になる", () => {
    expect(computeFinalPriority(5, 20, 10)).toBe(35);
  });

  it("負の上書きも加算する（切り詰めない）", () => {
    expect(computeFinalPriority(0, 0, -7)).toBe(-7);
  });
});

describe("resolveTypographyChart 既定採用", () => {
  it("譜面が無いと既定割付がそのまま確定し、最終優先度は既定優先度＋条件補正になる", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(20)]);
    const resolved = resolveTypographyChart(plan, registryWithSmash());
    const assignments = resolved.segments[0].assignments;
    expect(assignments).toHaveLength(1);
    // charSmash の既定優先度は0、条件補正は20、上書きは0 → 20。
    expect(assignments[0].finalPriority).toBe(20);
    expect(assignments[0].songSpecific).toBe(false);
  });

  it("adoptDefault に最終優先度上書きを与えると加算される", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(20)]);
    const chart: TypographyChart = {
      effectOverrides: [{ phraseIndex: 1, decision: "adoptDefault", effectId: EFFECT_ID.smash, finalPriority: 10 }],
      readingPlacements: [],
    };
    const resolved = resolveTypographyChart(plan, registryWithSmash(), chart);
    expect(resolved.segments[0].assignments[0].finalPriority).toBe(30);
  });
});

describe("resolveTypographyChart 既定無効化", () => {
  it("disableDefault は指定演出を該当フレーズのセグメントから取り除く", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(20)]);
    const chart: TypographyChart = {
      effectOverrides: [{ phraseIndex: 1, decision: "disableDefault", effectId: EFFECT_ID.smash }],
      readingPlacements: [],
    };
    const resolved = resolveTypographyChart(plan, registryWithSmash(), chart);
    expect(resolved.segments[0].assignments).toHaveLength(0);
  });

  it("別フレーズの無効化は対象セグメントに影響しない", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(20)]);
    const chart: TypographyChart = {
      effectOverrides: [{ phraseIndex: 2, decision: "disableDefault", effectId: EFFECT_ID.smash }],
      readingPlacements: [],
    };
    const resolved = resolveTypographyChart(plan, registryWithSmash(), chart);
    expect(resolved.segments[0].assignments).toHaveLength(1);
  });
});

describe("resolveTypographyChart 曲固有追加", () => {
  it("addSongSpecific は既定に無い演出を加える（未登録なら実装待ち状態）", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(0)]);
    const chart: TypographyChart = {
      effectOverrides: [
        { phraseIndex: 1, decision: "addSongSpecific", effectId: EFFECT_ID.depthFlight, finalPriority: 5 },
      ],
      readingPlacements: [],
    };
    const resolved = resolveTypographyChart(plan, registryWithSmash(), chart);
    const added = resolved.segments[0].assignments.find((a) => a.effectId === EFFECT_ID.depthFlight);
    expect(added).toBeDefined();
    expect(added?.songSpecific).toBe(true);
    expect(added?.status).toBe("pendingImplementation");
    expect(added?.finalPriority).toBe(5);
  });

  it("既に存在する演出を addSongSpecific しても二重に加えない", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(0)]);
    const chart: TypographyChart = {
      effectOverrides: [{ phraseIndex: 1, decision: "addSongSpecific", effectId: EFFECT_ID.smash }],
      readingPlacements: [],
    };
    const resolved = resolveTypographyChart(plan, registryWithSmash(), chart);
    const smashes = resolved.segments[0].assignments.filter((a) => a.effectId === EFFECT_ID.smash);
    expect(smashes).toHaveLength(1);
  });

  it("未知の演出識別名の追加は無視する（文法を決められないため）", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(0)]);
    const chart: TypographyChart = {
      effectOverrides: [{ phraseIndex: 1, decision: "addSongSpecific", effectId: "effect.unknown" }],
      readingPlacements: [],
    };
    const resolved = resolveTypographyChart(plan, registryWithSmash(), chart);
    expect(resolved.segments[0].assignments).toHaveLength(1);
  });
});

describe("findUnknownChartEffectIds 未知の演出識別名の検出", () => {
  it("既知の演出識別名だけなら空を返す", () => {
    const chart: TypographyChart = {
      effectOverrides: [
        { phraseIndex: 0, decision: "adoptDefault" },
        { phraseIndex: 1, decision: "addSongSpecific", effectId: EFFECT_ID.smash },
      ],
      readingPlacements: [],
    };
    expect(findUnknownChartEffectIds(chart)).toEqual([]);
  });

  it("未知の演出識別名を重複なく返す", () => {
    const chart: TypographyChart = {
      effectOverrides: [
        { phraseIndex: 0, decision: "addSongSpecific", effectId: "effect.unknown" },
        { phraseIndex: 1, decision: "disableDefault", effectId: "effect.unknown" },
      ],
      readingPlacements: [],
    };
    expect(findUnknownChartEffectIds(chart)).toEqual(["effect.unknown"]);
  });

  it("譜面が空・未指定なら空を返す", () => {
    expect(findUnknownChartEffectIds(undefined)).toEqual([]);
    expect(findUnknownChartEffectIds({ effectOverrides: [], readingPlacements: [] })).toEqual([]);
  });
});

describe("resolveTypographyChart 並べ替え", () => {
  it("最終優先度の降順に整列する", () => {
    const plan = singleSegmentPlan(1, [smashAssignment(0)]);
    const chart: TypographyChart = {
      effectOverrides: [
        { phraseIndex: 1, decision: "adoptDefault", effectId: EFFECT_ID.smash, finalPriority: 1 },
        { phraseIndex: 1, decision: "addSongSpecific", effectId: EFFECT_ID.depthFlight, finalPriority: 50 },
      ],
      readingPlacements: [],
    };
    const resolved = resolveTypographyChart(plan, registryWithSmash(), chart);
    const priorities = resolved.segments[0].assignments.map((a) => a.finalPriority);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i] <= priorities[i - 1]).toBe(true);
    }
    expect(resolved.segments[0].assignments[0].effectId).toBe(EFFECT_ID.depthFlight);
  });
});
