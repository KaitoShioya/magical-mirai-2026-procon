// イージング基盤の検証。
// 付録A.0.1の数式と、設計書§2の達成基準（端点・単調性の範囲・行き過ぎの範囲・出入り合成・重ね掛け恒等）を表明する。

import { describe, it, expect } from "vitest";
import {
  easingByNumber,
  easingByName,
  resolveEasing,
  composeEasing,
  outIn,
  linear,
  inSine,
  outSine,
  inExpo,
  outExpo,
  inCirc,
  outCirc,
  inElastic,
  outElastic,
  inBack,
  outBack,
  inBounce,
  outBounce,
  inOutSine,
  type EasingName,
} from "./easing";

// 41番すべてを掃引するための番号配列。
const ALL_NUMBERS = Array.from({ length: 41 }, (_unused, index) => index + 1);
// 単調非減少を要求するのは 直線・正弦・二次〜五次・指数・円弧（番号1〜29）に限る。
// 採用理由: 弾性（30〜33）・戻り（34〜37）・跳ね（38〜41）は行き過ぎや跳ね返りで非単調になる仕様のため。
const MONOTONIC_NUMBERS = Array.from({ length: 29 }, (_unused, index) => index + 1);
// 行き過ぎ（出力が0未満または1超）を持つのは弾性と戻りの入り・出・入り出の変種に限る。
// 採用理由: 出入りの変種（33・37）は outIn が前半・後半をそれぞれ縦に半分へ圧縮するため、元の行き過ぎが
// 0以上1以下の範囲へ収まり、0未満や1超を生じない。跳ね（38〜41）はそもそも行き過ぎを持たない。
const OVERSHOOT_NUMBERS = [30, 31, 32, 34, 35, 36];
// 出入りの弾性・戻り（33・37）と跳ね（38〜41）は0以上1以下に収まる。
const WITHIN_RANGE_NUMBERS = [33, 37, 38, 39, 40, 41];

// 端点判定の許容差。採用理由: 数式は端点を t===0/1 のガードと多項式で厳密に0・1へ固定するため、
// 浮動小数の丸めの範囲（1e-9）で一致を要求する。
const ENDPOINT_TOLERANCE = 1e-9;

describe("イージング 番号と名前の解決", () => {
  it("番号1から41がすべて関数を返す", () => {
    for (const n of ALL_NUMBERS) {
      expect(typeof easingByNumber(n)).toBe("function");
    }
  });

  it("範囲外の番号・非整数は例外を投げる", () => {
    expect(() => easingByNumber(0)).toThrow();
    expect(() => easingByNumber(42)).toThrow();
    expect(() => easingByNumber(1.5)).toThrow();
  });

  it("記事が使う代表番号が原典の名前と一致する（付録A.1・A.5）", () => {
    // 番号→名前は付録A.0/A.1の確定対応。代表点で同じ値になることで対応を確認する。
    const cases: ReadonlyArray<[number, EasingName]> = [
      [2, "inSine"],
      [3, "outSine"],
      [22, "inExpo"],
      [23, "outExpo"],
      [26, "inCirc"],
      [27, "outCirc"],
      [31, "outElastic"],
      [34, "inBack"],
      [35, "outBack"],
      [38, "inBounce"],
    ];
    for (const [n, name] of cases) {
      const byNum = easingByNumber(n);
      const byName = easingByName(name);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(byNum(t)).toBeCloseTo(byName(t), 12);
      }
    }
  });

  it("resolveEasing は番号・名前・関数のいずれも受ける", () => {
    expect(resolveEasing(1)(0.4)).toBeCloseTo(0.4, 12); // 直線
    expect(resolveEasing("outExpo")(1)).toBeCloseTo(1, 12);
    const custom = (t: number): number => t * t;
    expect(resolveEasing(custom)(0.5)).toBeCloseTo(0.25, 12);
  });
});

describe("イージング 端点の正しさ（全41番）", () => {
  it("各番号で f(0)=0・f(1)=1（許容差1e-9）", () => {
    for (const n of ALL_NUMBERS) {
      const f = easingByNumber(n);
      expect(Math.abs(f(0) - 0)).toBeLessThanOrEqual(ENDPOINT_TOLERANCE);
      expect(Math.abs(f(1) - 1)).toBeLessThanOrEqual(ENDPOINT_TOLERANCE);
    }
  });

  it("全番号が0から1の掃引で有限値", () => {
    for (const n of ALL_NUMBERS) {
      const f = easingByNumber(n);
      for (let i = 0; i <= 50; i += 1) {
        expect(Number.isFinite(f(i / 50))).toBe(true);
      }
    }
  });
});

