import { describe, expect, it } from "vitest";
import { createSunflowerGeometry } from "./sunflowerGeometry";
import {
  GLOW_ORANGE_RGB,
  SUNFLOWER_DISC_RADIUS,
  SUNFLOWER_PETAL_LENGTH,
  SUNFLOWER_SEED_MARKER_FACTOR,
  SUNFLOWER_TONE_CORE,
  SUNFLOWER_TONE_PETAL,
  SUNFLOWER_TONE_SEED,
} from "../constants";

// BufferGeometry は WebGL を必要とせず node で構築でき、属性配列を読み戻せる。本テストは描画器に触れず、
// 花盤螺旋・花弁・色階調・三角形の健全性・中心花弁比率・決定性を、頂点と索引の配列から検証する。
// 花弁は立体的な反りで頂点の高さ（y）が変わるため、部位の判別は高さではなく頂点色のトーン係数で行う。

const SMALL = { discSegments: 12, seedCount: 60, petalCount: 8, petalSegments: 4 } as const;

function positionArray(geometry: ReturnType<typeof createSunflowerGeometry>["geometry"]): Float32Array {
  return geometry.getAttribute("position").array as Float32Array;
}
function colorArray(geometry: ReturnType<typeof createSunflowerGeometry>["geometry"]): Float32Array {
  return geometry.getAttribute("color").array as Float32Array;
}
function indexArray(geometry: ReturnType<typeof createSunflowerGeometry>["geometry"]): Uint16Array | Uint32Array {
  const index = geometry.getIndex();
  if (!index) {
    throw new Error("索引がありません");
  }
  return index.array as Uint16Array | Uint32Array;
}

// 頂点色のトーン係数で部位を見分ける（基準色の赤成分は1.0なので 赤成分÷基準色赤 = トーン係数）。索引の並び順を保つ。
function verticesByTone(
  pos: Float32Array,
  color: Float32Array,
  tone: number
): { x: number; y: number; z: number }[] {
  const result: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const vertexTone = color[i] / GLOW_ORANGE_RGB[0];
    if (Math.abs(vertexTone - tone) < 1e-4) {
      result.push({ x: pos[i], y: pos[i + 1], z: pos[i + 2] });
    }
  }
  return result;
}

describe("createSunflowerGeometry の頂点数・索引数", () => {
  it("頂点数は 花盤(分割+1) ＋ 種(4×種数) ＋ 花弁((3×段数−1)×花弁数)", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const expected =
      SMALL.discSegments + 1 + 4 * SMALL.seedCount + (3 * SMALL.petalSegments - 1) * SMALL.petalCount;
    expect(geometry.getAttribute("position").count).toBe(expected);
  });

  it("色属性の数は位置の数に等しい", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
  });

  it("花弁の三角形数 = 総三角形 − 花盤の三角形 − 種の三角形（先端畳み込みの段数計上に依らず検算）", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const totalTriangles = indexArray(geometry).length / 3;
    const discTriangles = SMALL.discSegments;
    const seedTriangles = 2 * SMALL.seedCount;
    const petalTriangles = totalTriangles - discTriangles - seedTriangles;
    // 1枚あたりは 根元扇2 ＋ 中間(左右2枚の四角形=4三角形)×(段数−2) ＋ 先端扇2 = 4×段数−4。
    expect(petalTriangles).toBe((4 * SMALL.petalSegments - 4) * SMALL.petalCount);
  });
});

describe("createSunflowerGeometry の三角形の健全性", () => {
  it("すべての索引が頂点数未満", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const vertexCount = geometry.getAttribute("position").count;
    const index = indexArray(geometry);
    for (let i = 0; i < index.length; i += 1) {
      expect(index[i]).toBeLessThan(vertexCount);
    }
  });

  it("すべての頂点座標が有限値（非数や無限大が無い）", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const pos = positionArray(geometry);
    for (let i = 0; i < pos.length; i += 1) {
      expect(Number.isFinite(pos[i])).toBe(true);
    }
  });

  it("すべての三角形の面積が微小な下限を超える（縮退三角形が無い）", () => {
    // 面積は正規化座標（スケール適用前）で評価する。実寸はインスタンスの等方スケールで後から掛かるため、
    // スケールに依らない正規化座標で下限を固定する。反りで立体になっても3次元の面積で評価する。
    const { geometry } = createSunflowerGeometry(SMALL);
    const pos = positionArray(geometry);
    const index = indexArray(geometry);
    const epsilon = 1e-9;
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t] * 3;
      const b = index[t + 1] * 3;
      const c = index[t + 2] * 3;
      const abx = pos[b] - pos[a];
      const aby = pos[b + 1] - pos[a + 1];
      const abz = pos[b + 2] - pos[a + 2];
      const acx = pos[c] - pos[a];
      const acy = pos[c + 1] - pos[a + 1];
      const acz = pos[c + 2] - pos[a + 2];
      const cx = aby * acz - abz * acy;
      const cy = abz * acx - abx * acz;
      const cz = abx * acy - aby * acx;
      const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      expect(area).toBeGreaterThan(epsilon);
    }
  });
});

