import { describe, expect, it } from "vitest";
import { GAUGE_BOTH_JUST_MULTIPLIER } from "../config/tuning";
import {
  DEFAULT_GAUGE_CONFIG,
  gaugeGain,
  accumulateGauge,
  deploymentMultiplier,
  deploy,
} from "./gauge";
import type { JudgmentResult } from "./types";

// 判定結果のひな型を組み立てる補助。timingJust・pitchJust・isFloor だけがゲージに関係するため、
// それ以外の出力（boundNoteId・centeredDiffMs・各精度）は既定の床値で埋める。
function result(part: Partial<JudgmentResult>): JudgmentResult {
  return {
    boundNoteId: null,
    isFloor: false,
    centeredDiffMs: 0,
    timingAccuracy: 0,
    pitchAccuracy: 0,
    timingJust: false,
    pitchJust: false,
    ...part,
  };
}

const PARTIAL_JUST = result({ timingJust: true, pitchJust: false });
const BOTH_JUST = result({ timingJust: true, pitchJust: true });

describe("gaugeGain 蓄積量（§3.6）", () => {
  it("片JUST（一方だけ真）で基本量を返す", () => {
    expect(gaugeGain(result({ timingJust: true, pitchJust: false }))).toBe(DEFAULT_GAUGE_CONFIG.baseAmount);
    expect(gaugeGain(result({ timingJust: false, pitchJust: true }))).toBe(DEFAULT_GAUGE_CONFIG.baseAmount);
  });

  it("両JUST（両方真）で基本量の bothJustMultiplier 倍を返す", () => {
    expect(gaugeGain(BOTH_JUST)).toBe(DEFAULT_GAUGE_CONFIG.baseAmount * GAUGE_BOTH_JUST_MULTIPLIER);
  });

  it("両軸を外したタップ（isFloor 偽かつ両JUST偽）で0を返す", () => {
    expect(gaugeGain(result({ isFloor: false, timingJust: false, pitchJust: false }))).toBe(0);
  });

  it("床のタップ（isFloor 真）で0を返す", () => {
    // 両軸外しとは別ケースとして検証する。実装はどちらも0だが、isFloor の有無で挙動が分かれないことを独立に確かめる。
    expect(gaugeGain(result({ isFloor: true, timingJust: false, pitchJust: false }))).toBe(0);
  });
});

describe("accumulateGauge 満タン（受け入れ基準1）", () => {
  // 受け入れ基準「50タップで満タン」は基本量1のタップ、すなわち片JUSTを50回の意味である。
  // 両JUSTは1回で2加算されるため25回で満タンに達する。
  it("片JUSTを50回合成でちょうど満タンになる", () => {
    let gauge = 0;
    for (let i = 0; i < 50; i += 1) {
      gauge = accumulateGauge(gauge, PARTIAL_JUST);
    }
    expect(gauge).toBe(DEFAULT_GAUGE_CONFIG.fullCapacity);
  });

  it("両JUSTを25回合成でもちょうど満タンになる（加算量2倍の確認）", () => {
    let gauge = 0;
    for (let i = 0; i < 25; i += 1) {
      gauge = accumulateGauge(gauge, BOTH_JUST);
    }
    expect(gauge).toBe(DEFAULT_GAUGE_CONFIG.fullCapacity);
  });

  it("満タン到達後の片JUSTは頭打ちで満タンを超えない", () => {
    let gauge = 0;
    for (let i = 0; i < 51; i += 1) {
      gauge = accumulateGauge(gauge, PARTIAL_JUST);
    }
    expect(gauge).toBe(DEFAULT_GAUGE_CONFIG.fullCapacity);
  });
});

describe("deploymentMultiplier 倍率（受け入れ基準2、§3.4）", () => {
  it("代表値で M = 1 + 消費割合×見せ場重み", () => {
    // 未投下相当（消費割合0）は基準値1.0。
    expect(deploymentMultiplier(0, 1.0)).toBe(1.0);
    // 満タン消費（割合1.0）× climax 重み1.0 で最大2.0。
    expect(deploymentMultiplier(1.0, 1.0)).toBe(2.0);
    // 半分消費（0.5）× climax 重み1.0 で1.5。
    expect(deploymentMultiplier(0.5, 1.0)).toBe(1.5);
    // 満タン消費 × 非climax 重み0.4 で1.4。実装と同じ演算式で比較し、許容誤差に依存せず厳密一致を検証する。
    expect(deploymentMultiplier(1.0, 0.4)).toBe(1 + 1.0 * 0.4);
  });
});

describe("deploy 投下（§3.6、§8）", () => {
  it("現在ゲージを全消費し、消費割合と倍率と残量を返す", () => {
    const r = deploy(DEFAULT_GAUGE_CONFIG.fullCapacity, 1.0);
    expect(r.consumedAmount).toBe(DEFAULT_GAUGE_CONFIG.fullCapacity);
    expect(r.consumedRatio).toBe(1.0);
    expect(r.multiplier).toBe(2.0);
    expect(r.remaining).toBe(0);
  });

  it("消費割合は消費量÷満タン容量である", () => {
    const half = DEFAULT_GAUGE_CONFIG.fullCapacity / 2;
    const r = deploy(half, 1.0);
    expect(r.consumedRatio).toBe(0.5);
    expect(r.multiplier).toBe(1.5);
  });

  it("空ゲージの投下は消費0・倍率1.0の無操作", () => {
    const r = deploy(0, 1.0);
    expect(r.consumedAmount).toBe(0);
    expect(r.consumedRatio).toBe(0);
    expect(r.multiplier).toBe(1.0);
    expect(r.remaining).toBe(0);
  });

  it("deploy が返す multiplier は deploymentMultiplier(消費割合, 見せ場重み) と等値", () => {
    // 受け入れ基準「倍率が正確」を、実利用経路である deploy 側でも直接担保する。
    const weight = 0.7;
    const r = deploy(DEFAULT_GAUGE_CONFIG.fullCapacity * 0.6, weight);
    expect(r.multiplier).toBe(deploymentMultiplier(r.consumedRatio, weight));
  });
});

