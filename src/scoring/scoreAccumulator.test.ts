import { describe, expect, it } from "vitest";
import {
  reduceScore,
  finalizeScore,
  INITIAL_SCORE_STATE,
  type ScoreState,
  type ScoreTapInput,
} from "./scoreAccumulator";

const JUST = { timingJust: true, pitchJust: true };
const MISS = { timingJust: false, pitchJust: false };

// a×D×M の base だけを与え、combo を載せない（非継続）タップ入力。
function baseOnlyTap(a: number, diversity = 1, multiplier = 1): ScoreTapInput {
  return { a, diversity, multiplier, result: MISS };
}
// run を進める入力列を畳み込む補助。
function runTaps(inputs: ScoreTapInput[]): ScoreState {
  return inputs.reduce((state, input) => reduceScore(state, input), INITIAL_SCORE_STATE);
}

describe("reduceScore 合成式 a×D×M（§3.4）— 各要素が独立に反映", () => {
  it("a の合算が総合得点に反映される", () => {
    const state = runTaps([baseOnlyTap(1), baseOnlyTap(1)]);
    expect(finalizeScore(state).total).toBeCloseTo(2, 10);
  });
  it("多様性係数 D を下げると得点が比例して下がる", () => {
    const full = finalizeScore(runTaps([baseOnlyTap(1, 1, 1)])).total;
    const reduced = finalizeScore(runTaps([baseOnlyTap(1, 0.3, 1)])).total;
    expect(reduced).toBeCloseTo(full * 0.3, 10);
  });
  it("投下倍率 M を上げると得点が比例して上がる", () => {
    const base = finalizeScore(runTaps([baseOnlyTap(1, 1, 1)])).total;
    const boosted = finalizeScore(runTaps([baseOnlyTap(1, 1, 2)])).total;
    expect(boosted).toBeCloseTo(base * 2, 10);
  });
  it("多様性係数 D=0（最大逓減）は有効値として得点を0にする", () => {
    expect(finalizeScore(runTaps([baseOnlyTap(1, 0, 1)])).total).toBe(0);
  });
  it("範囲外・非有限の入力を値域へ収める", () => {
    // 非有限の a は床（0）。
    expect(finalizeScore(runTaps([baseOnlyTap(Number.NaN)])).total).toBe(0);
    // 非有限の D・M は無効化（1.0）。a=1・D→1・M→1 で total=1。
    const nonFinite = finalizeScore(
      runTaps([{ a: 1, diversity: Number.NaN, multiplier: Number.POSITIVE_INFINITY, result: MISS }]),
    );
    expect(nonFinite.total).toBeCloseTo(1, 10);
    // 範囲外は端へ。a=2→1・D=5→1・M=9→2 で total=2。
    const overflow = finalizeScore(runTaps([{ a: 2, diversity: 5, multiplier: 9, result: MISS }]));
    expect(overflow.total).toBeCloseTo(2, 10);
    // 負の D は0。a=1・D=-0.3→0 で total=0。
    expect(finalizeScore(runTaps([{ a: 1, diversity: -0.3, multiplier: 1, result: MISS }])).total).toBe(0);
    // 1未満の M は1へ倒れる（M は1未満にならない規約）。a=1・D=1・M=-3→1 で total=1。
    expect(finalizeScore(runTaps([{ a: 1, diversity: 1, multiplier: -3, result: MISS }])).total).toBeCloseTo(1, 10);
  });
});

describe("combo が独立加点として反映され、途切れる", () => {
  it("両JUST3連で combo が積まれる（run 1,2,3 → 0+0.05+0.10）", () => {
    const state = runTaps([
      { a: 1, diversity: 1, multiplier: 1, result: JUST },
      { a: 1, diversity: 1, multiplier: 1, result: JUST },
      { a: 1, diversity: 1, multiplier: 1, result: JUST },
    ]);
    const s = finalizeScore(state);
    expect(s.baseTotal).toBeCloseTo(3, 10);
    expect(s.comboRawTotal).toBeCloseTo(0.15, 10);
    expect(s.comboEffective).toBeCloseTo(0.15, 10); // base総和3に対し上限 3×(0.1/0.9)=0.333 未満なので縮約されない
    expect(s.total).toBeCloseTo(3.15, 10);
  });
  it("非継続タップで走長が0へ戻り combo が再スタートする", () => {
    const state = runTaps([
      { a: 1, diversity: 1, multiplier: 1, result: JUST }, // run1
      { a: 1, diversity: 1, multiplier: 1, result: JUST }, // run2 → +0.05
      { a: 1, diversity: 1, multiplier: 1, result: MISS }, // 途切れ run0
      { a: 1, diversity: 1, multiplier: 1, result: JUST }, // run1 → +0
    ]);
    expect(finalizeScore(state).comboRawTotal).toBeCloseTo(0.05, 10);
  });
});

describe("combo ≤10% の担保（受け入れ基準）", () => {
  it("base が小さく combo が巨大な最悪ケースでも comboShare ≤ 0.10", () => {
    // 100タップ全て両JUST、base は各 0.001。素の combo 総和は巨大になるが、再正規化で頭打ちになる。
    const inputs: ScoreTapInput[] = Array.from({ length: 100 }, () => ({
      a: 0.001,
      diversity: 1,
      multiplier: 1,
      result: JUST,
    }));
    const s = finalizeScore(runTaps(inputs));
    expect(s.comboShare).toBeLessThanOrEqual(0.1 + 1e-9);
    // ちょうど上限に張り付くことの代数確認: comboEffective/(base+comboEffective) = 0.10
    expect(s.comboEffective / s.total).toBeCloseTo(0.1, 10);
  });
  it("baseが0（全床タップ）なら total=0・comboShare=0（0除算なし）", () => {
    const s = finalizeScore(runTaps([baseOnlyTap(0), baseOnlyTap(0)]));
    expect(s.total).toBe(0);
    expect(s.comboShare).toBe(0);
  });
  it("多様性係数D=0かつ両JUST連続で comboRaw>0 でも comboEffective=0・comboShare=0", () => {
    // D=0 で base が全タップ0、かつ両JUST連続なので素の combo は積まれる。
    // 上限 baseTotal×(0.1/0.9)=0 のため comboEffective=0 となり、床のプレイで combo が得点を支配しない。
    const inputs: ScoreTapInput[] = Array.from({ length: 20 }, () => ({
      a: 1,
      diversity: 0,
      multiplier: 1,
      result: JUST,
    }));
    const s = finalizeScore(runTaps(inputs));
    expect(s.baseTotal).toBe(0);
    expect(s.comboRawTotal).toBeGreaterThan(0);
    expect(s.comboEffective).toBe(0);
    expect(s.total).toBe(0);
    expect(s.comboShare).toBe(0);
  });
});

describe("純粋性・初期状態", () => {
  it("reduceScore は引数 state を変更しない", () => {
    const before = { ...INITIAL_SCORE_STATE };
    reduceScore(INITIAL_SCORE_STATE, baseOnlyTap(1));
    expect(INITIAL_SCORE_STATE).toEqual(before);
  });
  it("初期状態を確定すると total=0", () => {
    expect(finalizeScore(INITIAL_SCORE_STATE).total).toBe(0);
  });
});
