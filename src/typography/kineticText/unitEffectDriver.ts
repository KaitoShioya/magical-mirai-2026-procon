// 単位別の演出駆動と費用ループ（Issue #33/#59 の本編結線が使う機構）。
//
// 役割: 1フレームに駆動すべき単位の一覧（各単位の評価コンテキスト・当てる active 演出・合成入力・取っ手生成）を受け取り、
// 各単位を演出要素 EffectElement.evaluate → 合成器 composeGlyphState → 費用ループ（仮合成→accountBudget→
// planDegrade→再合成）→ 適用層 applyComposed の経路で描く。合成対象 createCompositionTarget の生成・解放を
// 単位の同一性（unitId）で調停し、現れた単位は生成・去った単位は解放する。
//
// 責務の境界（意図的に持たないもの）: どの演出をどの単位へ当てるか（割付・役分離）、各単位の世界座標配置
// （カメラ連動 #59）、読ませる役と演出役の二重描画の回避方針は、本機構の呼び出し側（指揮者・本編結線）が決める。
// 本機構は「与えられた単位群を費用予算内で合成・適用する駆動」だけを担い、純粋ロジックとして単体検証できる。
//
// 費用ループの手順を固定する理由を先に述べる。planDegrade は演出ごとの宣言費用と実測費用、複製の写し数・発光・
// 揺らぎから縮退指示を作る（effectBudget.ts）。これを呼ぶには、各単位を一度仮合成して合成結果から費用単位
// BudgetUnit を作り、全単位を accountBudget で合算し、上限超過のとき planDegrade の指示で再合成する手順が要る。
//
// 依存規則（docs/decisions/architecture.md §5）: profiles・tools を import しない。three.js を持ち込まない。

import type { EffectElement, EffectContext, OperatedAttributes, EffectCost } from "./effectElement";
import type { ComposeInput, ContributionEntry, DegradeDirective } from "./effectCompositor";
import { composeGlyphState } from "./effectCompositor";
import type { ComposedGlyphState } from "./composedGlyphState";
import type { GlyphHandle } from "./types";
import { createCompositionTarget, type CompositionTarget } from "./effectCompositionApplier";
import {
  accountBudget,
  planDegrade,
  type BudgetUnit,
  type BudgetCaps,
  type EffectMeasure,
} from "./effectBudget";

/** この単位へ当てる active な1演出。priority は確定割付の最終優先度（合成器が相対順序に使う）。 */
export interface DriveEffect {
  readonly element: EffectElement;
  readonly priority: number;
}

/**
 * 1フレームに駆動する1単位の指定。呼び出し側が単位の同一性・評価コンテキスト・当てる演出・合成入力・取っ手生成を与える。
 * 合成入力のうち寄与（contributions）は本機構が evaluate から組むため除く。基準位置（composeBase.basePosition と
 * context.basePosition）は呼び出し側が各単位の世界座標で同値充填する。
 */
export interface DriveUnit {
  /** 単位の同一性。現れたら合成対象を生成し、去ったら解放する鍵。 */
  readonly unitId: string;
  /** 各演出へ渡す評価コンテキスト（基準位置を充填済み）。 */
  readonly context: EffectContext;
  /** この単位に当てる active 演出。 */
  readonly effects: readonly DriveEffect[];
  /** 合成入力のうち寄与以外（単位種別・基底色・基準位置・ブルーム閾値・可読性・読ませる役透明度下限）。 */
  readonly composeBase: Omit<ComposeInput, "contributions">;
  /** 合成対象の主取っ手を作る（単位が現れたとき1回だけ呼ぶ）。 */
  spawnPrimary(): GlyphHandle;
  /** 合成対象の複製の写しの取っ手を作る（プール枯渇で確保できないとき null）。 */
  spawnCopy(): GlyphHandle | null;
}