describe("投下5回分（蓄積と投下の合成シナリオ）", () => {
  it("片JUST10回ごとに投下する操作を5サイクルで計50タップ・5投下が成立する", () => {
    const oneFifth = DEFAULT_GAUGE_CONFIG.fullCapacity / 5; // 満タン50の1/5＝10単位。
    let gauge = 0;
    let taps = 0;
    let deployCount = 0;
    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (let i = 0; i < 10; i += 1) {
        gauge = accumulateGauge(gauge, PARTIAL_JUST);
        taps += 1;
      }
      expect(gauge).toBe(oneFifth);
      const r = deploy(gauge, 1.0);
      expect(r.consumedRatio).toBeCloseTo(0.2, 10);
      expect(r.remaining).toBe(0);
      gauge = r.remaining; // 残量0を次サイクルの起点にする。
      deployCount += 1;
    }
    expect(taps).toBe(50);
    expect(deployCount).toBe(5);
  });
});

describe("異常値・境界の扱い（既存scoring慣行の踏襲）", () => {
  it("非有限の currentValue は例外を投げず0を起点に加算する", () => {
    expect(accumulateGauge(Number.NaN, PARTIAL_JUST)).toBe(DEFAULT_GAUGE_CONFIG.baseAmount);
    expect(accumulateGauge(Number.POSITIVE_INFINITY, PARTIAL_JUST)).toBe(DEFAULT_GAUGE_CONFIG.baseAmount);
  });

  it("ゲージ量が [0, fullCapacity] へ切り詰められる", () => {
    // 負の現在値に加算した結果が負なら床の0へ切り詰める（-10 + 基本量1 = -9 → 0）。
    expect(accumulateGauge(-10, PARTIAL_JUST)).toBe(0);
    // 満タン超過の入力は満タンで頭打ち（床タップは加算0、満タンを超えない）。
    const over = result({ isFloor: true });
    expect(accumulateGauge(DEFAULT_GAUGE_CONFIG.fullCapacity + 100, over)).toBe(DEFAULT_GAUGE_CONFIG.fullCapacity);
  });

  it("縮退した fullCapacity（0以下）で deploy が無操作になり0除算を起こさない", () => {
    const degenerate = { fullCapacity: 0, baseAmount: 1, bothJustMultiplier: 2 };
    const r = deploy(10, 1.0, degenerate);
    expect(r.consumedAmount).toBe(0);
    expect(r.consumedRatio).toBe(0);
    expect(r.multiplier).toBe(1.0);
    expect(Number.isFinite(r.multiplier)).toBe(true);
    // 縮退容量では蓄積もゲージ量を0に保つ。
    expect(accumulateGauge(10, PARTIAL_JUST, degenerate)).toBe(0);
  });

  it("deploymentMultiplier は範囲外の引数でも倍率を [1.0, 2.0] に収める", () => {
    // 負値は0へ、1超の見せ場重みは1へ切り詰める。
    expect(deploymentMultiplier(-1, 1.0)).toBe(1.0);
    expect(deploymentMultiplier(1.0, 5)).toBe(2.0);
    expect(deploymentMultiplier(Number.NaN, 1.0)).toBe(1.0);
  });

  it("非有限の fullCapacity（無限大）で accumulateGauge と deploy が無操作になる", () => {
    // finiteCapacity が無限大を0へ退避し、容量0以下の分岐で無操作になる。
    const infinite = { fullCapacity: Number.POSITIVE_INFINITY, baseAmount: 1, bothJustMultiplier: 2 };
    expect(accumulateGauge(10, PARTIAL_JUST, infinite)).toBe(0);
    const r = deploy(10, 1.0, infinite);
    expect(r.consumedAmount).toBe(0);
    expect(r.consumedRatio).toBe(0);
    expect(r.multiplier).toBe(1.0);
  });

  it("負の fullCapacity で accumulateGauge と deploy が無操作になる", () => {
    // 容量0以下の分岐を通り、蓄積も投下もゲージへ作用しない。
    const negative = { fullCapacity: -10, baseAmount: 1, bothJustMultiplier: 2 };
    expect(accumulateGauge(5, PARTIAL_JUST, negative)).toBe(0);
    const r = deploy(5, 1.0, negative);
    expect(r.consumedAmount).toBe(0);
    expect(r.multiplier).toBe(1.0);
  });

  it("deploy に非有限の currentValue を渡すと消費0・倍率1.0になる", () => {
    // current が0へ読み替えられ、消費割合0で倍率は基準値1.0。
    for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = deploy(nonFinite, 1.0);
      expect(r.consumedAmount).toBe(0);
      expect(r.consumedRatio).toBe(0);
      expect(r.multiplier).toBe(1.0);
    }
  });

  it("deploy に満タン超過の currentValue を渡すと満タン容量で切り詰める", () => {
    // 消費量は満タンへ切り詰められ、消費割合は1.0で倍率は最大の2.0になる。
    const r = deploy(DEFAULT_GAUGE_CONFIG.fullCapacity + 100, 1.0);
    expect(r.consumedAmount).toBe(DEFAULT_GAUGE_CONFIG.fullCapacity);
    expect(r.consumedRatio).toBe(1.0);
    expect(r.multiplier).toBe(2.0);
  });
});
