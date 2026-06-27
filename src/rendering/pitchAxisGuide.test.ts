import { describe, expect, it, vi } from "vitest";
import { LineSegments, Mesh, Texture, type BufferAttribute } from "three";
import { createPitchAxisGuide } from "./pitchAxisGuide";
import { OVERLAY_RENDER_ORDER } from "./overlay";
import { overlayPointFromNormalized, type OverlayFrustum } from "./viewport";
import { slotCenterNormalizedY } from "../utils/pitchSlotAxis";
import { pitchHudHorizontalLayout } from "../utils/pitchHudLayout";

/** 縦横比から2次元層の視錐台を作る（rendering/overlay.ts と同じ規約）。 */
function makeFrustum(aspect: number): OverlayFrustum {
  return { left: -aspect, right: aspect, top: 1, bottom: -1 };
}

/** 番号画像生成のスタブ。文書要素に依存せず、生成と解放を記録する。 */
function makeStubFactory() {
  const created: { displayNumber: number; texelSize: number; disposed: boolean }[] = [];
  const factory = (displayNumber: number, texelSize: number): Texture => {
    const texture = new Texture();
    const record = { displayNumber, texelSize, disposed: false };
    const original = texture.dispose.bind(texture);
    texture.dispose = (): void => {
      record.disposed = true;
      original();
    };
    created.push(record);
    return texture;
  };
  return { factory, created };
}

function labelMeshes(object3d: { children: unknown[] }): Mesh[] {
  return (object3d.children as Mesh[]).filter((c): c is Mesh => c instanceof Mesh);
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

describe("createPitchAxisGuide の組み立て", () => {
  it("線分集合1本（slotCount 本の線分）と番号 slotCount 枚を持つ", () => {
    const slotCount = 7;
    const { factory } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    const lines = segmentLines(guide.object3d);
    const labels = labelMeshes(guide.object3d);
    expect(labels).toHaveLength(slotCount);
    // 線分は slotCount 本（各番号の縦中央の右側に1本ずつ）。線分1本につき頂点2個。
    const position = lines.geometry.getAttribute("position") as BufferAttribute;
    expect(position.count).toBe(slotCount * 2);
    guide.dispose();
  });

  it("スロット数5と9でも子要素数が整合する", () => {
    for (const slotCount of [5, 9]) {
      const { factory } = makeStubFactory();
      const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
      expect(labelMeshes(guide.object3d)).toHaveLength(slotCount);
      const position = segmentLines(guide.object3d).geometry.getAttribute(
        "position"
      ) as BufferAttribute;
      expect(position.count).toBe(slotCount * 2);
      guide.dispose();
    }
  });
});

describe("layout の座標が入力規約の正典と一致する", () => {
  const slotCount = 7;
  const aspect = 16 / 9;
  const frustum = makeFrustum(aspect);
  const devicePixelHeight = 1800;

  it("番号の縦位置が帯中央の正規化Yの写像と一致する", () => {
    const { factory } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, devicePixelHeight);
    const labels = labelMeshes(guide.object3d);
    for (let i = 0; i < slotCount; i += 1) {
      const expectedY = overlayPointFromNormalized(0, slotCenterNormalizedY(i, slotCount), aspect).y;
      expect(labels[i].position.y).toBeCloseTo(expectedY, 10);
    }
    guide.dispose();
  });

  it("各線分の縦位置がスロット中央の正規化Yの写像と一致する（2頂点とも同じ縦位置）", () => {
    const { factory } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, devicePixelHeight);
    const position = segmentLines(guide.object3d).geometry.getAttribute(
      "position"
    ) as BufferAttribute;
    for (let i = 0; i < slotCount; i += 1) {
      const expectedY = overlayPointFromNormalized(0, slotCenterNormalizedY(i, slotCount), aspect).y;
      // 頂点は32ビット浮動小数点で格納されるため許容桁を5桁とする。
      expect(position.getY(i * 2)).toBeCloseTo(expectedY, 5);
      expect(position.getY(i * 2 + 1)).toBeCloseTo(expectedY, 5);
    }
    guide.dispose();
  });
});

