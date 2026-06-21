import { describe, it, expect } from "vitest";
import {
  demToStageMeshes,
  sampleIndices,
  waterCentroidNormalized,
  STAGE_BUILD_PARAMS,
} from "./stage-geometry.mjs";

// 小さい模擬DEM（列5×行4）。値は標高。0.15以下は水面とみなす。
// 行0と行1の左寄りを陸地（高め）、右下を水面（0付近）にする。
const SMALL_W = 5;
const SMALL_H = 4;
// prettier-ignore
const SMALL_DEM = [
  1.0, 0.8, 0.5, 0.10, 0.05,
  0.9, 0.6, 0.20, 0.05, 0.00,
  0.4, 0.15, 0.05, 0.00, 0.00,
  0.10, 0.05, 0.00, 0.00, 0.00,
];

const SMALL_PARAMS = {
  waterLevel: 0.15,
  verticalScale: 2,
  worldSize: 10,
  gridStride: 1,
  waterExtentFactor: 2,
  waterPlaneY: -0.05,
};

describe("sampleIndices（端を必ず含む間引き）", () => {
  it("最終番号を必ず含む（偶数長で端が落ちない）", () => {
    expect(sampleIndices(302, 2).at(-1)).toBe(301);
    expect(sampleIndices(4, 2)).toEqual([0, 2, 3]);
  });
  it("奇数長では末尾が間隔に乗るので重複しない", () => {
    expect(sampleIndices(385, 2).at(-1)).toBe(384);
    expect(sampleIndices(5, 2)).toEqual([0, 2, 4]);
  });
});

describe("waterCentroidNormalized（水面領域の重心）", () => {
  it("水面セルの中央を0・端を±0.5とする正規化座標を返す", () => {
    const centroid = waterCentroidNormalized(SMALL_DEM, SMALL_W, SMALL_H, 0.15);
    // 水面は右下に偏るため、列方向・行方向ともに正になる。
    expect(centroid.x).toBeGreaterThan(0);
    expect(centroid.z).toBeGreaterThan(0);
    expect(centroid.count).toBeGreaterThan(0);
  });
});

describe("demToStageMeshes（地形と水面領域マーカーの生成）", () => {
  it("値の個数が列×行に一致しないと例外を投げる", () => {
    expect(() => demToStageMeshes([1, 2, 3], SMALL_W, SMALL_H, SMALL_PARAMS)).toThrow();
  });

  it("terrain と water の2メッシュを返し node 名が一致する", () => {
    const { meshes } = demToStageMeshes(SMALL_DEM, SMALL_W, SMALL_H, SMALL_PARAMS);
    expect(meshes.map((m) => m.name)).toEqual(["terrain", "water"]);
  });

  it("標高が基準（0.15）のセルは高さ0になる", () => {
    const { meshes } = demToStageMeshes(SMALL_DEM, SMALL_W, SMALL_H, SMALL_PARAMS);
    const positions = meshes[0].positions;
    // 行2・列1（0始まり）の標高は0.15。間引き間隔1なので標本格子はそのまま、頂点番号は r*nCols+c=2*5+1=11。
    const y = positions[11 * 3 + 1];
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });

  it("地形の索引はすべて頂点数の範囲内で、最後の区画まで含む", () => {
    const { meshes, meta } = demToStageMeshes(SMALL_DEM, SMALL_W, SMALL_H, SMALL_PARAMS);
    const indices = meshes[0].indices;
    const vertexCount = meta.terrainVertexCount;
    expect(indices.length % 3).toBe(0);
    expect(Math.min(...indices)).toBe(0);
    expect(Math.max(...indices)).toBe(vertexCount - 1);
  });

  it("地形の上面の法線が上向き（+Y）になる巻き順である", () => {
    const { meshes } = demToStageMeshes(SMALL_DEM, SMALL_W, SMALL_H, SMALL_PARAMS);
    const positions = meshes[0].positions;
    const indices = meshes[0].indices;
    // 最初の三角形の3頂点で外積を取り、Y成分の符号を見る。
    const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const [a, b, c] = [p(indices[0]), p(indices[1]), p(indices[2])];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normalY = ab[2] * ac[0] - ab[0] * ac[2]; // 外積のY成分
    expect(normalY).toBeGreaterThan(0);
  });

  it("水面領域マーカーは原点中心の矩形（最小と最大が対称）である", () => {
    const { meshes } = demToStageMeshes(SMALL_DEM, SMALL_W, SMALL_H, SMALL_PARAMS);
    const positions = meshes[1].positions;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < positions.length / 3; i += 1) {
      minX = Math.min(minX, positions[i * 3]);
      maxX = Math.max(maxX, positions[i * 3]);
      minZ = Math.min(minZ, positions[i * 3 + 2]);
      maxZ = Math.max(maxZ, positions[i * 3 + 2]);
    }
    expect(minX).toBeCloseTo(-maxX, 6);
    expect(minZ).toBeCloseTo(-maxZ, 6);
    // 高さは waterPlaneY 一定。
    expect(positions[1]).toBeCloseTo(SMALL_PARAMS.waterPlaneY, 6);
  });

  it("water node に originalWaterBoundsWorld を持つ", () => {
    const { meshes } = demToStageMeshes(SMALL_DEM, SMALL_W, SMALL_H, SMALL_PARAMS);
    const bounds = meshes[1].extras.originalWaterBoundsWorld;
    expect(bounds).not.toBeNull();
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxZ).toBeGreaterThan(bounds.minZ);
    expect(bounds.y).toBeCloseTo(SMALL_PARAMS.waterPlaneY, 6);
  });

  it("既定パラメータの長辺は worldSize、短辺は縦横比を保つ", () => {
    const grid = new Array(SMALL_W * SMALL_H).fill(0);
    const { meta } = demToStageMeshes(grid, SMALL_W, SMALL_H, STAGE_BUILD_PARAMS);
    expect(meta.worldX).toBe(STAGE_BUILD_PARAMS.worldSize);
    expect(meta.worldZ).toBeCloseTo((STAGE_BUILD_PARAMS.worldSize * SMALL_H) / SMALL_W, 6);
  });
});
