import { describe, it, expect } from "vitest";
import { createUnitEffectDriver, type DriveUnit, type DriveEffect } from "./unitEffectDriver";
import type { EffectElement, EffectContext, AttributeContribution, EffectCost } from "./effectElement";
import type { ComposeInput } from "./effectCompositor";
import type { GlyphHandle } from "./types";
import type { BudgetCaps } from "./effectBudget";

// 大きめの費用上限（縮退を誘発しない既定）。個別テストで小さくして縮退を検証する。
const ROOMY_CAPS: BudgetCaps = {
  concurrentGlyphs: 1000,
  duplicateCopies: 1000,
  glowGlyphs: 1000,
  updateTargets: 1000,
};

/** 取っ手呼び出しを記録する擬似取っ手。複製の写しも個別に作る。 */
interface RecordHandle extends GlyphHandle {
  readonly log: {
    position: { x: number; y: number; z: number } | null;
    scale: { x: number; y: number; z: number } | null;
    opacity: number | null;
    color: number | null;
    released: boolean;
  };
}
function makeHandle(): RecordHandle {
  const log: RecordHandle["log"] = { position: null, scale: null, opacity: null, color: null, released: false };
  return {
    log,
    setPosition(x, y, z) {
      log.position = { x, y, z };
    },
    setRotation() {},
    setScale() {},
    setScale3(x, y, z) {
      log.scale = { x, y, z };
    },
    setColor(c) {
      log.color = c;
    },
    setOpacity(o) {
      log.opacity = o;
    },
    setLetterSpacing() {},
    applyReadability() {},
    setOrientation() {},
    release() {
      log.released = true;
    },
  };
}

/** 任意の寄与を返す最小の演出要素。 */
function makeEffect(
  id: string,
  operates: EffectElement["operates"],
  evaluate: (ctx: EffectContext) => AttributeContribution | null,
  cost?: Partial<EffectCost>
): EffectElement {
  return {
    id,
    displayName: id,
    targetUnit: "char",
    startCondition: { trigger: "onUnitStart" },
    operates,
    defaultPriority: 0,
    estimateCost() {
      return {
        extraGlyphs: 0,
        gsapTargetsPerFrame: 1,
        troikaSyncs: 0,
        glowTargets: 0,
        duplication: false,
        ...cost,
      };
    },
    evaluate,
  };
}

function makeContext(unitStartMs = 0): EffectContext {
  return {
    gameTimeMs: 10,
    unit: "char",
    unitStartMs,
    unitEndMs: unitStartMs + 1000,
    text: "あ",
    unitGlyphCount: 1,
    phraseIndex: 0,
    basePosition: { x: 5, y: 0, z: 0 },
  };
}

function makeComposeBase(): Omit<ComposeInput, "contributions"> {
  return {
    unit: "char",
    baseColor: 0xffffff,
    basePosition: { x: 5, y: 0, z: 0 },
    bloomThreshold: 0.5,
    readability: null,
  };
}

function makeUnit(
  unitId: string,
  effects: readonly DriveEffect[],
  handles: { primary: RecordHandle; copies: RecordHandle[] },
  context = makeContext()
): DriveUnit {
  let copyIndex = 0;
  return {
    unitId,
    context,
    effects,
    composeBase: makeComposeBase(),
    spawnPrimary: () => handles.primary,
    spawnCopy: () => handles.copies[copyIndex++] ?? null,
  };
}

