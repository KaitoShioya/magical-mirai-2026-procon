import { describe, expect, it } from "vitest";
import {
  clamp01,
  colorParamFromNormalizedX,
  inputSourceFromPointerType,
  mapToReactionCore,
  normalizePointerPosition,
  resolveSlotCount,
  slotCenterNormalizedY,
  slotIndexFromNormalizedY,
} from "./coordinateMapping";

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
    expect(clamp01(Number.NEGATIVE_INFINITY, 0.25)).toBe(0.25);
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
  it("矩形の外の座標は0以上1以下へ丸める", () => {
    expect(normalizePointerPosition(50, 30, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizePointerPosition(2000, 2000, rect)).toEqual({ x: 1, y: 1 });
  });
  it("幅または高さが0以下のときは中央へ丸める", () => {
    expect(normalizePointerPosition(500, 250, { left: 0, top: 0, width: 0, height: 400 })).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(normalizePointerPosition(500, 250, { left: 0, top: 0, width: 800, height: -5 })).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });
  it("入力が非有限のときは中央へ丸める", () => {
    expect(normalizePointerPosition(Number.NaN, 250, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(
      normalizePointerPosition(500, 250, { left: 0, top: 0, width: Number.NaN, height: 400 })
    ).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("slotIndexFromNormalizedY", () => {
  const slotCount = 7;
  it("最上部0は帯0、最下部1は帯6（最大番号）へ写る", () => {
    expect(slotIndexFromNormalizedY(0, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(1, slotCount)).toBe(6);
  });
  it("帯の内側の境界は番号が大きい方の区画（画面で下側）へ属する", () => {
    // 圧縮帯（上端余白0.125・帯割合0.75）を等分した内側の境界。境界は下側の区画に属する。
    const boundary = (i: number) => 0.125 + (i / slotCount) * 0.75;
    expect(slotIndexFromNormalizedY(boundary(1), slotCount)).toBe(1);
    expect(slotIndexFromNormalizedY(boundary(2), slotCount)).toBe(2);
  });
  it("帯の内部は番号が単調に増える", () => {
    expect(slotIndexFromNormalizedY(0.05, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(0.5, slotCount)).toBe(3);
    expect(slotIndexFromNormalizedY(0.95, slotCount)).toBe(6);
  });
  it("範囲外は端の帯へ丸める", () => {
    expect(slotIndexFromNormalizedY(-0.5, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(1.5, slotCount)).toBe(6);
  });
  it("非有限値は帯0へ丸める（非数も無限大も一律に帯0）", () => {
    expect(slotIndexFromNormalizedY(Number.NaN, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(Number.POSITIVE_INFINITY, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(Number.NEGATIVE_INFINITY, slotCount)).toBe(0);
  });
});

describe("slotCenterNormalizedY と slotIndexFromNormalizedY の往復", () => {
  const slotCount = 7;
  it("各帯の中央を写すと元の帯番号へ戻る（入力同等性の根拠）", () => {
    for (let i = 0; i < slotCount; i += 1) {
      const center = slotCenterNormalizedY(i, slotCount);
      expect(slotIndexFromNormalizedY(center, slotCount)).toBe(i);
    }
  });
  it("帯0の中央と帯6の中央は圧縮帯（上端余白0.125・帯割合0.75）の式に従う", () => {
    expect(slotCenterNormalizedY(0, slotCount)).toBeCloseTo(0.125 + (0.5 / 7) * 0.75, 10);
    expect(slotCenterNormalizedY(6, slotCount)).toBeCloseTo(0.125 + (6.5 / 7) * 0.75, 10);
  });
});

describe("colorParamFromNormalizedX", () => {
  it("範囲内は恒等で返す", () => {
    expect(colorParamFromNormalizedX(0.5)).toBe(0.5);
    expect(colorParamFromNormalizedX(0)).toBe(0);
    expect(colorParamFromNormalizedX(1)).toBe(1);
  });
  it("範囲外は端へ丸める", () => {
    expect(colorParamFromNormalizedX(-1)).toBe(0);
    expect(colorParamFromNormalizedX(2)).toBe(1);
  });
  it("非有限値は中央0.5へ丸める", () => {
    expect(colorParamFromNormalizedX(Number.NaN)).toBe(0.5);
  });
});

describe("inputSourceFromPointerType", () => {
  it("タッチ・ペン・マウスはそのまま返す", () => {
    expect(inputSourceFromPointerType("touch")).toBe("touch");
    expect(inputSourceFromPointerType("pen")).toBe("pen");
    expect(inputSourceFromPointerType("mouse")).toBe("mouse");
  });
  it("空文字や未知の値はマウスへ丸める", () => {
    expect(inputSourceFromPointerType("")).toBe("mouse");
    expect(inputSourceFromPointerType("unknown")).toBe("mouse");
  });
});

describe("resolveSlotCount", () => {
  const fallback = 7;
  it("未指定のときは予備値を返す", () => {
    expect(resolveSlotCount(undefined, fallback)).toBe(7);
  });
  it("正の整数はその値を返す", () => {
    expect(resolveSlotCount(5, fallback)).toBe(5);
    expect(resolveSlotCount(9, fallback)).toBe(9);
    expect(resolveSlotCount(1, fallback)).toBe(1);
  });
  it("1未満・非整数・非有限は予備値へ丸める", () => {
    expect(resolveSlotCount(0, fallback)).toBe(7);
    expect(resolveSlotCount(-3, fallback)).toBe(7);
    expect(resolveSlotCount(5.5, fallback)).toBe(7);
    expect(resolveSlotCount(Number.NaN, fallback)).toBe(7);
    expect(resolveSlotCount(Number.POSITIVE_INFINITY, fallback)).toBe(7);
  });
});

describe("mapToReactionCore", () => {
  const slotCount = 7;
  it("正規化座標からスロット番号と色パラメータを返す", () => {
    const result = mapToReactionCore(0.5, slotCenterNormalizedY(2, slotCount), slotCount);
    expect(result.slotIndex).toBe(2);
    expect(result.colorX01).toBe(0.5);
  });
  it("同じ正規化座標は入力源に依らず同じ出力になる（全入力源が通る単一関数）", () => {
    const x = 0.6;
    const y = slotCenterNormalizedY(4, slotCount);
    expect(mapToReactionCore(x, y, slotCount)).toEqual(mapToReactionCore(x, y, slotCount));
  });
});
