// 8演出文法の実演出（#23 charSmash・#24〜#28・#30・#32）の契約と挙動の検証。
// charSmash は専用テスト（charSmash.test.ts）を持つため、ここでは残り7文法を検証する。
// 各演出が validateEffectElement と findContributionIssues を空で通し、宣言した識別名と対象単位を持ち、
// チャネル固有の挙動を満たすことを表明する。識別名は割付規則 effectAssignment.ts の EFFECT_ID と一致させる。

import { describe, it, expect } from "vitest";
import { validateEffectElement, findContributionIssues } from "../effectElement";
import type { EffectContext, AttributeContribution, EffectElement } from "../effectElement";
import { EFFECT_ID } from "../effectAssignment";
import { letterSpacingSpread } from "./letterSpacingSpread";
import { circularMultiply, CIRCULAR_COPIES } from "./circularMultiply";
import { verticalStretchSwirl, SWIRL_LOUDNESS_THRESHOLD } from "./verticalStretchSwirl";
import { afterimageTrail } from "./afterimageTrail";
import { fadeBlackout } from "./fadeBlackout";
import { emotionLoudness, EMOTION_WARM_COLOR, EMOTION_COOL_COLOR } from "./emotionLoudness";
import { depthFlight } from "./depthFlight";

function ctxAt(gameTimeMs: number, opts?: Partial<EffectContext>): EffectContext {
  return {
    gameTimeMs,
    unit: opts?.unit ?? "char",
    unitStartMs: opts?.unitStartMs ?? 0,
    unitEndMs: opts?.unitEndMs ?? 1000,
    text: opts?.text ?? "あ",
    unitGlyphCount: opts?.unitGlyphCount ?? 1,
    phraseIndex: opts?.phraseIndex ?? 0,
    loudness: opts?.loudness,
    emotion: opts?.emotion,
    basePosition: opts?.basePosition,
  };
}

// 各演出が検証を通り、代表的な文脈の掃引で寄与不整合が無いことを確認する共通検査。
function expectContractClean(effect: EffectElement, unit: EffectContext["unit"]): void {
  expect(validateEffectElement(effect)).toEqual([]);
  for (let t = 0; t <= 1000; t += 50) {
    for (const loud of [0, 0.3, 0.7, 1]) {
      for (const emotion of [0.2, 0.8]) {
        const contribution = effect.evaluate(ctxAt(t, { unit, loudness: loud, emotion, basePosition: { x: 1, y: 2, z: 3 } }));
        if (contribution !== null) {
          expect(findContributionIssues(effect.operates, contribution)).toEqual([]);
        }
      }
    }
  }
}

describe("8文法 識別名が割付規則の EFFECT_ID と一致する", () => {
  it("各実演出の id が EFFECT_ID の値と一致する（到達可能性の前提）", () => {
    expect(letterSpacingSpread.id).toBe(EFFECT_ID.letterSpacingSpread);
    expect(circularMultiply.id).toBe(EFFECT_ID.circularMultiply);
    expect(verticalStretchSwirl.id).toBe(EFFECT_ID.verticalStretchSwirl);
    expect(afterimageTrail.id).toBe(EFFECT_ID.afterimageTrail);
    expect(fadeBlackout.id).toBe(EFFECT_ID.fadeBlackout);
    expect(emotionLoudness.id).toBe(EFFECT_ID.emotionLoudness);
    expect(depthFlight.id).toBe(EFFECT_ID.depthFlight);
  });
});

describe("8文法 契約の保証（検証空・寄与不整合空）", () => {
  it("字間拡大一括（#24）", () => expectContractClean(letterSpacingSpread, "phrase"));
  it("円状回転・重ね増殖（#25）", () => expectContractClean(circularMultiply, "word"));
  it("縦伸ばし・渦（#26）", () => expectContractClean(verticalStretchSwirl, "char"));
  it("残像トレイル（#27）", () => expectContractClean(afterimageTrail, "char"));
  it("減衰・暗転（#28）", () => expectContractClean(fadeBlackout, "fullscreen"));
  it("感情・声量マッピング（#30）", () => expectContractClean(emotionLoudness, "char"));
  it("奥行き飛び込み（#32）", () => expectContractClean(depthFlight, "char"));
});