describe("createUnitEffectDriver", () => {
  it("単位の主取っ手へ合成結果（位置・不透明度）を反映する", () => {
    const driver = createUnitEffectDriver({ caps: ROOMY_CAPS });
    const primary = makeHandle();
    // 位置の主変形を基準位置からのオフセットで出す（基準位置 x=5 へ x=+1 して x=6）。
    const move = makeEffect(
      "effect.move",
      { position: "main" },
      () => ({ position: { layer: "main", value: { x: 6, y: 0, z: 0 } } })
    );
    const diag = driver.drive([makeUnit("u1", [{ element: move, priority: 0 }], { primary, copies: [] })]);
    expect(primary.log.position).toEqual({ x: 6, y: 0, z: 0 });
    expect(diag.overBudgetAfterDegrade).toBe(false);
    expect(diag.liveUnitCount).toBe(1);
  });

  it("位置の主変形が無い演出は基準位置へ着地する", () => {
    const driver = createUnitEffectDriver({ caps: ROOMY_CAPS });
    const primary = makeHandle();
    const fade = makeEffect("effect.fade", { opacity: true }, () => ({ opacity: { factor: 0.5 } }));
    driver.drive([makeUnit("u1", [{ element: fade, priority: 0 }], { primary, copies: [] })]);
    expect(primary.log.position).toEqual({ x: 5, y: 0, z: 0 });
    expect(primary.log.opacity).toBeCloseTo(0.5, 6);
  });

  it("去った単位の合成対象を解放し、現れた単位を生成する", () => {
    const driver = createUnitEffectDriver({ caps: ROOMY_CAPS });
    const h1 = makeHandle();
    const h2 = makeHandle();
    const fade = makeEffect("effect.fade", { opacity: true }, () => ({ opacity: { factor: 1 } }));
    driver.drive([makeUnit("u1", [{ element: fade, priority: 0 }], { primary: h1, copies: [] })]);
    expect(h1.log.released).toBe(false);
    // 次フレームは u1 が去り u2 が現れる。
    driver.drive([makeUnit("u2", [{ element: fade, priority: 0 }], { primary: h2, copies: [] })]);
    expect(h1.log.released).toBe(true);
    expect(h2.log.released).toBe(false);
  });

  it("複製の写しを計画数だけ生成して反映する", () => {
    const driver = createUnitEffectDriver({ caps: ROOMY_CAPS });
    const primary = makeHandle();
    const copies = [makeHandle(), makeHandle()];
    const multiply = makeEffect(
      "effect.multiply",
      { duplication: true },
      () => ({
        duplication: {
          layout: "polar",
          minCount: 1,
          copies: [
            { offset: { x: 1, y: 0, z: 0 } },
            { offset: { x: -1, y: 0, z: 0 } },
          ],
        },
      }),
      { extraGlyphs: 2, duplication: true }
    );
    driver.drive([makeUnit("u1", [{ element: multiply, priority: 0 }], { primary, copies })]);
    // 2つの写しが基準位置（x=5）からのオフセットで配置される。
    expect(copies[0].log.position).toEqual({ x: 6, y: 0, z: 0 });
    expect(copies[1].log.position).toEqual({ x: 4, y: 0, z: 0 });
  });

  it("複製数が上限を超えると縮退で写し数を最小数まで減らす", () => {
    // 同時複製数の上限を1にして、写し3・最小1の単位を縮退させる。
    const caps: BudgetCaps = { ...ROOMY_CAPS, duplicateCopies: 1 };
    const driver = createUnitEffectDriver({ caps });
    const primary = makeHandle();
    const copies = [makeHandle(), makeHandle(), makeHandle()];
    const multiply = makeEffect(
      "effect.multiply",
      { duplication: true },
      () => ({
        duplication: {
          layout: "trail",
          minCount: 1,
          copies: [
            { offset: { x: 1, y: 0, z: 0 } },
            { offset: { x: 2, y: 0, z: 0 } },
            { offset: { x: 3, y: 0, z: 0 } },
          ],
        },
      }),
      { extraGlyphs: 3, duplication: true }
    );
    driver.drive([makeUnit("u1", [{ element: multiply, priority: 0 }], { primary, copies })]);
    // 最小数1まで縮退するため、生かす写しは1つだけ（残り2つは確保されず log.position は null のまま）。
    const placed = copies.filter((c) => c.log.position !== null).length;
    expect(placed).toBe(1);
  });

  it("同時表示文字数の上限超過は縮退で下げられず残留超過として診断に出る", () => {
    // 同時表示文字数の上限を0にして、必ず残留超過にする（planDegrade は文字数を直接下げない）。
    const caps: BudgetCaps = { ...ROOMY_CAPS, concurrentGlyphs: 0 };
    const driver = createUnitEffectDriver({ caps });
    const primary = makeHandle();
    const fade = makeEffect("effect.fade", { opacity: true }, () => ({ opacity: { factor: 1 } }));
    const diag = driver.drive([makeUnit("u1", [{ element: fade, priority: 0 }], { primary, copies: [] })]);
    expect(diag.overBudgetAfterDegrade).toBe(true);
    expect(diag.residualOverCaps).toContain("concurrentGlyphs");
  });

  it("dispose で全合成対象を解放する", () => {
    const driver = createUnitEffectDriver({ caps: ROOMY_CAPS });
    const h1 = makeHandle();
    const h2 = makeHandle();
    const fade = makeEffect("effect.fade", { opacity: true }, () => ({ opacity: { factor: 1 } }));
    driver.drive([
      makeUnit("u1", [{ element: fade, priority: 0 }], { primary: h1, copies: [] }),
      makeUnit("u2", [{ element: fade, priority: 0 }], { primary: h2, copies: [] }, makeContext(100)),
    ]);
    driver.dispose();
    expect(h1.log.released).toBe(true);
    expect(h2.log.released).toBe(true);
  });
});