describe("createSunflowerGeometry の花盤螺旋（受け入れ基準①）", () => {
  it("種の中心半径は n につき単調増加し、最外周の種マーカーが花盤半径の内側に収まる", () => {
    const { geometry, discRadius } = createSunflowerGeometry(SMALL);
    const seedVerts = verticesByTone(positionArray(geometry), colorArray(geometry), SUNFLOWER_TONE_SEED);
    expect(seedVerts.length).toBe(4 * SMALL.seedCount);
    const radii: number[] = [];
    for (let n = 0; n < SMALL.seedCount; n += 1) {
      let sx = 0;
      let sz = 0;
      for (let c = 0; c < 4; c += 1) {
        sx += seedVerts[4 * n + c].x;
        sz += seedVerts[4 * n + c].z;
      }
      radii.push(Math.hypot(sx / 4, sz / 4));
    }
    for (let n = 1; n < radii.length; n += 1) {
      expect(radii[n]).toBeGreaterThanOrEqual(radii[n - 1]);
    }
    for (const v of seedVerts) {
      expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(discRadius + 1e-6);
    }
  });

  it("連続する種の角度差が黄金角に一致する", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const seedVerts = verticesByTone(positionArray(geometry), colorArray(geometry), SUNFLOWER_TONE_SEED);
    const goldenAngle = 2.399963229728653;
    const tau = Math.PI * 2;
    function centerAngle(n: number): number {
      let sx = 0;
      let sz = 0;
      for (let c = 0; c < 4; c += 1) {
        sx += seedVerts[4 * n + c].x;
        sz += seedVerts[4 * n + c].z;
      }
      return Math.atan2(sz / 4, sx / 4);
    }
    for (let n = 10; n < 30; n += 1) {
      let diff = (centerAngle(n + 1) - centerAngle(n)) % tau;
      if (diff < 0) {
        diff += tau;
      }
      expect(diff).toBeCloseTo(goldenAngle, 3);
    }
  });

  it("種マーカーが重なり合わない（内側の数個を除き、直径が最近傍距離以下）", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const seedVerts = verticesByTone(positionArray(geometry), colorArray(geometry), SUNFLOWER_TONE_SEED);
    const centers: { x: number; z: number }[] = [];
    for (let n = 0; n < SMALL.seedCount; n += 1) {
      let sx = 0;
      let sz = 0;
      for (let c = 0; c < 4; c += 1) {
        sx += seedVerts[4 * n + c].x;
        sz += seedVerts[4 * n + c].z;
      }
      centers.push({ x: sx / 4, z: sz / 4 });
    }
    const markerRadius = (SUNFLOWER_SEED_MARKER_FACTOR * SUNFLOWER_DISC_RADIUS) / Math.sqrt(SMALL.seedCount);
    let minNearest = Infinity;
    let maxNearest = 0;
    for (let i = 10; i < centers.length; i += 1) {
      let nearest = Infinity;
      for (let j = 0; j < centers.length; j += 1) {
        if (i === j) {
          continue;
        }
        const d = Math.hypot(centers[i].x - centers[j].x, centers[i].z - centers[j].z);
        if (d < nearest) {
          nearest = d;
        }
      }
      minNearest = Math.min(minNearest, nearest);
      maxNearest = Math.max(maxNearest, nearest);
    }
    expect(2 * markerRadius).toBeLessThanOrEqual(minNearest);
    expect(maxNearest / minNearest).toBeLessThanOrEqual(3);
  });
});

