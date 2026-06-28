import { describe, expect, it } from "vitest";
import { createSunflowerRingPlacement } from "./sunflowerRingPlacement";

// 純粋・決定的な状態機械のため、node で位置を読み戻して検証する。中心を原点にして半径を距離で測る。

function radiusOf(p: { x: number; z: number }): number {
  return Math.sqrt(p.x * p.x + p.z * p.z);
}

const baseOptions = {
  centerX: 0,
  centerZ: 0,
  radiusMin: 2,
  radiusMax: 12,
  ringCount: 2,
  minSpacing: 2,
} as const;

describe("createSunflowerRingPlacement", () => {
  it("反応が正確なほど中心に近い半径へ置く（精度1は最内帯、精度0は最外帯）", () => {
    const accurate = createSunflowerRingPlacement({ ...baseOptions });
    const inaccurate = createSunflowerRingPlacement({ ...baseOptions });
    const near = radiusOf(accurate.place(1));
    const far = radiusOf(inaccurate.place(0));
    // 最内帯は [2,7)、最外帯は [7,12)。精度1は7未満、精度0は7以上になる。
    expect(near).toBeLessThan(7);
    expect(far).toBeGreaterThanOrEqual(7);
    expect(far).toBeGreaterThan(near);
  });

  it("中心と最大半径の範囲に収まる（通常配置）", () => {
    const ring = createSunflowerRingPlacement({ ...baseOptions });
    for (let i = 0; i < 10; i += 1) {
      const r = radiusOf(ring.place(0.5));
      expect(r).toBeGreaterThanOrEqual(baseOptions.radiusMin - 1e-9);
      expect(r).toBeLessThan(baseOptions.radiusMax);
    }
  });

  it("帯が満杯になると、その外側の帯へ送られる（最内帯の上限を超えた配置は半径が外帯へ移る）", () => {
    const ring = createSunflowerRingPlacement({ ...baseOptions });
    const cap0 = ring.ringCapacities()[0];
    // 最内帯の上限ぶんは半径が最内帯 [2,7) に収まる。
    for (let i = 0; i < cap0; i += 1) {
      const r = radiusOf(ring.place(1));
      expect(r).toBeLessThan(7);
    }
    // 上限を超えた次の配置は外帯 [7,12) へ送られる（半径が7以上）。
    const overflow = radiusOf(ring.place(1));
    expect(overflow).toBeGreaterThanOrEqual(7);
  });

  it("reset で配置状態が戻る（reset 後の精度1は再び最内帯に置ける）", () => {
    const ring = createSunflowerRingPlacement({ ...baseOptions });
    const cap0 = ring.ringCapacities()[0];
    for (let i = 0; i < cap0; i += 1) {
      ring.place(1);
    }
    ring.reset();
    const r = radiusOf(ring.place(1));
    expect(r).toBeLessThan(7);
  });

  it("不正な設定は例外", () => {
    expect(() => createSunflowerRingPlacement({ ...baseOptions, ringCount: 0 })).toThrow();
    expect(() => createSunflowerRingPlacement({ ...baseOptions, radiusMin: 12, radiusMax: 2 })).toThrow();
    expect(() => createSunflowerRingPlacement({ ...baseOptions, minSpacing: 0 })).toThrow();
  });
});
