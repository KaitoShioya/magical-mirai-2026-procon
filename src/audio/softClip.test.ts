import { describe, it, expect } from "vitest";
import { softClipValue, generateSoftClipCurve } from "./softClip";

const KNEE = 0.7;
const CEILING = 0.99;
// Float32Array は単精度のため、倍精度で計算した期待値との差は単精度の分解能（約1000万分の1）程度になる。
// その分解能を吸収する許容として100万分の1（1e-6）を用いる。
const FLOAT32_TOLERANCE = 1e-6;

describe("softClipValue", () => {
  it("膝より小さい絶対値の入力はそのまま返す（恒等、音量を変えない）", () => {
    expect(softClipValue(0, KNEE, CEILING)).toBe(0);
    expect(softClipValue(0.28, KNEE, CEILING)).toBe(0.28);
    expect(softClipValue(-0.5, KNEE, CEILING)).toBe(-0.5);
    expect(softClipValue(KNEE, KNEE, CEILING)).toBe(KNEE);
  });

  it("膝より大きい入力は天井へ向けて抑える", () => {
    // 入力1.0での出力は 膝 + (天井-膝)×tanh(1)。
    const expectedAtOne = KNEE + (CEILING - KNEE) * Math.tanh(1);
    expect(Math.abs(softClipValue(1, KNEE, CEILING) - expectedAtOne)).toBeLessThanOrEqual(1e-12);
    expect(softClipValue(1, KNEE, CEILING)).toBeLessThan(CEILING);
  });

  it("1.0を大きく超える入力でも出力の絶対値が天井（1.0未満）以下に収まる", () => {
    expect(softClipValue(2, KNEE, CEILING)).toBeLessThanOrEqual(CEILING);
    expect(softClipValue(100, KNEE, CEILING)).toBeLessThanOrEqual(CEILING);
    expect(softClipValue(-100, KNEE, CEILING)).toBeGreaterThanOrEqual(-CEILING);
    expect(CEILING).toBeLessThan(1);
  });

  it("符号について対称である", () => {
    expect(softClipValue(-0.9, KNEE, CEILING)).toBe(-softClipValue(0.9, KNEE, CEILING));
  });
});

describe("generateSoftClipCurve", () => {
  const SAMPLE_COUNT = 2048;

  it("要素数が指定どおりで、両端が入力−1・+1に対応する", () => {
    const curve = generateSoftClipCurve(SAMPLE_COUNT, KNEE, CEILING);
    expect(curve.length).toBe(SAMPLE_COUNT);
    expect(Math.abs(curve[0] - softClipValue(-1, KNEE, CEILING))).toBeLessThanOrEqual(
      FLOAT32_TOLERANCE
    );
    expect(Math.abs(curve[SAMPLE_COUNT - 1] - softClipValue(1, KNEE, CEILING))).toBeLessThanOrEqual(
      FLOAT32_TOLERANCE
    );
  });

  it("全ての要素の絶対値が1.0未満である（出力がクリップしない）", () => {
    const curve = generateSoftClipCurve(SAMPLE_COUNT, KNEE, CEILING);
    for (let i = 0; i < curve.length; i += 1) {
      expect(Math.abs(curve[i])).toBeLessThan(1);
    }
  });

  it("単調に増加する（入力が増えると出力も増える）", () => {
    const curve = generateSoftClipCurve(SAMPLE_COUNT, KNEE, CEILING);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it("要素数が2未満でも2以上に丸めて例外を出さない", () => {
    const curve = generateSoftClipCurve(1, KNEE, CEILING);
    expect(curve.length).toBeGreaterThanOrEqual(2);
  });
});
