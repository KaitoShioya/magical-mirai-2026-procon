// モーションセット抽象の検証。
// 設計書§2.2.1の重ね掛け（1要素内部で登場と退場を合成し主変形チャネルの単一値を返す）と、達成基準
// （検証空・寄与不整合空・連続・決定性）を表明する。

import { describe, it, expect } from "vitest";
import { createMotionSetEffect, type MotionSetConfig, type TransformMotionConfig } from "./motionSet";
import { validateEffectElement, findContributionIssues } from "./effectElement";
import type { EffectContext, AttributeContribution, EffectCost } from "./effectElement";
import type { Vector3Like } from "./types";

const FRAME_MS = 1000 / 60;

function zeroCost(): EffectCost {
  return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false };
}

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

function scaleMainConfig(window: { entranceMs: number; exitMs: number }): TransformMotionConfig {
  return {
    kind: "transform",
    id: "effect.test.scale",
    displayName: "検査用の大きさ主変形",
    targetUnit: "char",
    startCondition: { trigger: "onUnitStart" },
    priority: 0,
    cost: zeroCost,
    channel: "scale",
    layer: "main",
    window,
    easing: {},
    values: {
      from: { x: 1.5, y: 1.5, z: 1.5 },
      rest: { x: 1, y: 1, z: 1 },
      to: { x: 0.5, y: 0.5, z: 0.5 },
    },
  };
}

function scaleX(contribution: AttributeContribution | null): number {
  if (!contribution || !contribution.scale) throw new Error("大きさの寄与がありません");
  return contribution.scale.value.x;
}

describe("モーションセット 契約の保証", () => {
  it("生成した演出要素が validateEffectElement を空で通す", () => {
    const element = createMotionSetEffect(scaleMainConfig({ entranceMs: 200, exitMs: 200 }));
    expect(validateEffectElement(element)).toEqual([]);
  });

  it("時刻を掃引した全 evaluate が findContributionIssues を空で通す", () => {
    const element = createMotionSetEffect(scaleMainConfig({ entranceMs: 200, exitMs: 200 }));
    for (let t = 0; t <= 1000; t += 50) {
      const contribution = element.evaluate(ctxAt(t));
      expect(contribution).not.toBeNull();
      expect(findContributionIssues(element.operates, contribution as AttributeContribution)).toEqual([]);
    }
  });

  it("operates が評価の出すチャネルと一致する（大きさ主変形）", () => {
    const element = createMotionSetEffect(scaleMainConfig({ entranceMs: 200, exitMs: 200 }));
    expect(element.operates).toEqual({ scale: "main" });
  });
});

describe("モーションセット 端点と保持", () => {
  it("重ならない窓では先頭で開始値・保持で静止値・末尾で終了値", () => {
    const element = createMotionSetEffect(scaleMainConfig({ entranceMs: 200, exitMs: 200 }));
    expect(scaleX(element.evaluate(ctxAt(0)))).toBeCloseTo(1.5, 9); // from
    expect(scaleX(element.evaluate(ctxAt(500)))).toBeCloseTo(1.0, 9); // rest（保持区間 200〜800）
    expect(scaleX(element.evaluate(ctxAt(1000)))).toBeCloseTo(0.5, 9); // to
  });
});