/** 1フレームの駆動の診断。費用が縮退後も上限を超えたか、その指標を記録する。 */
export interface UnitDriveDiagnostics {
  /** いずれかの指標が縮退後も上限を超えたか。 */
  readonly overBudgetAfterDegrade: boolean;
  /** 縮退後に超過したままの指標の名（同時表示文字数は縮退で下げられないため起こりうる）。 */
  readonly residualOverCaps: readonly string[];
  /** 当該フレームに生かしている合成対象の数。 */
  readonly liveUnitCount: number;
}

export interface UnitEffectDriver {
  /** 1フレーム分の単位群を駆動する。合成対象の生成・解放を調停し、費用ループで適用する。 */
  drive(units: readonly DriveUnit[]): UnitDriveDiagnostics;
  /** 全合成対象を解放する。冪等。 */
  dispose(): void;
}

export interface UnitEffectDriverDeps {
  /** 5指標の費用上限。 */
  readonly caps: BudgetCaps;
}

/** 演出が揺らぎ層を出すか（取っ手更新対象数の縮退で揺らぎを落とす対象選択に使う）。 */
function hasJitterLayer(operates: OperatedAttributes): boolean {
  return (
    operates.position === "jitter" ||
    operates.rotation === "jitter" ||
    operates.scale === "jitter" ||
    operates.letterSpacing === "jitter"
  );
}

/** 1単位の active 演出を評価し、寄与を集める（寄与の無い演出は除く）。 */
function gatherContributions(unit: DriveUnit): ContributionEntry[] {
  const entries: ContributionEntry[] = [];
  for (const effect of unit.effects) {
    const contribution = effect.element.evaluate(unit.context);
    if (contribution === null) {
      continue;
    }
    entries.push({
      id: effect.element.id,
      contribution,
      priority: effect.priority,
      operates: effect.element.operates,
    });
  }
  return entries;
}

/**
 * 合成結果と当てた演出から、当該フレームの費用単位を作る。
 * 演出ごとの実測費用の割当規則を先に述べる。合成器は単位全体の合成結果（写し計画・発光）を返し、演出ごとの内訳は
 * 返さない。よって各演出の実測費用は、その演出の estimateCost（保守的上限）を宣言・実測の双方に置く。複製の写し数・
 * 発光・字間再同期・下地数は合成結果から単位レベルで数える。これにより planDegrade の縮退（複製を最小数へ・発光を落とす・
 * 過大宣言の揺らぎを落とす）は合成結果の量で正しく働き、宣言と実測が一致するため縮退の優先順は登場順に従う。
 */
function buildBudgetUnit(
  unit: DriveUnit,
  composed: ComposedGlyphState
): BudgetUnit {
  const glyphCount = unit.context.unitGlyphCount;
  const copyCount = composed.duplication ? composed.duplication.copies.length : 0;
  const duplicationMinCount = composed.duplication ? composed.duplication.minCount : 0;
  const effects: EffectMeasure[] = unit.effects.map((effect) => {
    const cost: EffectCost = effect.element.estimateCost({ unitGlyphCount: glyphCount });
    return {
      id: effect.element.id,
      declared: cost,
      measured: cost,
      hasJitter: hasJitterLayer(effect.element.operates),
    };
  });
  return {
    unitId: unit.unitId,
    glyphCount,
    copyCount,
    duplicationMinCount,
    glowing: composed.glowing,
    // 字間または可読性下地が当該フレームで変わると troika の再配置確定を要する。字間の有無で代表する
    // （可読性下地は backingCount で別に数える）。
    troikaResync: composed.letterSpacing !== null,
    backingCount: composed.readability ? glyphCount : 0,
    effects,
  };
}

