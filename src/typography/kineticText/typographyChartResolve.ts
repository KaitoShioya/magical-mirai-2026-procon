// タイポ・コンポジション譜面の適用と最終優先度の確定（Issue #33）。
//
// 役割: 演出割付規則（Issue #132）が出す曲非依存の割付プランに、曲固有のタイポ譜面（src/types/typography.ts の
// TypographyChart）を適用し、各演出の最終優先度を確定した「確定割付プラン」を返す純粋ロジック。
//   - 既定を採用する（adoptDefault）: 既定の割付をそのまま残す。
//   - 既定を無効化する（disableDefault）: 指定した演出識別名の割付をそのフレーズの該当セグメントから取り除く。
//   - 曲固有に追加する（addSongSpecific）: 指定した演出識別名の割付をそのフレーズの該当セグメントへ加える。
//
// 最終優先度の式（採用理由を先に述べる）: 最終優先度 = 演出の既定優先度 + 演出割付規則の条件補正 + 譜面の上書き値。
// 加算にする理由は、既定優先度（演出間の素の強弱）・条件補正（曲非依存の場面補正）・譜面上書き（曲固有の最終調整）の
// 3層を互いに独立に決められ、上書きが無い演出は既定どおりに振る舞う（上書き値0が恒等元）性質を保つためである。
// 合成エンジン（#131）は優先度を相対順序にのみ使うため、範囲への切り詰めは行わない。
//
// 依存規則: profiles・tools を import しない。曲固有データの型は共有の型置き場 src/types から取り込む。

import type {
  AssignmentPlan,
  SegmentAssignment,
  EffectAssignment,
  EffectGrammar,
} from "./effectAssignment";
import { EFFECT_ID } from "./effectAssignment";
import type { EffectRegistry, EffectElement, EffectTargetUnit } from "./effectElement";
import type {
  TypographyChart,
  TypographyEffectOverride,
  TypographyCharRange,
} from "../../types/typography";

/** 確定した1演出の割付。EffectAssignment に最終優先度と曲固有の付帯情報を加える。 */
export interface ResolvedEffectAssignment extends EffectAssignment {
  /** 最終優先度（既定優先度 + 条件補正 + 譜面上書き）。合成エンジンへ渡す相対順序の値。 */
  readonly finalPriority: number;
  /** 譜面が開始条件の拍間隔を上書きしたときその値。上書きが無ければ null。 */
  readonly beatCadenceOverrideBeats: number | null;
  /** 譜面が適用範囲を絞ったときその文字範囲。範囲指定が無ければ null（フレーズ全体）。 */
  readonly range: TypographyCharRange | null;
  /** 曲固有追加（addSongSpecific）で加えられた割付なら真。 */
  readonly songSpecific: boolean;
}

/** 確定した1セグメントの割付。時刻・粒度などは元のまま、割付だけを確定済みに置き換える。 */
export interface ResolvedSegment {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly granularity: SegmentAssignment["granularity"];
  readonly reason: SegmentAssignment["reason"];
  readonly phraseIndex: number | null;
  readonly unitRefs: SegmentAssignment["unitRefs"];
  readonly phraseChunk: SegmentAssignment["phraseChunk"];
  readonly charCadenceBeats: number | null;
  /** 最終優先度の降順。同値は安定順（既定割付の元順、追加は末尾）で並べる。 */
  readonly assignments: readonly ResolvedEffectAssignment[];
}

/** 確定割付プラン。 */
export interface ResolvedAssignmentPlan {
  readonly segments: readonly ResolvedSegment[];
}

/**
 * 最終優先度を求める純粋関数。3層を加算する。上書きが無いとき finalPriorityOverride は 0 を渡す。
 * 範囲への切り詰めは行わない（合成エンジンは相対順序のみに優先度を使うため）。
 */
export function computeFinalPriority(
  defaultPriority: number,
  priorityAdjustment: number,
  finalPriorityOverride: number
): number {
  return defaultPriority + priorityAdjustment + finalPriorityOverride;
}

/** 演出識別名から文法への逆引き表（EFFECT_ID の逆写像）。未知の識別名は持たない。 */
const ID_TO_GRAMMAR: ReadonlyMap<string, EffectGrammar> = new Map(
  (Object.entries(EFFECT_ID) as [EffectGrammar, string][]).map(([grammar, id]) => [id, grammar])
);