describe("上下の向き（番号1が最上部・番号7が最下部）", () => {
  const slotCount = 7;
  const frustum = makeFrustum(16 / 9);

  it("番号1の縦座標は正、番号7の縦座標は負で、番号が増えるほど縦座標が単調に減る", () => {
    const { factory, created } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, 1800);
    const labels = labelMeshes(guide.object3d);
    // 生成順は番号1〜7。
    expect(created.map((r) => r.displayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(labels[0].position.y).toBeGreaterThan(0);
    expect(labels[slotCount - 1].position.y).toBeLessThan(0);
    for (let i = 1; i < slotCount; i += 1) {
      expect(labels[i].position.y).toBeLessThan(labels[i - 1].position.y);
    }
    guide.dispose();
  });
});

describe("線分の横位置と描画順序", () => {
  const slotCount = 7;
  const aspect = 16 / 9;
  const frustum = makeFrustum(aspect);

  it("線分は番号の右端から始まり通路の右端で終わり、番号は線分の起点より左にある", () => {
    const { factory } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, 1800);
    const horizontal = pitchHudHorizontalLayout(aspect, slotCount);
    const position = segmentLines(guide.object3d).geometry.getAttribute(
      "position"
    ) as BufferAttribute;
    const startX = position.getX(0);
    const endX = position.getX(1);
    // 線分は番号の右端から始まり、通路の右端で終わる。
    expect(startX).toBeCloseTo(horizontal.numberRightEdgeX, 5);
    expect(endX).toBeCloseTo(horizontal.channelRightX, 5);
    // 線分は左から右へ伸びる。
    expect(startX).toBeLessThan(endX);
    // 番号の中心は線分の起点（番号の右端）より左。
    const labelX = labelMeshes(guide.object3d)[0].position.x;
    expect(labelX).toBeLessThan(startX);
    guide.dispose();
  });

  it("全ての線分が同じ起点から始まり、同じ右端で終わる", () => {
    const { factory } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, 1800);
    const position = segmentLines(guide.object3d).geometry.getAttribute(
      "position"
    ) as BufferAttribute;
    const startX = position.getX(0);
    const endX = position.getX(1);
    for (let i = 0; i < slotCount; i += 1) {
      expect(position.getX(i * 2)).toBeCloseTo(startX, 5);
      expect(position.getX(i * 2 + 1)).toBeCloseTo(endX, 5);
    }
    guide.dispose();
  });

  it("全ての子要素の描画順序が背景の補助表示の帯である", () => {
    const { factory } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    for (const child of guide.object3d.children) {
      expect(child.renderOrder).toBe(OVERLAY_RENDER_ORDER.backgroundReference);
    }
    guide.dispose();
  });
});

describe("番号画像の縦画素数の下限と上限", () => {
  const slotCount = 7;
  const frustum = makeFrustum(16 / 9);

  it("極小の表示縦画素数で下限へ丸める", () => {
    const { factory, created } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, 1);
    expect(created.every((r) => r.texelSize === 24)).toBe(true);
    guide.dispose();
  });

  it("過大な表示縦画素数で上限へ丸める", () => {
    const { factory, created } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, 10_000_000);
    expect(created.every((r) => r.texelSize === 256)).toBe(true);
    guide.dispose();
  });
});

describe("再 layout の作り直し判定", () => {
  const slotCount = 7;
  const frustum = makeFrustum(16 / 9);

  it("目標縦画素数が変わらない再 layout では作り直さない", () => {
    const { factory, created } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, 1800);
    guide.layout(frustum, 1800);
    expect(created).toHaveLength(slotCount);
    guide.dispose();
  });

  it("目標縦画素数が変わる再 layout では古い画像を解放して作り直す", () => {
    const { factory, created } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(frustum, 1800);
    guide.layout(frustum, 700);
    expect(created).toHaveLength(slotCount * 2);
    // 最初に作った slotCount 枚が解放されている。
    for (let i = 0; i < slotCount; i += 1) {
      expect(created[i].disposed).toBe(true);
    }
    guide.dispose();
  });
});

describe("dispose の資源解放", () => {
  it("全ジオメトリ・マテリアル・画像の解放が呼ばれる", () => {
    const slotCount = 7;
    const { factory, created } = makeStubFactory();
    const guide = createPitchAxisGuide({ slotCount, createLabelTexture: factory });
    guide.layout(makeFrustum(16 / 9), 1800);
    const lines = segmentLines(guide.object3d);
    const labels = labelMeshes(guide.object3d);
    const lineGeometryDispose = vi.spyOn(lines.geometry, "dispose");
    const lineMaterialDispose = vi.spyOn(lines.material as { dispose: () => void }, "dispose");
    const labelGeometryDisposes = labels.map((m) => vi.spyOn(m.geometry, "dispose"));
    const labelMaterialDisposes = labels.map((m) =>
      vi.spyOn(m.material as { dispose: () => void }, "dispose")
    );
    guide.dispose();
    expect(lineGeometryDispose).toHaveBeenCalled();
    expect(lineMaterialDispose).toHaveBeenCalled();
    for (const spy of labelGeometryDisposes) {
      expect(spy).toHaveBeenCalled();
    }
    for (const spy of labelMaterialDisposes) {
      expect(spy).toHaveBeenCalled();
    }
    expect(created.every((r) => r.disposed)).toBe(true);
  });
});
