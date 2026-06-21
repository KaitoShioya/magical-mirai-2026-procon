import { describe, expect, it } from "vitest";
import { createButterflyGeometry } from "./butterflyGeometry";
import { BUTTERFLY_CURVE_SAMPLES } from "../constants";

// BufferGeometry は WebGL を必要とせず node で構築でき、属性配列を読み戻せる。
// 本テストは描画器には触れず、蝶曲線から作る頂点属性・索引・左右の翅の有無を検証する。

describe("createButterflyGeometry の頂点数と索引", () => {
  it("頂点数は 胴中心1点＋曲線サンプル数（既定）", () => {
    const geometry = createButterflyGeometry();
    expect(geometry.getAttribute("position").count).toBe(BUTTERFLY_CURVE_SAMPLES + 1);
  });

  it("サンプル数を変えると頂点数が式どおり変化する", () => {
    const geometry = createButterflyGeometry({ curveSamples: 60 });
    expect(geometry.getAttribute("position").count).toBe(60 + 1);
  });

  it("索引の数は 三角形数×3（扇の三角形数＝サンプル数）", () => {
    const samples = 60;
    const geometry = createButterflyGeometry({ curveSamples: samples });
    expect(geometry.getIndex()).not.toBeNull();
    expect(geometry.getIndex()!.count).toBe(samples * 3);
  });

  it("3未満のサンプル数・非整数・非有限の二面角は例外", () => {
    expect(() => createButterflyGeometry({ curveSamples: 2 })).toThrow();
    expect(() => createButterflyGeometry({ curveSamples: 10.5 })).toThrow();
    expect(() => createButterflyGeometry({ dihedralRadians: Number.NaN })).toThrow();
  });
});

describe("createButterflyGeometry の羽ばたき用頂点属性", () => {
  it("胴中心の頂点は原点・符号0・span0", () => {
    const geometry = createButterflyGeometry({ curveSamples: 60 });
    const position = geometry.getAttribute("position").array;
    const sign = geometry.getAttribute("aBflyWingSign").array;
    const span = geometry.getAttribute("aBflyWingSpan").array;
    expect(position[0]).toBe(0);
    expect(position[1]).toBe(0);
    expect(position[2]).toBe(0);
    expect(sign[0]).toBe(0);
    expect(span[0]).toBe(0);
  });

  it("aBflyWingSign は -1・0・+1 のみ", () => {
    const geometry = createButterflyGeometry({ curveSamples: 120 });
    const sign = geometry.getAttribute("aBflyWingSign").array;
    for (let i = 0; i < sign.length; i += 1) {
      expect([-1, 0, 1]).toContain(sign[i]);
    }
  });

  it("左右の翅がそろう（符号+1と-1がともに存在する）", () => {
    const geometry = createButterflyGeometry({ curveSamples: 120 });
    const sign = geometry.getAttribute("aBflyWingSign").array;
    let hasRight = false;
    let hasLeft = false;
    for (let i = 0; i < sign.length; i += 1) {
      if (sign[i] === 1) hasRight = true;
      if (sign[i] === -1) hasLeft = true;
    }
    expect(hasRight).toBe(true);
    expect(hasLeft).toBe(true);
  });

  it("aBflyWingSpan は0以上1以下で、翅端は1に達する", () => {
    const geometry = createButterflyGeometry({ curveSamples: 120 });
    const span = geometry.getAttribute("aBflyWingSpan").array;
    let maxSpan = 0;
    for (let i = 0; i < span.length; i += 1) {
      expect(span[i]).toBeGreaterThanOrEqual(0);
      expect(span[i]).toBeLessThanOrEqual(1);
      maxSpan = Math.max(maxSpan, span[i] as number);
    }
    expect(maxSpan).toBeCloseTo(1, 5);
  });
});

describe("createButterflyGeometry の形", () => {
  it("左右に広がる（x の最大正と最大負がともに存在し、概ね対称）", () => {
    const geometry = createButterflyGeometry({ curveSamples: 720, dihedralRadians: 0 });
    const position = geometry.getAttribute("position").array;
    let maxX = 0;
    let minX = 0;
    for (let i = 0; i < position.length; i += 3) {
      maxX = Math.max(maxX, position[i] as number);
      minX = Math.min(minX, position[i] as number);
    }
    expect(maxX).toBeGreaterThan(0);
    expect(minX).toBeLessThan(0);
    // 蝶曲線は支配項が左右対称のため、右端と左端の広がりは近い（sin^5(t/12)項による微小な非対称を許容）。
    // 採用理由を先に述べる。完全一致を求めると本物の蝶曲線の微小な非対称で落ちるため、右端と左端の差が
    // 右端の15パーセント以内であることを左右対称の代理基準とする。
    expect(Math.abs(maxX + minX)).toBeLessThan(maxX * 0.15);
  });

  it("二面角0なら平面（z=0）、正なら z 方向の奥行きが出る", () => {
    const flat = createButterflyGeometry({ curveSamples: 120, dihedralRadians: 0 });
    const flatPos = flat.getAttribute("position").array;
    for (let i = 0; i < flatPos.length; i += 3) {
      expect(flatPos[i + 2]).toBeCloseTo(0, 5);
    }
    const folded = createButterflyGeometry({ curveSamples: 120, dihedralRadians: 0.3 });
    const foldedPos = folded.getAttribute("position").array;
    let maxAbsZ = 0;
    for (let i = 0; i < foldedPos.length; i += 3) {
      maxAbsZ = Math.max(maxAbsZ, Math.abs(foldedPos[i + 2] as number));
    }
    expect(maxAbsZ).toBeGreaterThan(0);
  });
});
