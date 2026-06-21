import { describe, it, expect } from "vitest";
import { accountBudget, planDegrade } from "./effectBudget";
import type { BudgetUnit, BudgetCaps, EffectMeasure } from "./effectBudget";
import type { EffectCost } from "./effectElement";

function cost(overrides: Partial<EffectCost> = {}): EffectCost {
  return {
    extraGlyphs: 0,
    gsapTargetsPerFrame: 1,
    troikaSyncs: 0,
    glowTargets: 0,
    duplication: false,
    ...overrides,
  };
}

function effect(id: string, overrides: Partial<EffectMeasure> = {}): EffectMeasure {
  return {
    id,
    declared: cost(),
    measured: cost(),
    hasJitter: false,
    ...overrides,
  };
}

function unit(overrides: Partial<BudgetUnit> = {}): BudgetUnit {
  return {
    unitId: "u",
    glyphCount: 1,
    copyCount: 0,
    duplicationMinCount: 0,
    glowing: false,
    troikaResync: false,
    backingCount: 0,
    effects: [],
    ...overrides,
  };
}

const LOOSE_CAPS: BudgetCaps = {
  concurrentGlyphs: 10000,
  duplicateCopies: 10000,
  glowGlyphs: 10000,
  updateTargets: 10000,
};

describe("accountBudget 5指標の合算", () => {
  it("同時表示文字数・同時複製数・取っ手更新対象数・発光対象数・troika同期回数を合算する", () => {
    const u = unit({
      glyphCount: 2,
      copyCount: 3,
      duplicationMinCount: 2,
      glowing: true,
      troikaResync: true,
      backingCount: 2,
      effects: [effect("e1", { measured: cost({ gsapTargetsPerFrame: 4 }) })],
    });
    const report = accountBudget([u], LOOSE_CAPS);
    // 同時表示文字数 = 2*(1+3) + 背面2 = 10
    expect(report.totals.concurrentGlyphs).toBe(10);
    // 同時複製数 = 3*2 = 6
    expect(report.totals.duplicateCopies).toBe(6);
    // 発光対象数 = 2*(1+3) = 8
    expect(report.totals.glowTargets).toBe(8);
    // troika同期回数 = 文字数2（再配置確定あり）
    expect(report.totals.troikaSyncs).toBe(2);
    // 取っ手更新対象数 = 実測 gsap 4
    expect(report.totals.updateTargets).toBe(4);
  });

  it("発光していない単位は発光対象数に数えない", () => {
    const report = accountBudget([unit({ glyphCount: 3, glowing: false, effects: [effect("e")] })], LOOSE_CAPS);
    expect(report.totals.glowTargets).toBe(0);
  });
});

describe("accountBudget 宣言と実測の差（両方向）", () => {
  it("宣言が実測を上回る差と下回る差の両方を記録する", () => {
    const u = unit({
      effects: [
        effect("over", { declared: cost({ extraGlyphs: 10 }), measured: cost({ extraGlyphs: 4 }) }),
        effect("under", { declared: cost({ glowTargets: 1 }), measured: cost({ glowTargets: 3 }) }),
      ],
    });
    const report = accountBudget([u], LOOSE_CAPS);
    const over = report.differences.find((d) => d.effectId === "over" && d.field === "extraGlyphs");
    const under = report.differences.find((d) => d.effectId === "under" && d.field === "glowTargets");
    expect(over).toEqual({ unitId: "u", effectId: "over", field: "extraGlyphs", declared: 10, measured: 4 });
    expect(under).toEqual({ unitId: "u", effectId: "under", field: "glowTargets", declared: 1, measured: 3 });
  });
});