describe("8文法 チャネル固有の挙動", () => {
  it("字間は0から目標へ広がる", () => {
    const start = letterSpacingSpread.evaluate(ctxAt(0, { unit: "phrase" }))?.letterSpacing?.value as number;
    const held = letterSpacingSpread.evaluate(ctxAt(500, { unit: "phrase" }))?.letterSpacing?.value as number;
    expect(start).toBeCloseTo(0, 6);
    expect(held).toBeGreaterThan(start);
  });

  it("円状増殖は polar の写しを持ち最小数以上", () => {
    const dup = circularMultiply.evaluate(ctxAt(200, { unit: "word" }))?.duplication;
    expect(dup?.layout).toBe("polar");
    expect(dup?.copies.length).toBe(CIRCULAR_COPIES);
    expect(dup?.minCount).toBeGreaterThanOrEqual(1);
  });

  it("縦伸ばし・渦は変形排他（声量大で変形のみ・声量小で大きさのみ）", () => {
    const swirl = verticalStretchSwirl.evaluate(ctxAt(300, { loudness: SWIRL_LOUDNESS_THRESHOLD + 0.1 }));
    expect(swirl?.deform).toBeDefined();
    expect(swirl?.scale).toBeUndefined(); // 変形と幾何チャネルを同時に出さない
    const stretch = verticalStretchSwirl.evaluate(ctxAt(300, { loudness: SWIRL_LOUDNESS_THRESHOLD - 0.1 }));
    expect(stretch?.scale).toBeDefined();
    expect(stretch?.deform).toBeUndefined();
    expect((stretch?.scale?.value.y as number)).toBeGreaterThanOrEqual(1);
    expect(stretch?.scale?.value.x).toBe(1); // 縦のみ
  });

  it("残像トレイルは奥ほど不透明度が減衰する", () => {
    const dup = afterimageTrail.evaluate(ctxAt(100))?.duplication;
    expect(dup?.layout).toBe("trail");
    const opacities = dup?.copies.map((copy) => copy.opacity ?? 1) ?? [];
    for (let i = 1; i < opacities.length; i += 1) {
      expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]);
    }
  });

  it("暗転は不透明度を1から0へ落とす", () => {
    expect(fadeBlackout.evaluate(ctxAt(0, { unit: "fullscreen" }))?.opacity?.factor).toBeCloseTo(1, 6);
    expect(fadeBlackout.evaluate(ctxAt(1000, { unit: "fullscreen" }))?.opacity?.factor).toBeCloseTo(0, 6);
  });

  it("感情で色が切り替わり、声量で発光が強まる", () => {
    const warm = emotionLoudness.evaluate(ctxAt(100, { loudness: 0.8, emotion: 0.9 }));
    expect(warm?.color?.color).toBe(EMOTION_WARM_COLOR);
    expect(warm?.glow?.intensity).toBeCloseTo(0.8, 6);
    const cool = emotionLoudness.evaluate(ctxAt(100, { loudness: 0.2, emotion: 0.1 }));
    expect(cool?.color?.color).toBe(EMOTION_COOL_COLOR);
    expect((cool?.glow?.intensity as number)).toBeLessThan(0.8);
  });

  it("奥行き飛び込みは奥から手前の基準位置へ着地し、回転を添える", () => {
    const base = { x: 1, y: 2, z: 3 };
    const start = depthFlight.evaluate(ctxAt(0, { basePosition: base }));
    const landed = depthFlight.evaluate(ctxAt(1000, { basePosition: base }));
    // 開始は基準より奥（z が小さい）、着地は基準位置そのもの。
    expect((start?.position?.value.z as number)).toBeLessThan(base.z);
    expect(landed?.position?.value.z as number).toBeCloseTo(base.z, 3);
    expect(landed?.position?.value.x).toBeCloseTo(base.x, 6);
    expect(start?.rotation).toBeDefined();
  });
});
