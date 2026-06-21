import { describe, it, expect } from "vitest";
import {
  createEffectRegistry,
  validateEffectElement,
  findContributionIssues,
  type EffectElement,
  type EffectContext,
  type EffectCost,
  type EffectCostInput,
  type AttributeContribution,
  type OperatedAttributes,
} from "./effectElement";
import { allSampleEffects, verticalStretchSwirlSample } from "./fixtures/sampleEffects";

function baseContext(overrides: Partial<EffectContext> = {}): EffectContext {
  return {
    gameTimeMs: 500,
    unit: "char",
    unitStartMs: 0,
    unitEndMs: 1000,
    text: "あ",
    unitGlyphCount: 1,
    phraseIndex: 0,
    beatPhase: 0.25,
    loudness: 0.3,
    emotion: 0.6,
    atSectionBoundary: false,
    ...overrides,
  };
}

/** 最小の正当な演出要素。否定検査でフィールドを差し替えて使う。 */
function validElement(overrides: Partial<EffectElement> = {}): EffectElement {
  return {
    id: "test.valid",
    displayName: "検査用",
    targetUnit: "char",
    startCondition: { trigger: "onUnitStart" },
    operates: { opacity: true },
    defaultPriority: 0,
    estimateCost(_input: EffectCostInput): EffectCost {
      return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false };
    },
    evaluate(): AttributeContribution | null {
      return { opacity: { factor: 1 } };
    },
    ...overrides,
  };
}

describe("受け入れ基準1: 後続演出が本基盤を改変せず登録1件で追加できる", () => {
  it("8演出（#23・#24〜#28・#30・#32）をすべて登録でき、一覧と往復取得が一致する", () => {
    const registry = createEffectRegistry();
    for (const effect of allSampleEffects) {
      registry.register(effect);
    }
    expect(registry.list()).toHaveLength(allSampleEffects.length);
    for (const effect of allSampleEffects) {
      expect(registry.get(effect.id)).toBe(effect);
    }
  });

  it("各演出の評価が返す寄与は宣言した操作属性の範囲内に収まる", () => {
    for (const effect of allSampleEffects) {
      const ctx = baseContext({ unit: effect.targetUnit, text: effect.targetUnit === "fullscreen" ? "" : "あ" });
      const contribution = effect.evaluate(ctx);
      expect(contribution, `${effect.id} は寄与を返す`).not.toBeNull();
      expect(findContributionIssues(effect.operates, contribution as AttributeContribution)).toEqual([]);
    }
  });

  it("円状増殖（#25）と残像（#27）は写しの列を返し、残像は写しごとに減衰する不透明度を持つ", () => {
    const circular = allSampleEffects.find((effect) => effect.id === "sample.circularMultiply");
    const trail = allSampleEffects.find((effect) => effect.id === "sample.afterimageTrail");
    const circularContribution = circular?.evaluate(baseContext({ unit: "word" }));
    const trailContribution = trail?.evaluate(baseContext());
    expect(circularContribution?.duplication?.copies.length).toBeGreaterThan(0);
    expect(circularContribution?.duplication?.layout).toBe("polar");
    const trailCopies = trailContribution?.duplication?.copies ?? [];
    expect(trailCopies.length).toBeGreaterThan(0);
    // 後ろの写しほど不透明度が小さい（減衰）。
    for (let index = 1; index < trailCopies.length; index += 1) {
      expect(trailCopies[index].opacity ?? 1).toBeLessThanOrEqual(trailCopies[index - 1].opacity ?? 1);
    }
  });

  it("縦伸ばし・渦（#26）は声量で大きさか変形の一方だけを返し、両者を同時に返さない", () => {
    const stretch = verticalStretchSwirlSample.evaluate(baseContext({ loudness: 0.2 }));
    const swirl = verticalStretchSwirlSample.evaluate(baseContext({ loudness: 0.8 }));
    expect(stretch?.scale).toBeDefined();
    expect(stretch?.deform).toBeUndefined();
    expect(swirl?.deform).toBeDefined();
    expect(swirl?.scale).toBeUndefined();
    // どちらの分岐も発信時の不変条件（変形排他・操作属性の範囲内）を満たす。
    expect(findContributionIssues(verticalStretchSwirlSample.operates, stretch as AttributeContribution)).toEqual([]);
    expect(findContributionIssues(verticalStretchSwirlSample.operates, swirl as AttributeContribution)).toEqual([]);
  });
});

