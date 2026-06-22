import { describe, it, expect } from "vitest";
import { computeDiversityCoefficient } from "./diversityCoefficient";

const factor = { reductionFactor: 0.5 };

describe("computeDiversityCoefficient", () => {
  it("参照なし（両方の前回がない初回）: 1.0", () => {
    const d = computeDiversityCoefficient(
      { currentJustSlot: 3, previousJustSlot: undefined, currentOperationSlot: 3, previousOperationSlot: undefined },
      factor,
    );
    expect(d).toBe(1.0);
  });

  it("前回の片方だけがない（正解スロットの前回がない）: 1.0", () => {
    const d = computeDiversityCoefficient(
      { currentJustSlot: 3, previousJustSlot: undefined, currentOperationSlot: 3, previousOperationSlot: 3 },
      factor,
    );
    expect(d).toBe(1.0);
  });

  it("前回の片方だけがない（操作スロットの前回がない）: 1.0", () => {
    const d = computeDiversityCoefficient(
      { currentJustSlot: 5, previousJustSlot: 3, currentOperationSlot: 3, previousOperationSlot: undefined },
      factor,
    );
    expect(d).toBe(1.0);
  });

  it("JUST変化かつ同操作反復: 逓減量へ下がる", () => {
    const d = computeDiversityCoefficient(
      { currentJustSlot: 5, previousJustSlot: 3, currentOperationSlot: 3, previousOperationSlot: 3 },
      factor,
    );
    expect(d).toBe(0.5);
    expect(d).toBeLessThan(1.0);
  });

  it("JUST変化だが操作も変更: 1.0", () => {
    const d = computeDiversityCoefficient(
      { currentJustSlot: 5, previousJustSlot: 3, currentOperationSlot: 5, previousOperationSlot: 3 },
      factor,
    );
    expect(d).toBe(1.0);
  });

  it("JUST不変かつ同操作反復: 1.0", () => {
    const d = computeDiversityCoefficient(
      { currentJustSlot: 3, previousJustSlot: 3, currentOperationSlot: 3, previousOperationSlot: 3 },
      factor,
    );
    expect(d).toBe(1.0);
  });

  it("JUST不変かつ操作変更: 1.0", () => {
    const d = computeDiversityCoefficient(
      { currentJustSlot: 3, previousJustSlot: 3, currentOperationSlot: 4, previousOperationSlot: 3 },
      factor,
    );
    expect(d).toBe(1.0);
  });

  it("逓減量が範囲外（1.0以上）: 例外を投げる", () => {
    expect(() =>
      computeDiversityCoefficient(
        { currentJustSlot: 5, previousJustSlot: 3, currentOperationSlot: 3, previousOperationSlot: 3 },
        { reductionFactor: 1.0 },
      ),
    ).toThrow();
  });

  it("逓減量が範囲外（負）: 例外を投げる", () => {
    expect(() =>
      computeDiversityCoefficient(
        { currentJustSlot: 5, previousJustSlot: 3, currentOperationSlot: 3, previousOperationSlot: 3 },
        { reductionFactor: -0.1 },
      ),
    ).toThrow();
  });

  it("逓減量が非数: 例外を投げる", () => {
    expect(() =>
      computeDiversityCoefficient(
        { currentJustSlot: 5, previousJustSlot: 3, currentOperationSlot: 3, previousOperationSlot: 3 },
        { reductionFactor: Number.NaN },
      ),
    ).toThrow();
  });

  it("逓減量が正の無限大: 例外を投げる", () => {
    expect(() =>
      computeDiversityCoefficient(
        { currentJustSlot: 5, previousJustSlot: 3, currentOperationSlot: 3, previousOperationSlot: 3 },
        { reductionFactor: Number.POSITIVE_INFINITY },
      ),
    ).toThrow();
  });
});
