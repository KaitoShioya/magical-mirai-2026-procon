// 渦・波打ち・渦状スキャッター転換の検証。変形寄与のみを返すこと（変形排他）、塊配置が寄与経路を通って
// 合成結果の変形枠へ解決されることを表明する。

import { describe, it, expect } from "vitest";
import { validateEffectElement, findContributionIssues } from "../effectElement";
import type { EffectContext } from "../effectElement";
import { composeGlyphState } from "../effectCompositor";
import { swirlDeform, waveDeform, vortexScatterTransition, SCATTER_MIN_SCALE } from "./deformVortex";

function ctxAt(gameTimeMs: number, opts?: Partial<EffectContext>): EffectContext {
  return {
    gameTimeMs,
    unit: opts?.unit ?? "phrase",
    unitStartMs: opts?.unitStartMs ?? 0,
    unitEndMs: opts?.unitEndMs ?? 1000,
    text: opts?.text ?? "あいう",
    unitGlyphCount: opts?.unitGlyphCount ?? 3,
    phraseIndex: opts?.phraseIndex ?? 0,
    loudness: opts?.loudness ?? 0.8,
    atSectionBoundary: opts?.atSectionBoundary,
    basePosition: opts?.basePosition,
  };
}

describe("渦・波打ち 契約", () => {
  it("渦・波打ちは検証を通り、変形寄与だけを返す（変形排他）", () => {
    for (const effect of [swirlDeform, waveDeform]) {
      expect(validateEffectElement(effect)).toEqual([]);
      const contribution = effect.evaluate(ctxAt(300));
      expect(contribution?.deform).toBeDefined();
      // 幾何チャネルを同時に出さない。
      expect(contribution?.position).toBeUndefined();
      expect(contribution?.scale).toBeUndefined();
      expect(findContributionIssues(effect.operates, contribution!)).toEqual([]);
    }
  });
});

describe("渦状スキャッター転換", () => {
  it("検証を通り、変形と不透明度を出し寄与不整合が無い", () => {
    expect(validateEffectElement(vortexScatterTransition)).toEqual([]);
    for (let t = 0; t <= 1000; t += 100) {
      const contribution = vortexScatterTransition.evaluate(ctxAt(t, { basePosition: { x: 1, y: 2, z: 3 } }));
      expect(findContributionIssues(vortexScatterTransition.operates, contribution!)).toEqual([]);
    }
  });

  it("生存周期の進行で塊が縮み不透明度が減衰する", () => {
    const start = vortexScatterTransition.evaluate(ctxAt(0, { basePosition: { x: 1, y: 2, z: 3 } }));
    const end = vortexScatterTransition.evaluate(ctxAt(1000, { basePosition: { x: 1, y: 2, z: 3 } }));
    expect(start?.deform?.massPlacement?.scale?.x).toBeCloseTo(1, 3);
    expect(end?.deform?.massPlacement?.scale?.x).toBeCloseTo(SCATTER_MIN_SCALE, 3);
    expect(start?.opacity?.factor).toBeCloseTo(1, 3);
    expect(end?.opacity?.factor).toBeCloseTo(0, 3);
  });

  it("塊配置が合成結果の変形枠へ解決される（基準位置と縮小倍率が届く）", () => {
    const contribution = vortexScatterTransition.evaluate(ctxAt(1000, { basePosition: { x: 4, y: 5, z: 6 } }));
    const composed = composeGlyphState({
      unit: "phrase",
      contributions: [
        {
          id: vortexScatterTransition.id,
          priority: 0,
          operates: vortexScatterTransition.operates,
          contribution: contribution!,
        },
      ],
      baseColor: 0xffffff,
      basePosition: { x: 4, y: 5, z: 6 },
      bloomThreshold: 0.8,
      readability: null,
    });
    expect(composed.deform).not.toBeNull();
    expect(composed.deform?.massPosition).toEqual({ x: 4, y: 5, z: 6 });
    expect(composed.deform?.massScale.x).toBeCloseTo(SCATTER_MIN_SCALE, 3);
  });
});