/** 縮退後の合算で、なお上限を超えている指標の名を集める。 */
function residualOverCapNames(
  units: readonly BudgetUnit[],
  caps: BudgetCaps
): string[] {
  const report = accountBudget(units, caps);
  const names: string[] = [];
  if (report.overCap.concurrentGlyphs) names.push("concurrentGlyphs");
  if (report.overCap.duplicateCopies) names.push("duplicateCopies");
  if (report.overCap.glowGlyphs) names.push("glowGlyphs");
  if (report.overCap.updateTargets) names.push("updateTargets");
  return names;
}

export function createUnitEffectDriver(deps: UnitEffectDriverDeps): UnitEffectDriver {
  const { caps } = deps;
  // 単位の同一性で合成対象を保持する。
  const targets = new Map<string, CompositionTarget>();

  function reconcileTargets(desiredIds: ReadonlySet<string>, units: readonly DriveUnit[]): void {
    // 去った単位を解放する。
    for (const [unitId, target] of targets) {
      if (!desiredIds.has(unitId)) {
        target.release();
        targets.delete(unitId);
      }
    }
    // 現れた単位の合成対象を生成する。
    for (const unit of units) {
      if (!targets.has(unit.unitId)) {
        targets.set(
          unit.unitId,
          createCompositionTarget({
            spawnPrimary: () => unit.spawnPrimary(),
            spawnCopy: () => unit.spawnCopy(),
          })
        );
      }
    }
  }

  function drive(units: readonly DriveUnit[]): UnitDriveDiagnostics {
    const desiredIds = new Set(units.map((unit) => unit.unitId));
    reconcileTargets(desiredIds, units);

    // 第1巡: 各単位を仮合成し、費用単位を作る（寄与は再合成のため保持する）。
    interface Pending {
      readonly unit: DriveUnit;
      readonly contributions: readonly ContributionEntry[];
      readonly provisional: ComposedGlyphState;
      readonly budgetUnit: BudgetUnit;
    }
    const pending: Pending[] = units.map((unit) => {
      const contributions = gatherContributions(unit);
      const provisional = composeGlyphState({ ...unit.composeBase, contributions });
      return { unit, contributions, provisional, budgetUnit: buildBudgetUnit(unit, provisional) };
    });

    // 費用合算。上限超過があれば縮退指示を作り、該当単位を再合成する。
    const budgetUnits = pending.map((p) => p.budgetUnit);
    const report = accountBudget(budgetUnits, caps);
    const overCap =
      report.overCap.concurrentGlyphs ||
      report.overCap.duplicateCopies ||
      report.overCap.glowGlyphs ||
      report.overCap.updateTargets;

    let directiveById: Map<string, DegradeDirective> | null = null;
    if (overCap) {
      directiveById = new Map(planDegrade(budgetUnits, caps).map((d) => [d.unitId, d.directive]));
    }

    // 第2巡: 縮退指示のある単位は再合成し、全単位を適用する。再合成後の費用単位で残留超過を測る。
    const finalBudgetUnits: BudgetUnit[] = [];
    for (const p of pending) {
      const directive = directiveById?.get(p.unit.unitId);
      const finalState = directive
        ? composeGlyphState({ ...p.unit.composeBase, contributions: p.contributions }, directive)
        : p.provisional;
      const target = targets.get(p.unit.unitId);
      target?.applyComposed(finalState);
      finalBudgetUnits.push(directive ? buildBudgetUnit(p.unit, finalState) : p.budgetUnit);
    }

    // 残留超過の判定。planDegrade は同時表示文字数を直接下げず、複製は最小写し数より下へ縮退できないため、
    // 1回の再合成で必ず上限内に収まるとは限らない。残留した指標を診断へ記録する（落とす方針は呼び出し側の領域）。
    const residual = directiveById ? residualOverCapNames(finalBudgetUnits, caps) : [];

    return {
      overBudgetAfterDegrade: residual.length > 0,
      residualOverCaps: residual,
      liveUnitCount: targets.size,
    };
  }

  function dispose(): void {
    for (const target of targets.values()) {
      target.release();
    }
    targets.clear();
  }

  return { drive, dispose };
}