describe("createSunflowerGeometry の花弁（受け入れ基準②）", () => {
  it("花弁の根元が花盤外周半径上にあり、全周をほぼ等間隔に被覆する", () => {
    const { geometry, discRadius } = createSunflowerGeometry(SMALL);
    const petalVerts = verticesByTone(positionArray(geometry), colorArray(geometry), SUNFLOWER_TONE_PETAL);
    // 根元は半径=花盤半径の1点（先端畳み込みで t=0 は1頂点）。水平距離が花盤半径に等しい花弁頂点を根元とする。
    const roots = petalVerts.filter((v) => Math.abs(Math.hypot(v.x, v.z) - discRadius) < 1e-5);
    expect(roots.length).toBe(SMALL.petalCount);
    const angles = roots.map((v) => Math.atan2(v.z, v.x)).sort((a, b) => a - b);
    const spacing = (Math.PI * 2) / SMALL.petalCount;
    const wobbleMax = 0.25 * spacing;
    for (let i = 1; i < angles.length; i += 1) {
      const gap = angles[i] - angles[i - 1];
      expect(gap).toBeGreaterThan(spacing - 2 * wobbleMax - 1e-6);
      expect(gap).toBeLessThan(spacing + 2 * wobbleMax + 1e-6);
    }
  });

  it("花弁の角度ゆらぎが上限（角度間隔の25パーセント）以内", () => {
    const { geometry, discRadius } = createSunflowerGeometry(SMALL);
    const petalVerts = verticesByTone(positionArray(geometry), colorArray(geometry), SUNFLOWER_TONE_PETAL);
    const roots = petalVerts.filter((v) => Math.abs(Math.hypot(v.x, v.z) - discRadius) < 1e-5);
    const spacing = (Math.PI * 2) / SMALL.petalCount;
    const wobbleMax = 0.25 * spacing;
    const angles = roots.map((v) => Math.atan2(v.z, v.x)).sort((a, b) => a - b);
    for (let k = 0; k < angles.length; k += 1) {
      const deviation = Math.abs(angles[k] - (angles[0] + k * spacing));
      expect(deviation).toBeLessThanOrEqual(2 * wobbleMax + 1e-6);
    }
  });

  it("花弁が平面でなく立体的な反りを持つ（花弁頂点の高さに有意な広がりがある）", () => {
    // 反りの効果を確認する。花弁の頂点の高さ（y）が一定でなく、花盤の塗り（y=0付近）より十分高い点を含む。
    const { geometry } = createSunflowerGeometry(SMALL);
    const petalVerts = verticesByTone(positionArray(geometry), colorArray(geometry), SUNFLOWER_TONE_PETAL);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const v of petalVerts) {
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    // 反りの高さの広がりが、花弁の長さに対して無視できない大きさであること。
    expect(maxY - minY).toBeGreaterThan(0.05 * SUNFLOWER_PETAL_LENGTH);
  });
});

describe("createSunflowerGeometry の色階調（受け入れ基準③）", () => {
  it("頂点色は橙系（赤≧緑≧青の比率を保持、各成分0以上1以下）", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const color = colorArray(geometry);
    for (let i = 0; i < color.length; i += 3) {
      const r = color[i];
      const g = color[i + 1];
      const b = color[i + 2];
      expect(r).toBeGreaterThanOrEqual(g - 1e-6);
      expect(g).toBeGreaterThanOrEqual(b - 1e-6);
      for (const ch of [r, g, b]) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });

  it("3部位のトーン係数が芯<種<花弁の単調階層で現れる", () => {
    const { geometry } = createSunflowerGeometry(SMALL);
    const color = colorArray(geometry);
    const tones = new Set<number>();
    for (let i = 0; i < color.length; i += 3) {
      tones.add(Math.round((color[i] / GLOW_ORANGE_RGB[0]) * 1000) / 1000);
    }
    expect(tones.has(Math.round(SUNFLOWER_TONE_CORE * 1000) / 1000)).toBe(true);
    expect(tones.has(Math.round(SUNFLOWER_TONE_SEED * 1000) / 1000)).toBe(true);
    expect(tones.has(Math.round(SUNFLOWER_TONE_PETAL * 1000) / 1000)).toBe(true);
    expect(SUNFLOWER_TONE_CORE).toBeLessThan(SUNFLOWER_TONE_SEED);
    expect(SUNFLOWER_TONE_SEED).toBeLessThan(SUNFLOWER_TONE_PETAL);
  });
});

describe("createSunflowerGeometry の中心花弁比率（受け入れ基準④）", () => {
  it("全体半径が全頂点の水平距離の最大値に一致し、中心花弁比率が目標値の±10%以内", () => {
    const result = createSunflowerGeometry(SMALL);
    const pos = positionArray(result.geometry);
    let measuredMax = 0;
    for (let i = 0; i < pos.length; i += 3) {
      measuredMax = Math.max(measuredMax, Math.hypot(pos[i], pos[i + 2]));
    }
    expect(result.overallRadius).toBeCloseTo(measuredMax, 5);
    expect(result.centerPetalRatio).toBeCloseTo(result.discRadius / result.overallRadius, 5);
    const target = SUNFLOWER_DISC_RADIUS / (SUNFLOWER_DISC_RADIUS + SUNFLOWER_PETAL_LENGTH);
    expect(Math.abs(result.centerPetalRatio - target)).toBeLessThanOrEqual(target * 0.1);
  });
});

describe("createSunflowerGeometry の決定性と引数検査", () => {
  it("同じ種で2回生成した頂点配列が完全一致する", () => {
    const a = positionArray(createSunflowerGeometry({ ...SMALL, seed: 3 }).geometry);
    const b = positionArray(createSunflowerGeometry({ ...SMALL, seed: 3 }).geometry);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it("不正な引数は例外", () => {
    expect(() => createSunflowerGeometry({ seedCount: 1 })).toThrow();
    expect(() => createSunflowerGeometry({ discSegments: 2 })).toThrow();
    expect(() => createSunflowerGeometry({ petalCount: 2 })).toThrow();
    expect(() => createSunflowerGeometry({ petalSegments: 1 })).toThrow();
    expect(() => createSunflowerGeometry({ seedCount: 10.5 })).toThrow();
    expect(() => createSunflowerGeometry({ discRadius: Number.NaN })).toThrow();
    expect(() => createSunflowerGeometry({ discRadius: 0 })).toThrow();
  });
});
