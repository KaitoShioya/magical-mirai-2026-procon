import { describe, expect, it } from "vitest";
import {
  clamp01,
  inputSourceFromPointerType,
  mapToReactionCore,
  normalizePointerPosition,
  slotIndexFromNormalizedX,
} from "./coordinateMapping";
import { laneCenterNormalizedX } from "../utils/pitchHudLayout";

describe("clamp01", () => {
  it("範囲内の値はそのまま返す", () => {
    expect(clamp01(0.3, 0.5)).toBe(0.3);
    expect(clamp01(0, 0.5)).toBe(0);
    expect(clamp01(1, 0.5)).toBe(1);
  });
  it("範囲外は端へ丸める", () => {
    expect(clamp01(-1, 0.5)).toBe(0);
    expect(clamp01(2, 0.5)).toBe(1);
  });
  it("非有限値は予備値を返す", () => {
    expect(clamp01(Number.NaN, 0.5)).toBe(0.5);
    expect(clamp01(Number.POSITIVE_INFINITY, 0.5)).toBe(0.5);
  });
});

describe("normalizePointerPosition", () => {
  const rect = { left: 100, top: 50, width: 800, height: 400 };
  it("矩形の中央は0.5,0.5へ写る", () => {
    const result = normalizePointerPosition(500, 250, rect);
    expect(result.x).toBeCloseTo(0.5, 10);
    expect(result.y).toBeCloseTo(0.5, 10);
  });
  it("左上の角は0,0、右下の角は1,1へ写る", () => {
    expect(normalizePointerPosition(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizePointerPosition(900, 450, rect)).toEqual({ x: 1, y: 1 });
  });
  it("幅または高さが0以下のとき、または入力が非有限のときは中央へ丸める", () => {
    expect(normalizePointerPosition(500, 250, { left: 0, top: 0, width: 0, height: 400 })).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(normalizePointerPosition(Number.NaN, 250, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("inputSourceFromPointerType", () => {
  it("タッチ・ペン・マウスはそのまま返し、未知の値はマウスへ丸める", () => {
    expect(inputSourceFromPointerType("touch")).toBe("touch");
    expect(inputSourceFromPointerType("pen")).toBe("pen");
    expect(inputSourceFromPointerType("")).toBe("mouse");
  });
});

describe("mapToReactionCore（X由来のスロットとレーン由来の色）", () => {
  const slotCount = 7;
  it("正規化Xからレーン番号を取り、効果色をレーンから離散的に導く", () => {
    const result = mapToReactionCore(laneCenterNormalizedX(2, slotCount), slotCount);
    expect(result.slotIndex).toBe(2);
    expect(result.colorX01).toBeCloseTo(2 / (slotCount - 1), 10);
  });
  it("写像元は正規化Xのみで、X由来のスロットと一致する", () => {
    for (let i = 0; i < slotCount; i += 1) {
      const x = laneCenterNormalizedX(i, slotCount);
      expect(mapToReactionCore(x, slotCount).slotIndex).toBe(slotIndexFromNormalizedX(x, slotCount));
    }
  });
  it("スロット数が1のとき色は0（ゼロ除算の回避）", () => {
    expect(mapToReactionCore(0, 1).colorX01).toBe(0);
  });
});
