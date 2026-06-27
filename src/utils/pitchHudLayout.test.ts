import { describe, expect, it } from "vitest";
import {
  columnCenterX,
  numberBoxHeight,
  numberBoxWidth,
  pitchHudHorizontalLayout,
} from "./pitchHudLayout";

describe("numberBoxHeight と numberBoxWidth", () => {
  it("番号の枠の高さは帯割合0.75を反映し、幅は高さに字形比0.62を掛けた値", () => {
    const slotCount = 7;
    expect(numberBoxHeight(slotCount)).toBeCloseTo(((2 * 0.75) / 7) * 0.5, 10);
    expect(numberBoxWidth(slotCount)).toBeCloseTo(numberBoxHeight(slotCount) * 0.62, 10);
  });
});

describe("pitchHudHorizontalLayout", () => {
  const aspect = 390 / 844;
  const slotCount = 7;
  const layout = pitchHudHorizontalLayout(aspect, slotCount);

  it("通路の右端は正規化X 0.25 を写した −0.5×縦横比", () => {
    expect(layout.channelRightX).toBeCloseTo(-0.5 * aspect, 10);
  });

  it("通路の左端は番号の右端と一致する", () => {
    expect(layout.channelLeftX).toBeCloseTo(layout.numberRightEdgeX, 10);
  });

  it("通路の幅と1列の幅は整合する（列幅×スロット数＝通路幅）", () => {
    expect(layout.channelWidth).toBeCloseTo(layout.channelRightX - layout.channelLeftX, 10);
    expect(layout.columnWidth * slotCount).toBeCloseTo(layout.channelWidth, 10);
  });

  it("番号の右端は番号の中心から枠の半幅だけ右", () => {
    expect(layout.numberRightEdgeX).toBeCloseTo(layout.numberCenterX + layout.numberBoxWidth / 2, 10);
  });
});

describe("columnCenterX", () => {
  const aspect = 390 / 844;
  const slotCount = 7;
  const layout = pitchHudHorizontalLayout(aspect, slotCount);

  it("番号1の列が最も左、番号7の列が最も右で、単調に右へ並ぶ", () => {
    const centers = [];
    for (let i = 0; i < slotCount; i += 1) {
      centers.push(columnCenterX(layout, i, slotCount));
    }
    for (let i = 1; i < slotCount; i += 1) {
      expect(centers[i]).toBeGreaterThan(centers[i - 1]);
    }
    expect(centers[0]).toBeGreaterThan(layout.channelLeftX);
    expect(centers[slotCount - 1]).toBeLessThan(layout.channelRightX);
  });

  it("最も右の列の中心は通路の右端から半列分内側", () => {
    const rightmost = columnCenterX(layout, slotCount - 1, slotCount);
    expect(rightmost).toBeCloseTo(layout.channelRightX - layout.columnWidth / 2, 10);
  });

  it("最も左の列の中心は通路の左端から半列分内側", () => {
    const leftmost = columnCenterX(layout, 0, slotCount);
    expect(leftmost).toBeCloseTo(layout.channelLeftX + layout.columnWidth / 2, 10);
  });
});