describe("planDegrade 縮退順序", () => {
  it("同時複製数の超過は写し数を minCount まで減らす", () => {
    const u = unit({
      glyphCount: 1,
      copyCount: 5,
      duplicationMinCount: 2,
      effects: [effect("dup", { declared: cost({ extraGlyphs: 1 }), measured: cost({ extraGlyphs: 5 }), hasJitter: false })],
    });
    const caps: BudgetCaps = { ...LOOSE_CAPS, duplicateCopies: 2 };
    const directives = planDegrade([u], caps);
    expect(directives).toHaveLength(1);
    expect(directives[0].directive.maxCopies).toBe(2);
  });

  it("発光対象数の超過は発光を落とす", () => {
    const u = unit({
      glyphCount: 4,
      glowing: true,
      effects: [effect("g", { declared: cost({ glowTargets: 1 }), measured: cost({ glowTargets: 4 }) })],
    });
    const caps: BudgetCaps = { ...LOOSE_CAPS, glowGlyphs: 2 };
    const directives = planDegrade([u], caps);
    expect(directives[0].directive.dropGlow).toBe(true);
  });

  it("取っ手更新対象数の超過は実測が宣言を上回る揺らぎ持ちの演出を落とす", () => {
    const u = unit({
      glyphCount: 1,
      effects: [
        effect("jit", {
          declared: cost({ gsapTargetsPerFrame: 1 }),
          measured: cost({ gsapTargetsPerFrame: 5 }),
          hasJitter: true,
        }),
      ],
    });
    const caps: BudgetCaps = { ...LOOSE_CAPS, updateTargets: 4 };
    const directives = planDegrade([u], caps);
    expect(directives[0].directive.dropJitterEffectIds?.has("jit")).toBe(true);
  });

  it("上限内なら縮退指示を作らない", () => {
    const u = unit({ glyphCount: 2, copyCount: 1, duplicationMinCount: 1, effects: [effect("e")] });
    const directives = planDegrade([u], LOOSE_CAPS);
    expect(directives).toEqual([]);
  });

  it("複製・発光・取っ手更新が同時に超過すると3段すべての縮退指示を1単位へ出す", () => {
    const u = unit({
      glyphCount: 2,
      copyCount: 10,
      duplicationMinCount: 1,
      glowing: true,
      effects: [
        effect("dup", {
          declared: cost({ extraGlyphs: 2 }),
          measured: cost({ extraGlyphs: 20, gsapTargetsPerFrame: 0 }),
        }),
        effect("glow", {
          declared: cost({ glowTargets: 1, gsapTargetsPerFrame: 0 }),
          measured: cost({ glowTargets: 4, gsapTargetsPerFrame: 0 }),
        }),
        effect("jit", {
          declared: cost({ gsapTargetsPerFrame: 1 }),
          measured: cost({ gsapTargetsPerFrame: 3 }),
          hasJitter: true,
        }),
      ],
    });
    // 同時複製数=20、発光対象数=2×(1+10)=22、取っ手更新対象数=3 が、いずれも上限2を超える。
    const caps: BudgetCaps = { concurrentGlyphs: 10000, duplicateCopies: 2, glowGlyphs: 2, updateTargets: 2 };
    const directives = planDegrade([u], caps);
    expect(directives).toHaveLength(1);
    const directive = directives[0].directive;
    // 第1段: 写し数を minCount=1 まで減らす（同時複製数 2×1=2 へ）。
    expect(directive.maxCopies).toBe(1);
    // 第2段: なお発光対象数（2×2=4）が超過するため発光を落とす。
    expect(directive.dropGlow).toBe(true);
    // 第3段: なお取っ手更新対象数（3）が超過するため、実測が宣言を上回る揺らぎ持ちの演出を落とす。
    expect(directive.dropJitterEffectIds?.has("jit")).toBe(true);
  });
});

describe("純粋性（caps を引数で受け取り、入力を変えず同じ入力で同じ出力）", () => {
  it("accountBudget は入力単位を変更しない", () => {
    const u = unit({ glyphCount: 2, copyCount: 2, glowing: true, effects: [effect("e")] });
    const snapshot = JSON.stringify(u);
    accountBudget([u], LOOSE_CAPS);
    expect(JSON.stringify(u)).toBe(snapshot);
  });

  it("同じ入力で同じ報告を返す", () => {
    const build = (): BudgetUnit =>
      unit({ glyphCount: 2, copyCount: 3, duplicationMinCount: 1, glowing: true, effects: [effect("e", { measured: cost({ gsapTargetsPerFrame: 2 }) })] });
    const first = accountBudget([build()], LOOSE_CAPS);
    const second = accountBudget([build()], LOOSE_CAPS);
    expect(first).toEqual(second);
  });
});
