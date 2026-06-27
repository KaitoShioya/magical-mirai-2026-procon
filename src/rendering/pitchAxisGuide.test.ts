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

/** まとめ物体の全ての線分集合を取り出す。 */
function allLineSegments(object3d: { children: unknown[] }): LineSegments[] {
  return (object3d.children as unknown[]).filter(
    (c): c is LineSegments => c instanceof LineSegments
  );
}

function positionOf(lines: LineSegments): BufferAttribute {
  return lines.geometry.getAttribute("position") as BufferAttribute;
}

/** 頂点数から、縦の仕切り線（slotCount+1 本）と横の判定線（1 本）を見分ける。 */
function dividerAndJudgment(
  guide: { object3d: { children: unknown[] } },
  slotCount: number
): { divider: LineSegments; judgment: LineSegments } {
  const segments = allLineSegments(guide.object3d);
  const divider = segments.find((s) => positionOf(s).count === (slotCount + 1) * 2);
  const judgment = segments.find((s) => positionOf(s).count === 2);
  if (divider === undefined || judgment === undefined) {
    throw new Error("仕切り線または判定線の線分集合が見つからない");
  }
  return { divider, judgment };
}

describe("createPitchAxisGuide（レーンの仕切り線と単一判定線）", () => {
  it("仕切り線は縦 slotCount+1 本、判定線は横1本", () => {
    const slotCount = 7;
    const guide = createPitchAxisGuide({ slotCount });
    const { divider, judgment } = dividerAndJudgment(guide, slotCount);
    expect(positionOf(divider).count).toBe((slotCount + 1) * 2);
    expect(positionOf(judgment).count).toBe(2);
    guide.dispose();
  });

  it("スロット数5と9でも頂点数が整合する", () => {
    for (const slotCount of [5, 9]) {
      const guide = createPitchAxisGuide({ slotCount });
      const { divider, judgment } = dividerAndJudgment(guide, slotCount);
      expect(positionOf(divider).count).toBe((slotCount + 1) * 2);
      expect(positionOf(judgment).count).toBe(2);
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
    const { divider } = dividerAndJudgment(guide, slotCount);
    const position = positionOf(divider);
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
    const { judgment } = dividerAndJudgment(guide, slotCount);
    const position = positionOf(judgment);
    expect(position.getX(0)).toBeCloseTo(laneBoundaryX(0, slotCount, aspect), 5);
    expect(position.getX(1)).toBeCloseTo(laneBoundaryX(slotCount, slotCount, aspect), 5);
    expect(position.getY(0)).toBeCloseTo(JUDGMENT_LINE_OVERLAY_Y, 5);
    expect(position.getY(1)).toBeCloseTo(JUDGMENT_LINE_OVERLAY_Y, 5);
    guide.dispose();
  });

  it("判定線は仕切り線と区別できるよう、別マテリアルでより明るく、仕切り線の上に重なる", () => {
    const guide = createPitchAxisGuide({ slotCount });
    const { divider, judgment } = dividerAndJudgment(guide, slotCount);
    const dividerMaterial = divider.material as { opacity: number };
    const judgmentMaterial = judgment.material as { opacity: number };
    // 別マテリアルであること（同一参照でない）。
    expect(divider.material).not.toBe(judgment.material);
    // 判定線の方が濃い（はっきり見える）こと。
    expect(judgmentMaterial.opacity).toBeGreaterThan(dividerMaterial.opacity);
    // 交点で判定線が勝つよう、描画順序が仕切り線より後であること。
    expect(judgment.renderOrder).toBeGreaterThan(divider.renderOrder);
    guide.dispose();
  });

  it("仕切り線の描画順序が背景の補助表示の帯である", () => {
    const guide = createPitchAxisGuide({ slotCount });
    const { divider } = dividerAndJudgment(guide, slotCount);
    expect(divider.renderOrder).toBe(OVERLAY_RENDER_ORDER.backgroundReference);
    guide.dispose();
  });
});

describe("dispose の資源解放", () => {
  it("仕切り線と判定線の両方のジオメトリと材質の解放が呼ばれる", () => {
    const slotCount = 7;
    const guide = createPitchAxisGuide({ slotCount });
    const { divider, judgment } = dividerAndJudgment(guide, slotCount);
    const spies = [
      vi.spyOn(divider.geometry, "dispose"),
      vi.spyOn(divider.material as { dispose: () => void }, "dispose"),
      vi.spyOn(judgment.geometry, "dispose"),
      vi.spyOn(judgment.material as { dispose: () => void }, "dispose"),
    ];
    guide.dispose();
    for (const spy of spies) {
      expect(spy).toHaveBeenCalled();
    }
  });
});