describe("受け入れ基準2: 費用と既定優先度の宣言が必須項目として機能する", () => {
  it("すべて正しい演出は不整合が空で登録できる", () => {
    expect(validateEffectElement(validElement())).toEqual([]);
    const registry = createEffectRegistry();
    expect(() => registry.register(validElement())).not.toThrow();
  });

  it("既定優先度が無い・非有限だと不整合を返し登録が例外を投げる", () => {
    const missing = validElement({ defaultPriority: undefined as unknown as number });
    const infinite = validElement({ defaultPriority: Number.POSITIVE_INFINITY });
    expect(validateEffectElement(missing).some((issue) => issue.path === "defaultPriority")).toBe(true);
    expect(validateEffectElement(infinite).some((issue) => issue.path === "defaultPriority")).toBe(true);
    const registry = createEffectRegistry();
    expect(() => registry.register(missing)).toThrow();
  });

  it("費用算出が無い・関数でないと不整合を返し登録が例外を投げる", () => {
    const noCost = validElement({ estimateCost: undefined as unknown as EffectElement["estimateCost"] });
    expect(validateEffectElement(noCost).some((issue) => issue.path === "estimateCost")).toBe(true);
    const registry = createEffectRegistry();
    expect(() => registry.register(noCost)).toThrow();
  });

  // 受け入れ基準②の証明を費用5項目すべてに広げる。1項目ずつ欠落と型不正を作り、
  // 不整合がその項目を指して返ることを確かめる。これにより「費用が必須項目として機能する」を完全に示す。
  it("費用の数値4項目それぞれについて、欠落と型不正を当該項目の不整合として返す", () => {
    const fullCost: EffectCost = { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false };
    const numericFields = ["extraGlyphs", "gsapTargetsPerFrame", "troikaSyncs", "glowTargets"] as const;
    for (const field of numericFields) {
      const missing = { ...fullCost } as Record<string, unknown>;
      delete missing[field];
      const wrongType = { ...fullCost, [field]: "x" } as Record<string, unknown>;
      const missingElement = validElement({ estimateCost: (): EffectCost => missing as unknown as EffectCost });
      const wrongTypeElement = validElement({ estimateCost: (): EffectCost => wrongType as unknown as EffectCost });
      expect(validateEffectElement(missingElement).some((issue) => issue.path.includes(field)), `${field} の欠落`).toBe(true);
      expect(validateEffectElement(wrongTypeElement).some((issue) => issue.path.includes(field)), `${field} の型不正`).toBe(true);
    }
  });

  it("費用の duplication（真偽値）について、欠落と型不正を当該項目の不整合として返す", () => {
    const missing = { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0 } as Record<string, unknown>;
    const wrongType = { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: 1 } as Record<string, unknown>;
    const missingElement = validElement({ estimateCost: (): EffectCost => missing as unknown as EffectCost });
    const wrongTypeElement = validElement({ estimateCost: (): EffectCost => wrongType as unknown as EffectCost });
    expect(validateEffectElement(missingElement).some((issue) => issue.path.includes("duplication"))).toBe(true);
    expect(validateEffectElement(wrongTypeElement).some((issue) => issue.path.includes("duplication"))).toBe(true);
  });

  it("複製の宣言と費用の duplication が食い違うと不整合を返す（双方向）", () => {
    const declaresButCostFalse = validElement({
      operates: { duplication: true },
      estimateCost: (): EffectCost => ({ extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false }),
    });
    const costTrueButNotDeclared = validElement({
      operates: { opacity: true },
      estimateCost: (input: EffectCostInput): EffectCost => ({
        extraGlyphs: input.unitGlyphCount,
        gsapTargetsPerFrame: 1,
        troikaSyncs: 0,
        glowTargets: 0,
        duplication: true,
      }),
    });
    expect(validateEffectElement(declaresButCostFalse).length).toBeGreaterThan(0);
    expect(validateEffectElement(costTrueButNotDeclared).length).toBeGreaterThan(0);
  });

  it("拍の刻みは正の整数に限る（非整数は不整合）", () => {
    const fractional = validElement({ startCondition: { trigger: "onUnitStart", beatCadence: 1.5 } });
    expect(validateEffectElement(fractional).some((issue) => issue.path === "startCondition.beatCadence")).toBe(true);
  });

  it("既定優先度は任意の有限数を受理する（負値も大きな値も）", () => {
    expect(validateEffectElement(validElement({ defaultPriority: -100 }))).toEqual([]);
    expect(validateEffectElement(validElement({ defaultPriority: 1000 }))).toEqual([]);
  });

  it("費用の妥当性: 8演出の費用は文字数1と16で5項目を非負・正しい型で返し、複製演出は文字数に比例する", () => {
    for (const effect of allSampleEffects) {
      for (const count of [1, 16]) {
        const cost = effect.estimateCost({ unitGlyphCount: count });
        expect(Number.isFinite(cost.extraGlyphs) && cost.extraGlyphs >= 0).toBe(true);
        expect(Number.isFinite(cost.gsapTargetsPerFrame) && cost.gsapTargetsPerFrame >= 0).toBe(true);
        expect(Number.isFinite(cost.troikaSyncs) && cost.troikaSyncs >= 0).toBe(true);
        expect(Number.isFinite(cost.glowTargets) && cost.glowTargets >= 0).toBe(true);
        expect(typeof cost.duplication).toBe("boolean");
      }
      // 複製演出は文字数が増えると必要追加文字数が増える。
      if (effect.operates.duplication) {
        const small = effect.estimateCost({ unitGlyphCount: 1 });
        const large = effect.estimateCost({ unitGlyphCount: 16 });
        expect(large.extraGlyphs).toBeGreaterThan(small.extraGlyphs);
      }
    }
  });
});

