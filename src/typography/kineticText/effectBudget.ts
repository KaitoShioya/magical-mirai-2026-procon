// 演出合成エンジン（Issue #131）の純粋な費用合算と縮退指示の生成。
// 5指標（同時表示文字数・同時複製数・取っ手更新対象数・troika同期回数・発光対象数）を全単位で合算し、
// 上限を超えた指標について同時複製数→発光対象数→取っ手更新対象数の順に縮退指示を作る。
// フレームをまたいだ状態を持たず、上限は引数 caps で受け取る（依存規則 docs/decisions/architecture.md §5）。
// 同時表示文字数の上限は実行時関数 computeMaxConcurrent が決めるため、本モジュールは呼ばず caps へ渡された値を使う。

import type { EffectCost } from "./effectElement";
import type { DegradeDirective } from "./effectCompositor";

/** 1演出の宣言費用（estimateCost）と当該フレームの実測費用、揺らぎ層を持つかの旗。 */
export interface EffectMeasure {
  readonly id: string;
  readonly declared: EffectCost;
  readonly measured: EffectCost;
  /** 揺らぎ層の寄与を持つか。取っ手更新対象数の縮退で揺らぎを落とす対象選択に使う。 */
  readonly hasJitter: boolean;
}

/** 費用合算が扱う1単位。実測は当該フレームの合成結果から数えた決定的な量。 */
export interface BudgetUnit {
  readonly unitId: string;
  /** 単位の文字数。 */
  readonly glyphCount: number;
  /** 複製の写し数（単位レベルの写しの数）。 */
  readonly copyCount: number;
  /** 複製があるときの写しの下限（minCount）。複製が無ければ0。縮退の下限に使う。 */
  readonly duplicationMinCount: number;
  /** 発光対象か。 */
  readonly glowing: boolean;
  /** 当該フレームで字間または寸法が変わり再配置確定を要したか。 */
  readonly troikaResync: boolean;
  /** 背面複製数（確定可読性指定の下地が無ければ0、有れば単位文字数）。 */
  readonly backingCount: number;
  readonly effects: readonly EffectMeasure[];
}

/** 5指標の上限。駆動側（#33・#59）が LayerLimits と tuning.ts の定数を写す。 */
export interface BudgetCaps {
  /** 同時表示文字数の上限（LayerLimits.single 由来）。 */
  readonly concurrentGlyphs: number;
  /** 同時複製数の上限（EFFECT_MAX_DUPLICATE_COPIES）。 */
  readonly duplicateCopies: number;
  /** 発光対象数の上限（EFFECT_MAX_GLOW_GLYPHS）。 */
  readonly glowGlyphs: number;
  /** 取っ手更新対象数の上限（EFFECT_MAX_UPDATE_TARGETS_PER_FRAME）。 */
  readonly updateTargets: number;
}

export interface BudgetTotals {
  readonly concurrentGlyphs: number;
  readonly duplicateCopies: number;
  readonly glowTargets: number;
  readonly troikaSyncs: number;
  readonly updateTargets: number;
}

/** 宣言費用と実測費用の差（両方向）。診断記録。 */
export interface CostDifference {
  readonly unitId: string;
  readonly effectId: string;
  readonly field: "extraGlyphs" | "gsapTargetsPerFrame" | "troikaSyncs" | "glowTargets";
  readonly declared: number;
  readonly measured: number;
}

export interface BudgetReport {
  readonly totals: BudgetTotals;
  readonly caps: BudgetCaps;
  readonly overCap: {
    readonly concurrentGlyphs: boolean;
    readonly duplicateCopies: boolean;
    readonly glowGlyphs: boolean;
    readonly updateTargets: boolean;
  };
  readonly differences: readonly CostDifference[];
}

/** 1単位の縮退指示。合成器の再合成へ渡す。 */
export interface UnitDirective {
  readonly unitId: string;
  readonly directive: DegradeDirective;
}

// 1単位の取っ手更新対象数の根拠を先に述べる。取っ手の更新は #130 の費用宣言 gsapTargetsPerFrame
// （1フレームに値を更新する対象の数）の実測の和とする。揺らぎ層を1つ落とすごとに、その層の値更新が消えるため
// 1つ減るものとして数える（正確な層別の内訳は持たないため、層1つあたり1の保守的な単位とする）。
function unitUpdateTargets(unit: BudgetUnit, droppedJitter: ReadonlySet<string>): number {
  let total = 0;
  for (const effect of unit.effects) {
    total += effect.measured.gsapTargetsPerFrame;
  }
  let droppedHere = 0;
  for (const effect of unit.effects) {
    if (droppedJitter.has(effect.id) && effect.hasJitter) {
      droppedHere += 1;
    }
  }
  return Math.max(0, total - droppedHere);
}

interface UnitState {
  copyCount: number;
  glowing: boolean;
  readonly droppedJitter: Set<string>;
}

function liveGlyphs(glyphCount: number, copyCount: number): number {
  return glyphCount * (1 + copyCount);
}

function computeTotals(units: readonly BudgetUnit[], states: readonly UnitState[]): BudgetTotals {
  let concurrentGlyphs = 0;
  let duplicateCopies = 0;
  let glowTargets = 0;
  let troikaSyncs = 0;
  let updateTargets = 0;
  units.forEach((unit, index) => {
    const state = states[index];
    const live = liveGlyphs(unit.glyphCount, state.copyCount);
    concurrentGlyphs += live + unit.backingCount;
    duplicateCopies += state.copyCount * unit.glyphCount;
    glowTargets += state.glowing ? live : 0;
    troikaSyncs += unit.troikaResync ? unit.glyphCount : 0;
    updateTargets += unitUpdateTargets(unit, state.droppedJitter);
  });
  return { concurrentGlyphs, duplicateCopies, glowTargets, troikaSyncs, updateTargets };
}