/**
 * タイポ譜面の演出割付上書きのうち、既知の演出識別名（EFFECT_ID の値）でないものを重複なく返す。
 * 未知の識別名の上書きは適用時に黙って無視されるため、譜面の記述ミスを早期に気づけるよう検出に使う。
 * 既知だが実行時に未登録の演出は別概念（適用時に実装待ち状態になる）であり、ここでは扱わない。
 */
export function findUnknownChartEffectIds(chart?: TypographyChart): string[] {
  const unknown = new Set<string>();
  for (const override of chart?.effectOverrides ?? []) {
    if (override.effectId !== undefined && !ID_TO_GRAMMAR.has(override.effectId)) {
      unknown.add(override.effectId);
    }
  }
  return [...unknown];
}

/** レジストリの一覧から識別名→演出実体の対応表を作る（get は未知で例外を投げるため存在確認に使わない）。 */
function buildRegistryLookup(registry: EffectRegistry): Map<string, EffectElement> {
  const lookup = new Map<string, EffectElement>();
  for (const element of registry.list()) {
    lookup.set(element.id, element);
  }
  return lookup;
}

/** 演出の既定優先度を返す。登録が無ければ 0 とする（未実装演出は素の強弱を持たない）。 */
function defaultPriorityOf(effectId: string, lookup: Map<string, EffectElement>): number {
  const element = lookup.get(effectId);
  return element ? element.defaultPriority : 0;
}

/** あるフレーズ・演出識別名に一致する上書きのうち、指定の種類のものを返す（無ければ undefined）。 */
function findOverride(
  overrides: readonly TypographyEffectOverride[],
  phraseIndex: number | null,
  effectId: string,
  decision: TypographyEffectOverride["decision"]
): TypographyEffectOverride | undefined {
  if (phraseIndex === null) {
    return undefined;
  }
  return overrides.find(
    (o) => o.phraseIndex === phraseIndex && o.decision === decision && o.effectId === effectId
  );
}

/** 1つの既定割付を確定割付へ変換する（最終優先度と付帯情報を付ける）。 */
function toResolved(
  assignment: EffectAssignment,
  segmentPhraseIndex: number | null,
  overrides: readonly TypographyEffectOverride[],
  lookup: Map<string, EffectElement>,
  songSpecific: boolean
): ResolvedEffectAssignment {
  // 採用（adoptDefault）と追加（addSongSpecific）の上書きから、この演出識別名に一致するものを探す。
  const adopt = findOverride(overrides, segmentPhraseIndex, assignment.effectId, "adoptDefault");
  const add = findOverride(overrides, segmentPhraseIndex, assignment.effectId, "addSongSpecific");
  const matched = add ?? adopt;
  const finalPriorityOverride = matched?.finalPriority ?? 0;
  const beatCadenceOverrideBeats =
    matched?.startCondition?.beatCadence === undefined ? null : matched.startCondition.beatCadence;
  const range = matched?.range ?? null;
  return {
    ...assignment,
    finalPriority: computeFinalPriority(
      defaultPriorityOf(assignment.effectId, lookup),
      assignment.priorityAdjustment,
      finalPriorityOverride
    ),
    beatCadenceOverrideBeats,
    range,
    songSpecific,
  };
}

/** addSongSpecific の上書きから、既定割付に無い演出を新規の割付として作る。未知の識別名と未登録の演出は加えない。 */
function buildAddedAssignments(
  segment: SegmentAssignment,
  overrides: readonly TypographyEffectOverride[],
  existingIds: ReadonlySet<string>,
  lookup: Map<string, EffectElement>
): ResolvedEffectAssignment[] {
  if (segment.phraseIndex === null) {
    return [];
  }
  const added: ResolvedEffectAssignment[] = [];
  for (const override of overrides) {
    if (override.decision !== "addSongSpecific" || override.phraseIndex !== segment.phraseIndex) {
      continue;
    }
    const effectId = override.effectId;
    if (effectId === undefined || existingIds.has(effectId)) {
      continue;
    }
    const grammar = ID_TO_GRAMMAR.get(effectId);
    const element = lookup.get(effectId);
    // 未知の演出識別名（EFFECT_ID に無い）は文法を決められないため加えない。登録の有無はスモークで検出する。
    if (grammar === undefined) {
      continue;
    }
    const declaredTargetUnit: EffectTargetUnit = element ? element.targetUnit : segment.granularity;
    const beatCadence = element?.startCondition.beatCadence;
    added.push({
      effectId,
      grammar,
      declaredTargetUnit,
      applyGranularity: segment.granularity,
      priorityAdjustment: 0,
      segmentCharCadenceBeats: segment.charCadenceBeats,
      effectBeatCadenceBeats: beatCadence === undefined || beatCadence === null ? null : beatCadence,
      status: element ? "active" : "pendingImplementation",
      finalPriority: computeFinalPriority(
        defaultPriorityOf(effectId, lookup),
        0,
        override.finalPriority ?? 0
      ),
      beatCadenceOverrideBeats:
        override.startCondition?.beatCadence === undefined ? null : override.startCondition.beatCadence,
      range: override.range ?? null,
      songSpecific: true,
    });
  }
  return added;
}