describe("登録の仕組み", () => {
  it("未登録の識別子は例外を投げる", () => {
    const registry = createEffectRegistry();
    expect(() => registry.get("missing")).toThrow();
  });

  it("同一識別子の二重登録は例外を投げる（無言の上書きにしない）", () => {
    const registry = createEffectRegistry();
    registry.register(validElement({ id: "dup" }));
    expect(() => registry.register(validElement({ id: "dup" }))).toThrow();
  });
});

describe("発信時の不変条件（findContributionIssues）", () => {
  const operates: OperatedAttributes = { position: "main", deform: true, opacity: true };

  it("変形と1文字ごとの寄与を同時に含むと不整合を返す", () => {
    const contribution: AttributeContribution = {
      deform: { kind: "swirl", params: { strength: 1, speed: 1, spatialFreq: 1, phaseOffset: 0 } },
      position: { layer: "main", value: { x: 0, y: 0, z: 0 } },
    };
    expect(findContributionIssues(operates, contribution).length).toBeGreaterThan(0);
  });

  it("宣言していない属性を返すと不整合を返す", () => {
    const contribution: AttributeContribution = { glow: { intensity: 1 } };
    expect(findContributionIssues(operates, contribution).length).toBeGreaterThan(0);
  });

  it("宣言と層が一致しないと不整合を返す", () => {
    const contribution: AttributeContribution = { position: { layer: "jitter", value: { x: 0, y: 0, z: 0 } } };
    expect(findContributionIssues(operates, contribution).length).toBeGreaterThan(0);
  });

  it("複製の最小写し数が写しの数を超えると不整合を返す", () => {
    const dupOperates: OperatedAttributes = { duplication: true };
    const contribution: AttributeContribution = {
      duplication: { layout: "trail", copies: [{ offset: { x: 0, y: 0, z: 0 } }], minCount: 3 },
    };
    expect(findContributionIssues(dupOperates, contribution).length).toBeGreaterThan(0);
  });
});