function collectDifferences(units: readonly BudgetUnit[]): CostDifference[] {
  const differences: CostDifference[] = [];
  const fields: CostDifference["field"][] = [
    "extraGlyphs",
    "gsapTargetsPerFrame",
    "troikaSyncs",
    "glowTargets",
  ];
  for (const unit of units) {
    for (const effect of unit.effects) {
      for (const field of fields) {
        const declared = effect.declared[field];
        const measured = effect.measured[field];
        if (declared !== measured) {
          differences.push({ unitId: unit.unitId, effectId: effect.id, field, declared, measured });
        }
      }
    }
  }
  return differences;
}

/** 全単位の実測を5指標で合算し、上限超過の有無と宣言・実測の差を返す。 */
export function accountBudget(units: readonly BudgetUnit[], caps: BudgetCaps): BudgetReport {
  const states: UnitState[] = units.map((unit) => ({
    copyCount: unit.copyCount,
    glowing: unit.glowing,
    droppedJitter: new Set<string>(),
  }));
  const totals = computeTotals(units, states);
  return {
    totals,
    caps,
    overCap: {
      concurrentGlyphs: totals.concurrentGlyphs > caps.concurrentGlyphs,
      duplicateCopies: totals.duplicateCopies > caps.duplicateCopies,
      glowGlyphs: totals.glowTargets > caps.glowGlyphs,
      updateTargets: totals.updateTargets > caps.updateTargets,
    },
    differences: collectDifferences(units),
  };
}

function isDuplicationOverDeclared(unit: BudgetUnit): boolean {
  return unit.effects.some((e) => e.measured.extraGlyphs > e.declared.extraGlyphs);
}

function isGlowOverDeclared(unit: BudgetUnit): boolean {
  return unit.effects.some((e) => e.measured.glowTargets > e.declared.glowTargets);
}

/**
 * 上限を超えた指標について、同時複製数→発光対象数→取っ手更新対象数の順に縮退指示を作る。
 * 各段で実測が宣言を上回った演出（または単位）を優先して制限する。複製は写しの下限 minCount を保つ。
 */
export function planDegrade(units: readonly BudgetUnit[], caps: BudgetCaps): UnitDirective[] {
  const states: UnitState[] = units.map((unit) => ({
    copyCount: unit.copyCount,
    glowing: unit.glowing,
    droppedJitter: new Set<string>(),
  }));

  // 第1段: 同時複製数。写し数を minCount まで1つずつ減らす。実測が宣言を上回る単位を優先する。
  const reducibleOrder = (): number[] => {
    const indices = units.map((_unit, index) => index);
    return indices.sort((a, b) => {
      const aOver = isDuplicationOverDeclared(units[a]) ? 0 : 1;
      const bOver = isDuplicationOverDeclared(units[b]) ? 0 : 1;
      return aOver - bOver;
    });
  };
  let guard = 0;
  const maxIterations = units.reduce((sum, unit) => sum + unit.copyCount, 0) + 1;
  while (computeTotals(units, states).duplicateCopies > caps.duplicateCopies && guard <= maxIterations) {
    guard += 1;
    let reduced = false;
    for (const index of reducibleOrder()) {
      const state = states[index];
      if (state.copyCount > units[index].duplicationMinCount) {
        state.copyCount -= 1;
        reduced = true;
        break;
      }
    }
    if (!reduced) break;
  }

  // 第2段: 発光対象数。発光中の単位の発光を落とす。実測が宣言を上回る単位を優先する。
  const glowOrder = units
    .map((_unit, index) => index)
    .sort((a, b) => {
      const aOver = isGlowOverDeclared(units[a]) ? 0 : 1;
      const bOver = isGlowOverDeclared(units[b]) ? 0 : 1;
      return aOver - bOver;
    });
  for (const index of glowOrder) {
    if (computeTotals(units, states).glowTargets <= caps.glowGlyphs) break;
    if (states[index].glowing) {
      states[index].glowing = false;
    }
  }

  // 第3段: 取っ手更新対象数。実測が宣言を上回る揺らぎ持ちの演出を落とす。
  for (const unit of units) {
    if (computeTotals(units, states).updateTargets <= caps.updateTargets) break;
    const state = states[units.indexOf(unit)];
    for (const effect of unit.effects) {
      if (computeTotals(units, states).updateTargets <= caps.updateTargets) break;
      const overDeclared = effect.measured.gsapTargetsPerFrame > effect.declared.gsapTargetsPerFrame;
      if (effect.hasJitter && overDeclared && !state.droppedJitter.has(effect.id)) {
        state.droppedJitter.add(effect.id);
      }
    }
  }

  // 縮退指示を組み立てる。元の値から変化した単位だけ指示を持つ。
  const directives: UnitDirective[] = [];
  units.forEach((unit, index) => {
    const state = states[index];
    const directive: { maxCopies?: number; dropGlow?: boolean; dropJitterEffectIds?: Set<string> } = {};
    if (state.copyCount < unit.copyCount) {
      directive.maxCopies = state.copyCount;
    }
    if (!state.glowing && unit.glowing) {
      directive.dropGlow = true;
    }
    if (state.droppedJitter.size > 0) {
      directive.dropJitterEffectIds = state.droppedJitter;
    }
    if (directive.maxCopies !== undefined || directive.dropGlow || directive.dropJitterEffectIds) {
      directives.push({ unitId: unit.unitId, directive });
    }
  });
  return directives;
}