describe("モーションセット 重ね掛けの連続性（中央の平らな停止を生じない）", () => {
  it("登場と退場が重なる窓では値が連続し、単調な設定では単調に変化する", () => {
    // entranceMs+exitMs > span（登場0〜600・退場400〜1000で400〜600が重なる）。
    const element = createMotionSetEffect(scaleMainConfig({ entranceMs: 600, exitMs: 600 }));
    expect(scaleX(element.evaluate(ctxAt(0)))).toBeCloseTo(1.5, 9); // 先頭で from
    expect(scaleX(element.evaluate(ctxAt(1000)))).toBeCloseTo(0.5, 9); // 末尾で to
    let previous = Number.POSITIVE_INFINITY;
    let prevValue = scaleX(element.evaluate(ctxAt(0)));
    for (let t = 0; t <= 1000; t += FRAME_MS) {
      const value = scaleX(element.evaluate(ctxAt(t)));
      expect(Number.isFinite(value)).toBe(true);
      // from=1.5>rest=1>to=0.5 の単調設定では、重なり区間でも値は単調減少する（途中で静止値1に落ちて止まらない）。
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      // 連続性: 1フレームあたりの変化が大きく跳ばない（不連続な飛びを検知する）。
      expect(Math.abs(value - prevValue)).toBeLessThan(0.2);
      previous = value;
      prevValue = value;
    }
  });
});

describe("モーションセット 決定性", () => {
  it("同じ文脈に対し同じ寄与を返す", () => {
    const element = createMotionSetEffect(scaleMainConfig({ entranceMs: 300, exitMs: 300 }));
    for (const t of [0, 137, 250, 500, 813, 1000]) {
      const a = scaleX(element.evaluate(ctxAt(t)));
      const b = scaleX(element.evaluate(ctxAt(t)));
      expect(a).toBe(b);
    }
  });
});

describe("モーションセット 文字ごとの登場ずらし", () => {
  it("文字番号に比例して登場開始が遅れる", () => {
    const config = scaleMainConfig({ entranceMs: 200, exitMs: 0 });
    const staggered: MotionSetConfig = { ...config, window: { entranceMs: 200, exitMs: 0, perCharStaggerMs: 100 } };
    const element = createMotionSetEffect(staggered);
    // 文字番号1は開始が100ミリ秒遅れるため、時刻100で進行0（開始値）になる。
    expect(scaleX(element.evaluate(ctxAt(100, { charIndex: 1 })))).toBeCloseTo(1.5, 9);
    // 文字番号0は時刻100で進行が半分まで進む（開始値より落ち着きへ寄る）。
    expect(scaleX(element.evaluate(ctxAt(100, { charIndex: 0 })))).toBeLessThan(1.5);
  });
});

describe("モーションセット 位置の基準位置相対", () => {
  it("relativeToBase の位置は基準位置に加算して着地する", () => {
    const config: TransformMotionConfig = {
      kind: "transform",
      id: "effect.test.axis",
      displayName: "検査用の軸移動",
      targetUnit: "char",
      startCondition: { trigger: "onUnitStart" },
      priority: 0,
      cost: zeroCost,
      channel: "position",
      layer: "main",
      window: { entranceMs: 200, exitMs: 0 },
      easing: {},
      values: {
        from: { x: 100, y: 0, z: 0 }, // 右から100だけずれて登場
        rest: { x: 0, y: 0, z: 0 }, // 静止は基準位置そのもの
        to: { x: 0, y: 0, z: 0 },
      },
      relativeToBase: true,
    };
    const element = createMotionSetEffect(config);
    const base: Vector3Like = { x: 5, y: 7, z: 9 };
    // 登場完了後（時刻300、進行1）は基準位置へ着地する。
    const settled = element.evaluate(ctxAt(300, { basePosition: base }));
    expect(settled?.position?.value).toEqual({ x: 5, y: 7, z: 9 });
    // 開始時（時刻0、進行0）は基準位置＋開始オフセット。
    const start = element.evaluate(ctxAt(0, { basePosition: base }));
    expect(start?.position?.value.x).toBeCloseTo(105, 9);
  });
});