/** 1セグメントへ曲固有上書きを適用して確定セグメントを作る。 */
function resolveSegment(
  segment: SegmentAssignment,
  overrides: readonly TypographyEffectOverride[],
  lookup: Map<string, EffectElement>
): ResolvedSegment {
  // 無効化（disableDefault）対象の演出識別名の集合（このフレーズの分のみ）。
  const disabledIds = new Set<string>();
  if (segment.phraseIndex !== null) {
    for (const override of overrides) {
      if (
        override.decision === "disableDefault" &&
        override.phraseIndex === segment.phraseIndex &&
        override.effectId !== undefined
      ) {
        disabledIds.add(override.effectId);
      }
    }
  }

  // 既定割付から無効化対象を除き、残りを確定割付へ変換する。
  const kept = segment.assignments
    .filter((assignment) => !disabledIds.has(assignment.effectId))
    .map((assignment) => toResolved(assignment, segment.phraseIndex, overrides, lookup, false));

  const existingIds = new Set(kept.map((a) => a.effectId));
  const added = buildAddedAssignments(segment, overrides, existingIds, lookup);

  // 最終優先度の降順で安定ソートする。連結順（既定が先、追加が後）を同値の初期順序として保つ。
  const assignments = [...kept, ...added].sort((a, b) => b.finalPriority - a.finalPriority);

  return {
    startTimeMs: segment.startTimeMs,
    endTimeMs: segment.endTimeMs,
    granularity: segment.granularity,
    reason: segment.reason,
    phraseIndex: segment.phraseIndex,
    unitRefs: segment.unitRefs,
    phraseChunk: segment.phraseChunk,
    charCadenceBeats: segment.charCadenceBeats,
    assignments,
  };
}

/**
 * 割付プラン（#132）にタイポ譜面を適用し、最終優先度を確定した確定割付プランを返す。
 * 既存の割付プランは変更しない（新しいプランを返す）。chart を省略・空にすると既定どおりの確定になる。
 */
export function resolveTypographyChart(
  plan: AssignmentPlan,
  registry: EffectRegistry,
  chart?: TypographyChart
): ResolvedAssignmentPlan {
  const overrides = chart?.effectOverrides ?? [];
  const lookup = buildRegistryLookup(registry);
  const segments = plan.segments.map((segment) => resolveSegment(segment, overrides, lookup));
  return { segments };
}

/** 確定割付プランから、再生位置を含むセグメントを二分探索で返す（assignmentAt と同じ半開区間規約）。 */
export function resolvedSegmentAt(
  plan: ResolvedAssignmentPlan,
  positionMs: number
): ResolvedSegment | null {
  const segments = plan.segments;
  if (segments.length === 0) {
    return null;
  }
  if (positionMs < segments[0].startTimeMs || positionMs >= segments[segments.length - 1].endTimeMs) {
    return null;
  }
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = segments[mid];
    if (positionMs < segment.startTimeMs) {
      high = mid - 1;
    } else if (positionMs >= segment.endTimeMs) {
      low = mid + 1;
    } else {
      return segment;
    }
  }
  return null;
}

/** 確定割付プランの、現時点で実演奏できる（active な）割付だけを返す。 */
export function activeResolvedAssignmentsAt(
  plan: ResolvedAssignmentPlan,
  positionMs: number
): readonly ResolvedEffectAssignment[] {
  const segment = resolvedSegmentAt(plan, positionMs);
  if (segment === null) {
    return [];
  }
  return segment.assignments.filter((assignment) => assignment.status === "active");
}
