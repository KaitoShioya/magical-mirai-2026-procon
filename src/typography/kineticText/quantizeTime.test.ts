// コマ落ちの時刻量子化の検証。

import { describe, it, expect } from "vitest";
import { quantizeTimeMs } from "./quantizeTime";

describe("時刻量子化（コマ落ち）", () => {
  it("一定刻みへ最も近い格子に丸める", () => {
    expect(quantizeTimeMs(0, 100)).toBe(0);
    expect(quantizeTimeMs(149, 100)).toBe(100);
    expect(quantizeTimeMs(151, 100)).toBe(200);
    expect(quantizeTimeMs(1000, 100)).toBe(1000);
  });

  it("刻みが0以下なら丸めず元の時刻を返す（0除算を避ける）", () => {
    expect(quantizeTimeMs(137, 0)).toBe(137);
    expect(quantizeTimeMs(137, -5)).toBe(137);
  });

  it("同じ格子に入る時刻は同じ値へ丸まる（カクつきの成立）", () => {
    expect(quantizeTimeMs(820, 100)).toBe(quantizeTimeMs(849, 100));
    expect(quantizeTimeMs(820, 100)).not.toBe(quantizeTimeMs(851, 100));
  });
});
