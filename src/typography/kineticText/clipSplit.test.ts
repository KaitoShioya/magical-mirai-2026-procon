// 部首分解・縦横ブラインドの矩形計算の検証。相補的な矩形が重なりなく境界を覆うことを表明する。

import { describe, it, expect } from "vitest";
import { computeSplitRects, computeBlindRects, type ClipRect } from "./clipSplit";

const bounds: ClipRect = { minX: -1, minY: -2, maxX: 3, maxY: 2 };

describe("部首分解の2分割", () => {
  it("左右に割ると2矩形が分割線で接し、重なりなく境界を覆う", () => {
    const [left, right] = computeSplitRects(bounds, "x", 0.25);
    const splitX = -1 + (3 - -1) * 0.25; // = 0
    expect(left).toEqual({ minX: -1, minY: -2, maxX: splitX, maxY: 2 });
    expect(right).toEqual({ minX: splitX, minY: -2, maxX: 3, maxY: 2 });
    // 左の右端と右の左端が一致（重なりも隙間も無い）。境界の縦範囲は両方とも全体。
    expect(left.maxX).toBe(right.minX);
  });

  it("上下に割ると2矩形が分割線で接する", () => {
    const [bottom, top] = computeSplitRects(bounds, "y", 0.5);
    const splitY = -2 + (2 - -2) * 0.5; // = 0
    expect(bottom.maxY).toBe(top.minY);
    expect(bottom).toEqual({ minX: -1, minY: -2, maxX: 3, maxY: splitY });
    expect(top).toEqual({ minX: -1, minY: splitY, maxX: 3, maxY: 2 });
  });

  it("割合は0以上1以下に制限される", () => {
    const [a] = computeSplitRects(bounds, "x", 2);
    expect(a.maxX).toBe(bounds.maxX); // 1へ制限され右端いっぱい
  });
});

describe("縦横ブラインドのN分割", () => {
  it("N本の縞が等幅で隣り合い、重なりなく境界を覆う", () => {
    const rects = computeBlindRects(bounds, "x", 4);
    expect(rects).toHaveLength(4);
    for (let i = 1; i < rects.length; i += 1) {
      // 直前の縞の右端と次の縞の左端が一致する。
      expect(rects[i].minX).toBeCloseTo(rects[i - 1].maxX, 9);
    }
    expect(rects[0].minX).toBe(bounds.minX);
    expect(rects[rects.length - 1].maxX).toBeCloseTo(bounds.maxX, 9);
  });

  it("slices が1以上の整数へ丸められる（0や負は1本になる）", () => {
    expect(computeBlindRects(bounds, "y", 0)).toHaveLength(1);
    expect(computeBlindRects(bounds, "y", 3.7)).toHaveLength(3);
  });
});
