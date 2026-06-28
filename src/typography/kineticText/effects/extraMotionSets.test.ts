// 設計書§5.5の追加技法（チャネル完結セット）の契約と挙動の検証。
// 各セットが validateEffectElement と findContributionIssues を空で通し、宣言したチャネルの挙動を満たすことを表明する。

import { describe, it, expect } from "vitest";
import { validateEffectElement, findContributionIssues } from "../effectElement";
import type { EffectContext, EffectElement } from "../effectElement";
import {
  axisMove,
  scaleSoftSmash,
  squashStretch,
  blink,
  floatJitter,
  wordRotation,
  unitOpacity,
  initialFlash,
} from "./extraMotionSets";

function ctxAt(gameTimeMs: number, opts?: Partial<EffectContext>): EffectContext {
  return {
    gameTimeMs,
    unit: opts?.unit ?? "char",
    unitStartMs: opts?.unitStartMs ?? 0,
    unitEndMs: opts?.unitEndMs ?? 1000,
    text: opts?.text ?? "あ",
    unitGlyphCount: opts?.unitGlyphCount ?? 1,
    phraseIndex: opts?.phraseIndex ?? 0,
    charIndex: opts?.charIndex,
    loudness: opts?.loudness,
    basePosition: opts?.basePosition,
  };
}

const ALL: ReadonlyArray<[EffectElement, EffectContext["unit"]]> = [
  [axisMove, "char"],
  [scaleSoftSmash, "char"],
  [squashStretch, "char"],
  [blink, "char"],
  [floatJitter, "char"],
  [wordRotation, "word"],
  [unitOpacity, "phrase"],
  [initialFlash, "char"],
];

describe("§5.5 追加技法 契約の保証", () => {
  it("各セットが validateEffectElement を空で通す", () => {
    for (const [effect] of ALL) {
      expect(validateEffectElement(effect)).toEqual([]);
    }
  });

  it("時刻を掃引した全 evaluate が findContributionIssues を空で通す", () => {
    for (const [effect, unit] of ALL) {
      for (let t = 0; t <= 1000; t += 50) {
        const contribution = effect.evaluate(
          ctxAt(t, { unit, charIndex: 0, loudness: 0.6, basePosition: { x: 1, y: 2, z: 3 } })
        );
        if (contribution !== null) {
          expect(findContributionIssues(effect.operates, contribution)).toEqual([]);
        }
      }
    }
  });
});

describe("§5.5 追加技法 チャネル固有の挙動", () => {
  it("軸（直線移動）は基準位置へ着地し、文字番号で登場がずれる", () => {
    const base = { x: 1, y: 2, z: 3 };
    // 登場完了後（保持区間、退場開始前）は基準位置に着地する（unitEnd=1000・退場400ミリ秒のため退場開始は600ミリ秒）。
    const settled = axisMove.evaluate(ctxAt(400, { charIndex: 0, basePosition: base }));
    expect(settled?.position?.value.x).toBeCloseTo(1, 6);
    // 文字番号1は登場が24ミリ秒遅れるため、同時刻で文字0より開始側（左、x が小さい）にいる。
    const c0 = axisMove.evaluate(ctxAt(60, { charIndex: 0, basePosition: base }))?.position?.value.x as number;
    const c1 = axisMove.evaluate(ctxAt(60, { charIndex: 1, basePosition: base }))?.position?.value.x as number;
    expect(c1).toBeLessThan(c0);
  });

  it("柔らかい拡大は登場で目標（等倍）を一度越える（出の戻り）", () => {
    let exceeded = false;
    for (let t = 0; t <= 260; t += 10) {
      const s = scaleSoftSmash.evaluate(ctxAt(t))?.scale?.value.x as number;
      if (s < 1 - 1e-6) exceeded = true; // 1.6→1へ減るとき出の戻りで1を下回る行き過ぎが出る
    }
    expect(exceeded).toBe(true);
  });

  it("押し潰しと引き伸ばしは縦横独立（横長・縦細）で登場する", () => {
    // 移動方向（横）へ引き伸ばし、垂直（縦）に潰す（設計書§2.1.3-3）。
    const v = squashStretch.evaluate(ctxAt(0))?.scale?.value;
    expect(v?.x).toBeGreaterThan(1); // 横が伸びる（移動方向）
    expect(v?.y).toBeLessThan(1); // 縦が縮む（垂直）
  });

  it("点滅は半周期で点灯と消灯を切り替える", () => {
    expect(blink.evaluate(ctxAt(60))?.opacity?.factor).toBe(1);
    expect(blink.evaluate(ctxAt(180))?.opacity?.factor).toBe(0);
  });

  it("浮遊は時間で振動する（同時刻で値が変わる）", () => {
    const a = floatJitter.evaluate(ctxAt(100, { loudness: 1 }))?.position?.value.x as number;
    const b = floatJitter.evaluate(ctxAt(300, { loudness: 1 }))?.position?.value.x as number;
    expect(a).not.toBe(b);
  });

  it("全体回転は回転して戻る（登場で回転、保持で0へ）", () => {
    const start = wordRotation.evaluate(ctxAt(0, { unit: "word" }))?.rotation?.value.z as number;
    const settled = wordRotation.evaluate(ctxAt(500, { unit: "word" }))?.rotation?.value.z as number;
    expect(Math.abs(start)).toBeGreaterThan(0.1);
    expect(settled).toBeCloseTo(0, 6);
  });

  it("単位の不透明度は登場で現れ退場で消える", () => {
    expect(unitOpacity.evaluate(ctxAt(0, { unit: "phrase" }))?.opacity?.factor).toBeCloseTo(0, 6);
    expect(unitOpacity.evaluate(ctxAt(500, { unit: "phrase" }))?.opacity?.factor).toBeCloseTo(1, 6);
    expect(unitOpacity.evaluate(ctxAt(1000, { unit: "phrase" }))?.opacity?.factor).toBeCloseTo(0, 6);
  });

  it("頭文字フラッシュは登場直後に現れる", () => {
    expect(initialFlash.evaluate(ctxAt(0))?.opacity?.factor).toBeCloseTo(0, 6);
    expect(initialFlash.evaluate(ctxAt(200))?.opacity?.factor).toBeCloseTo(1, 6);
  });
});
