import { describe, expect, it, vi } from "vitest";
import { LineSegments, type BufferAttribute } from "three";
import { createPitchAxisGuide } from "./pitchAxisGuide";
import { OVERLAY_RENDER_ORDER } from "./overlay";
import type { OverlayFrustum } from "./viewport";
import { JUDGMENT_LINE_OVERLAY_Y, NOTE_TOP_OVERLAY_Y } from "./fallingLaneLayout";
import { laneBoundaryX } from "../utils/pitchHudLayout";

/** 縦横比から2次元層の視錐台を作る（rendering/overlay.ts と同じ規約）。 */
function makeFrustum(aspect: number): OverlayFrustum {
  return { left: -aspect, right: aspect, top: 1, bottom: -1 };
}

function segmentLines(object3d: { children: unknown[] }): LineSegments {
  const found = (object3d.children as LineSegments[]).find(
    (c): c is LineSegments => c instanceof LineSegments
  );
  if (found === undefined) {
    throw new Error("線分集合が見つからない");
  }
  return found;
}

describe("createPitchAxisGuide（レーンの仕切り線と単一判定線）", () => {
  it("線分は縦の仕切り（slotCount+1本）と横の判定線（1本）の合計", () => {
    const slotCount = 7;
    const guide = createPitchAxisGuide({ slotCount });
    const position = segmentLines(guide.object3d).geometry.getAttribute("position") as BufferAttribute;
    expect(position.count).toBe((slotCount + 1 + 1) * 2);
    guide.dispose();
  });

  it("スロット数5と9でも頂点数が整合する", () => {
    for (const slotCount of [5, 9]) {
      const guide = createPitchAxisGuide({ slotCount });
      const position = segmentLines(guide.object3d).geometry.getAttribute("position") as BufferAttribute;
      expect(position.count).toBe((slotCount + 1 + 1) * 2);
      guide.dispose();
    }
  });
});

describe("layout の座標", () => {
  const slotCount = 7;
  const aspect = 844 / 390;
  const frustum = makeFrustum(aspect);

  it("各縦の仕切り線はレーンの境界の横位置で、上端から判定線まで伸びる", () => {
    const guide = createPitchAxisGuide({ slotCount });
    guide.layout(frustum, 1800);
    const position = segmentLines(guide.object3d).geometry.getAttribute("position") as BufferAttribute;
    for (let i = 0; i <= slotCount; i += 1) {
      const expectedX = laneBoundaryX(i, slotCount, aspect);
      // 縦線の2頂点は同じ横位置、縦は上端と判定線。
      expect(position.getX(i * 2)).toBeCloseTo(expectedX, 5);
      expect(position.getX(i * 2 + 1)).toBeCloseTo(expectedX, 5);
      expect(position.getY(i * 2)).toBeCloseTo(NOTE_TOP_OVERLAY_Y, 5);
      expect(position.getY(i * 2 + 1)).toBeCloseTo(JUDGMENT_LINE_OVERLAY_Y, 5);
    }
    guide.dispose();
  });

  it("横の判定線は帯の左端から右端まで、判定線の高さで引かれる", () => {
    const guide = createPitchAxisGuide({ slotCount });
    guide.layout(frustum, 1800);
    const position = segmentLines(guide.object3d).geometry.getAttribute("position") as BufferAttribute;
    const judgmentVertex = (slotCount + 1) * 2;
    expect(position.getX(judgmentVertex)).toBeCloseTo(laneBoundaryX(0, slotCount, aspect), 5);
    expect(position.getX(judgmentVertex + 1)).toBeCloseTo(laneBoundaryX(slotCount, slotCount, aspect), 5);
    expect(position.getY(judgmentVertex)).toBeCloseTo(JUDGMENT_LINE_OVERLAY_Y, 5);
    expect(position.getY(judgmentVertex + 1)).toBeCloseTo(JUDGMENT_LINE_OVERLAY_Y, 5);
    guide.dispose();
  });

  it("描画順序が背景の補助表示の帯である", () => {
    const guide = createPitchAxisGuide({ slotCount });
    expect(segmentLines(guide.object3d).renderOrder).toBe(OVERLAY_RENDER_ORDER.backgroundReference);
    guide.dispose();
  });
});

describe("dispose の資源解放", () => {
  it("ジオメトリと材質の解放が呼ばれる", () => {
    const guide = createPitchAxisGuide({ slotCount: 7 });
    const lines = segmentLines(guide.object3d);
    const geometryDispose = vi.spyOn(lines.geometry, "dispose");
    const materialDispose = vi.spyOn(lines.material as { dispose: () => void }, "dispose");
    guide.dispose();
    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
  });
});