describe("イージング 単調性（番号1〜29のみ）", () => {
  it("直線・正弦・二次〜五次・指数・円弧は0から1で単調非減少", () => {
    for (const n of MONOTONIC_NUMBERS) {
      const f = easingByNumber(n);
      let previous = Number.NEGATIVE_INFINITY;
      for (let i = 0; i <= 100; i += 1) {
        const value = f(i / 100);
        // 浮動小数の許容のため微小量を引いて比較する。
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });
});

describe("イージング 行き過ぎ（弾性30〜33・戻り34〜37のみ）", () => {
  it("弾性と戻りは内部で0未満または1超の行き過ぎを持つ", () => {
    for (const n of OVERSHOOT_NUMBERS) {
      const f = easingByNumber(n);
      let exceeded = false;
      for (let i = 0; i <= 200; i += 1) {
        const value = f(i / 200);
        if (value < -1e-6 || value > 1 + 1e-6) {
          exceeded = true;
          break;
        }
      }
      expect(exceeded).toBe(true);
    }
  });

  it("出の戻り(35)は内部で1を超え、入りの戻り(34)は開始付近で約−0.0998まで沈む", () => {
    // 採用理由: 付録A.2より、戻りの係数 c1=1.70158 のとき入りの戻りの最小は約−0.0998。
    let outBackMax = 0;
    let inBackMin = 0;
    for (let i = 0; i <= 200; i += 1) {
      const t = i / 200;
      outBackMax = Math.max(outBackMax, outBack(t));
      inBackMin = Math.min(inBackMin, inBack(t));
    }
    expect(outBackMax).toBeGreaterThan(1);
    expect(inBackMin).toBeLessThan(0);
    expect(inBackMin).toBeCloseTo(-0.0998, 2);
  });
});

describe("イージング 0以上1以下に収まる系統（出入りの弾性・戻り33/37と跳ね38〜41）", () => {
  it("行き過ぎを持たず0以上1以下に収まる", () => {
    for (const n of WITHIN_RANGE_NUMBERS) {
      const f = easingByNumber(n);
      for (let i = 0; i <= 200; i += 1) {
        const value = f(i / 200);
        expect(value).toBeGreaterThanOrEqual(-1e-9);
        expect(value).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe("イージング 出入り合成と重ね掛け", () => {
  it("outIn(out, inn)(0.5) はちょうど0.5", () => {
    expect(outIn(outSine, inSine)(0.5)).toBeCloseTo(0.5, 12);
    expect(outIn(outBounce, inBounce)(0.5)).toBeCloseTo(0.5, 12);
    expect(outIn(outElastic, inElastic)(0.5)).toBeCloseTo(0.5, 12);
  });

  it("composeEasing(outer, inner)(t) は outer(inner(t)) に一致する", () => {
    const composed = composeEasing(outExpo, inCirc);
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      expect(composed(t)).toBeCloseTo(outExpo(inCirc(t)), 12);
    }
  });

  it("直線は恒等、入り出の正弦は中央で0.5", () => {
    expect(linear(0.37)).toBeCloseTo(0.37, 12);
    expect(inOutSine(0.5)).toBeCloseTo(0.5, 12);
  });
});

describe("イージング 用途別の代表挙動", () => {
  it("入りは序盤が遅く、出は終盤が遅い（正弦・指数）", () => {
    // 入りは中央で0.5未満（序盤に遅い）、出は中央で0.5超（終盤に遅い）。
    expect(inSine(0.5)).toBeLessThan(0.5);
    expect(outSine(0.5)).toBeGreaterThan(0.5);
    expect(inExpo(0.5)).toBeLessThan(0.5);
    expect(outExpo(0.5)).toBeGreaterThan(0.5);
    expect(inCirc(0.5)).toBeLessThan(0.5);
    expect(outCirc(0.5)).toBeGreaterThan(0.5);
  });
});