describe("モーションセット 揺らぎ層（浮遊）", () => {
  it("位置の揺らぎ寄与を返し、検証を通り、振幅内に収まる", () => {
    const config: MotionSetConfig = {
      kind: "jitter",
      id: "effect.test.float",
      displayName: "検査用の浮遊",
      targetUnit: "char",
      startCondition: { trigger: "duringUnit" },
      priority: 0,
      cost: zeroCost,
      amplitude: { x: 2, y: 3, z: 0 },
      freqHz: 1.5,
    };
    const element = createMotionSetEffect(config);
    expect(validateEffectElement(element)).toEqual([]);
    expect(element.operates).toEqual({ position: "jitter" });
    for (let t = 0; t <= 2000; t += 25) {
      const contribution = element.evaluate(ctxAt(t));
      expect(findContributionIssues(element.operates, contribution as AttributeContribution)).toEqual([]);
      const value = (contribution as AttributeContribution).position?.value as Vector3Like;
      expect(Math.abs(value.x)).toBeLessThanOrEqual(2 + 1e-9);
      expect(Math.abs(value.y)).toBeLessThanOrEqual(3 + 1e-9);
    }
  });
});

describe("モーションセット 点滅（方形波）", () => {
  it("半周期で点灯と消灯を切り替え、点灯時に発光を出す", () => {
    const config: MotionSetConfig = {
      kind: "squareWave",
      id: "effect.test.blink",
      displayName: "検査用の点滅",
      targetUnit: "char",
      startCondition: { trigger: "duringUnit" },
      priority: 0,
      cost: zeroCost,
      halfPeriodMs: 100,
      onGlow: 0.8,
    };
    const element = createMotionSetEffect(config);
    expect(validateEffectElement(element)).toEqual([]);
    expect(element.operates).toEqual({ opacity: true, glow: true });
    // 0〜100は点灯、100〜200は消灯。
    expect(element.evaluate(ctxAt(50))?.opacity?.factor).toBe(1);
    expect(element.evaluate(ctxAt(50))?.glow?.intensity).toBeCloseTo(0.8, 9);
    expect(element.evaluate(ctxAt(150))?.opacity?.factor).toBe(0);
    expect(element.evaluate(ctxAt(150))?.glow).toBeUndefined();
  });
});

describe("モーションセット スカラー（字間・不透明度）", () => {
  it("字間は主変形の字間寄与を返す", () => {
    const config: MotionSetConfig = {
      kind: "scalar",
      id: "effect.test.spacing",
      displayName: "検査用の字間",
      targetUnit: "phrase",
      startCondition: { trigger: "onUnitStart" },
      priority: 0,
      cost: zeroCost,
      channel: "letterSpacing",
      window: { entranceMs: 200, exitMs: 0 },
      easing: {},
      values: { from: 0, rest: 30, to: 30 },
    };
    const element = createMotionSetEffect(config);
    expect(validateEffectElement(element)).toEqual([]);
    expect(element.operates).toEqual({ letterSpacing: "main" });
    expect(element.evaluate(ctxAt(0, { unit: "phrase" }))?.letterSpacing?.value).toBeCloseTo(0, 9);
    expect(element.evaluate(ctxAt(300, { unit: "phrase" }))?.letterSpacing?.value).toBeCloseTo(30, 9);
  });

  it("不透明度は0以上1以下に収まる係数を返す", () => {
    const config: MotionSetConfig = {
      kind: "scalar",
      id: "effect.test.opacity",
      displayName: "検査用の不透明度",
      targetUnit: "char",
      startCondition: { trigger: "onUnitEnd" },
      priority: 0,
      cost: zeroCost,
      channel: "opacity",
      window: { entranceMs: 0, exitMs: 200 },
      easing: {},
      values: { from: 1, rest: 1, to: 0 },
    };
    const element = createMotionSetEffect(config);
    expect(element.operates).toEqual({ opacity: true });
    for (let t = 0; t <= 1000; t += 50) {
      const factor = element.evaluate(ctxAt(t))?.opacity?.factor as number;
      expect(factor).toBeGreaterThanOrEqual(0);
      expect(factor).toBeLessThanOrEqual(1);
    }
    expect(element.evaluate(ctxAt(1000))?.opacity?.factor).toBeCloseTo(0, 9);
  });
});
