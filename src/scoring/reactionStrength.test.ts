import { describe, expect, it } from "vitest";
import { reactionStrength } from "./reactionStrength";
import { reactionStrength as reactionStrengthFromIndex } from "./index";
import type { JudgmentResult } from "./types";

// テスト用の JudgmentResult を組み立てる小さなヘルパ。各ケースで該当する精度だけを変える。
// 反応強度は timingAccuracy と pitchAccuracy だけを読むため、他の要素は判定の意味を保つ既定値で埋める。
function makeJudgment(timingAccuracy: number, pitchAccuracy: number): JudgmentResult {
  return {
    boundNoteId: "note",
    isFloor: false,
    centeredDiffMs: 0,
    timingAccuracy,
    pitchAccuracy,
    timingJust: false,
    pitchJust: false,
  };
}

describe("reactionStrength 境界値", () => {
  it("タイミング精度0で大きさ0、1で大きさ1", () => {
    expect(reactionStrength(makeJudgment(0, 1)).size).toBe(0);
    expect(reactionStrength(makeJudgment(1, 1)).size).toBe(1);
  });

  it("音程精度0で明るさ0、1で明るさ1", () => {
    expect(reactionStrength(makeJudgment(1, 0)).brightness).toBe(0);
    expect(reactionStrength(makeJudgment(1, 1)).brightness).toBe(1);
  });
});

describe("reactionStrength 恒等写像", () => {
  // 任意の中間値が精度と完全一致することを固定する。
  // 採用理由を先に述べる。境界値（0と1）だけでは、内部に係数や非線形の変換が混入しても両端が一致すれば見逃しうる。
  // 中間値の完全一致を要求すると、恒等写像でない変換が入った時点で失敗するため、将来の係数混入を検知できる。
  it("中間値の精度がそのまま強度になる", () => {
    const result = reactionStrength(makeJudgment(0.7, 0.6));
    expect(result.size).toBe(0.7);
    expect(result.brightness).toBe(0.6);
  });
});

describe("reactionStrength 単調増加", () => {
  it("タイミング精度を増やすと大きさが減らない", () => {
    const low = reactionStrength(makeJudgment(0.2, 0.5)).size;
    const mid = reactionStrength(makeJudgment(0.5, 0.5)).size;
    const high = reactionStrength(makeJudgment(0.9, 0.5)).size;
    expect(mid).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(mid);
  });

  it("音程精度を増やすと明るさが減らない", () => {
    const low = reactionStrength(makeJudgment(0.5, 0.2)).brightness;
    const mid = reactionStrength(makeJudgment(0.5, 0.5)).brightness;
    const high = reactionStrength(makeJudgment(0.5, 0.9)).brightness;
    expect(mid).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(mid);
  });
});

describe("reactionStrength チャンネル独立", () => {
  it("タイミング精度だけを変えても明るさが変わらない", () => {
    const a = reactionStrength(makeJudgment(0.1, 0.6)).brightness;
    const b = reactionStrength(makeJudgment(0.9, 0.6)).brightness;
    expect(a).toBe(b);
  });

  it("音程精度だけを変えても大きさが変わらない", () => {
    const a = reactionStrength(makeJudgment(0.6, 0.1)).size;
    const b = reactionStrength(makeJudgment(0.6, 0.9)).size;
    expect(a).toBe(b);
  });
});

describe("reactionStrength 音程精度の3状態を区別して通す", () => {
  it("床0・外し音0.2・完全一致1.0をそのまま明るさへ写し、大小関係を保つ", () => {
    const floor = reactionStrength(makeJudgment(0.5, 0)).brightness;
    const miss = reactionStrength(makeJudgment(0.5, 0.2)).brightness;
    const just = reactionStrength(makeJudgment(0.5, 1)).brightness;
    expect(floor).toBe(0);
    expect(miss).toBe(0.2);
    expect(just).toBe(1);
    expect(floor).toBeLessThan(miss);
    expect(miss).toBeLessThan(just);
  });
});

describe("reactionStrength 範囲外入力の丸め", () => {
  it("0未満は0、1超は1へ丸める", () => {
    expect(reactionStrength(makeJudgment(-0.5, 2)).size).toBe(0);
    expect(reactionStrength(makeJudgment(2, -0.5)).size).toBe(1);
    expect(reactionStrength(makeJudgment(2, -0.5)).brightness).toBe(0);
    expect(reactionStrength(makeJudgment(-0.5, 2)).brightness).toBe(1);
  });
});

describe("reactionStrength 非有限値は0へ倒し例外を投げない", () => {
  it("大きさ（タイミング精度経由）で非数・正の無限大・負の無限大が0", () => {
    expect(reactionStrength(makeJudgment(Number.NaN, 0.5)).size).toBe(0);
    expect(reactionStrength(makeJudgment(Number.POSITIVE_INFINITY, 0.5)).size).toBe(0);
    expect(reactionStrength(makeJudgment(Number.NEGATIVE_INFINITY, 0.5)).size).toBe(0);
  });

  it("明るさ（音程精度経由）で非数・正の無限大・負の無限大が0", () => {
    expect(reactionStrength(makeJudgment(0.5, Number.NaN)).brightness).toBe(0);
    expect(reactionStrength(makeJudgment(0.5, Number.POSITIVE_INFINITY)).brightness).toBe(0);
    expect(reactionStrength(makeJudgment(0.5, Number.NEGATIVE_INFINITY)).brightness).toBe(0);
  });
});

describe("reactionStrength 公開窓口からの再輸出", () => {
  it("index.ts 経由で取得した関数が同じ結果を返す", () => {
    const judgment = makeJudgment(0.7, 0.2);
    expect(reactionStrengthFromIndex(judgment)).toEqual(reactionStrength(judgment));
  });
});
