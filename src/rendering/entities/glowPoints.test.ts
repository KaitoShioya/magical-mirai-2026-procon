import { describe, expect, it } from "vitest";
import {
  DynamicDrawUsage,
  type MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import { createGlowPoints } from "./glowPoints";
import { GLOW_NEON_RGB, GLOW_ORANGE_RGB } from "../constants";

// InstancedMesh は WebGL を必要とせず node で構築でき、instanceMatrix / instanceColor を
// 型付き配列として読み戻せる。本テストは描画器（WebGLRenderer）には触れず、これらの配列だけを検証する。

describe("createGlowPoints の構造", () => {
  it("単一の InstancedMesh で形状1個・材質1個・材質色が白", () => {
    const glow = createGlowPoints({ capacity: 8 });
    expect(glow.object.isInstancedMesh).toBe(true);
    expect(Array.isArray(glow.object.material)).toBe(false);
    const material = glow.object.material as MeshBasicMaterial;
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.toneMapped).toBe(false);
    expect(glow.capacity).toBe(8);
  });

  it("生成直後の可視数は0", () => {
    const glow = createGlowPoints({ capacity: 8 });
    expect(glow.object.count).toBe(0);
  });

  it("生成直後は全スロットの色が黒(0,0,0)", () => {
    const glow = createGlowPoints({ capacity: 4 });
    expect(glow.object.instanceColor).not.toBeNull();
    const colors = glow.object.instanceColor!.array;
    for (let i = 0; i < colors.length; i += 1) {
      expect(colors[i]).toBe(0);
    }
  });

  it("frustumCulled は偽（任意配置で境界球更新漏れにより消えるのを避ける）", () => {
    const glow = createGlowPoints({ capacity: 4 });
    expect(glow.object.frustumCulled).toBe(false);
  });

  it("行列・色の配列は動的更新向けの転送設定", () => {
    const glow = createGlowPoints({ capacity: 4 });
    expect(glow.object.instanceMatrix.usage).toBe(DynamicDrawUsage);
    expect(glow.object.instanceColor!.usage).toBe(DynamicDrawUsage);
  });
});

describe("createGlowPoints の setInstance", () => {
  it("位置を行列の平行移動成分へ、等方スケールを対角成分へ書く", () => {
    const glow = createGlowPoints({ capacity: 4 });
    glow.setInstance(2, { position: { x: 3.5, y: -1.25, z: 7 }, scale: 2, colorRgb: GLOW_ORANGE_RGB });
    const matrix = glow.object.instanceMatrix.array;
    const base = 2 * 16;
    // 列優先行列：対角(0,5,10)に等方スケール、末列(12,13,14)に位置。
    expect(matrix[base + 0]).toBeCloseTo(2, 5);
    expect(matrix[base + 5]).toBeCloseTo(2, 5);
    expect(matrix[base + 10]).toBeCloseTo(2, 5);
    expect(matrix[base + 12]).toBeCloseTo(3.5, 5);
    expect(matrix[base + 13]).toBeCloseTo(-1.25, 5);
    expect(matrix[base + 14]).toBeCloseTo(7, 5);
  });

  it("色を基準色そのままで書く（輝度既定1）", () => {
    const glow = createGlowPoints({ capacity: 4 });
    glow.setInstance(0, { position: { x: 0, y: 0, z: 0 }, scale: 1, colorRgb: GLOW_ORANGE_RGB });
    glow.setInstance(1, { position: { x: 0, y: 0, z: 0 }, scale: 1, colorRgb: GLOW_NEON_RGB });
    const colors = glow.object.instanceColor!.array;
    expect(colors[0]).toBeCloseTo(GLOW_ORANGE_RGB[0], 5);
    expect(colors[1]).toBeCloseTo(GLOW_ORANGE_RGB[1], 5);
    expect(colors[2]).toBeCloseTo(GLOW_ORANGE_RGB[2], 5);
    expect(colors[3]).toBeCloseTo(GLOW_NEON_RGB[0], 5);
    expect(colors[4]).toBeCloseTo(GLOW_NEON_RGB[1], 5);
    expect(colors[5]).toBeCloseTo(GLOW_NEON_RGB[2], 5);
  });

  it("輝度を基準色へ乗算する（積は1を超え得る）", () => {
    const glow = createGlowPoints({ capacity: 2 });
    glow.setInstance(0, { position: { x: 0, y: 0, z: 0 }, scale: 1, colorRgb: [0.5, 0.4, 0.2], brightness: 3 });
    const colors = glow.object.instanceColor!.array;
    expect(colors[0]).toBeCloseTo(1.5, 5);
    expect(colors[1]).toBeCloseTo(1.2, 5);
    expect(colors[2]).toBeCloseTo(0.6, 5);
  });
});

describe("createGlowPoints の不正値", () => {
  it("容量が正の整数でなければ例外", () => {
    expect(() => createGlowPoints({ capacity: 0 })).toThrow();
    expect(() => createGlowPoints({ capacity: -1 })).toThrow();
    expect(() => createGlowPoints({ capacity: 2.5 })).toThrow();
    expect(() => createGlowPoints({ capacity: Number.NaN })).toThrow();
    expect(() => createGlowPoints({ capacity: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("索引が範囲外・非整数なら例外", () => {
    const glow = createGlowPoints({ capacity: 4 });
    const valid = { position: { x: 0, y: 0, z: 0 }, scale: 1, colorRgb: GLOW_ORANGE_RGB };
    expect(() => glow.setInstance(4, valid)).toThrow();
    expect(() => glow.setInstance(-1, valid)).toThrow();
    expect(() => glow.setInstance(1.5, valid)).toThrow();
  });

  it("値が不正（非有限・負・色が1超）なら例外", () => {
    const glow = createGlowPoints({ capacity: 4 });
    expect(() =>
      glow.setInstance(0, { position: { x: Number.NaN, y: 0, z: 0 }, scale: 1, colorRgb: GLOW_ORANGE_RGB })
    ).toThrow();
    expect(() =>
      glow.setInstance(0, { position: { x: 0, y: 0, z: 0 }, scale: -1, colorRgb: GLOW_ORANGE_RGB })
    ).toThrow();
    expect(() =>
      glow.setInstance(0, { position: { x: 0, y: 0, z: 0 }, scale: 1, colorRgb: [-0.1, 0, 0] })
    ).toThrow();
    expect(() =>
      glow.setInstance(0, { position: { x: 0, y: 0, z: 0 }, scale: 1, colorRgb: [1.2, 0, 0] })
    ).toThrow();
    expect(() =>
      glow.setInstance(0, { position: { x: 0, y: 0, z: 0 }, scale: 1, colorRgb: GLOW_ORANGE_RGB, brightness: -1 })
    ).toThrow();
  });
});

describe("createGlowPoints の setVisibleCount", () => {
  it("可視数を反映する", () => {
    const glow = createGlowPoints({ capacity: 10 });
    glow.setVisibleCount(3);
    expect(glow.object.count).toBe(3);
  });
  it("小数は切り捨て、範囲は0以上容量以下にクランプ", () => {
    const glow = createGlowPoints({ capacity: 10 });
    glow.setVisibleCount(2.7);
    expect(glow.object.count).toBe(2);
    glow.setVisibleCount(-5);
    expect(glow.object.count).toBe(0);
    glow.setVisibleCount(20);
    expect(glow.object.count).toBe(10);
  });
  it("非有限値は例外", () => {
    const glow = createGlowPoints({ capacity: 10 });
    expect(() => glow.setVisibleCount(Number.NaN)).toThrow();
    expect(() => glow.setVisibleCount(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("createGlowPoints の commit", () => {
  it("commit() と commit({}) は行列と色の両方を確定する", () => {
    const glow = createGlowPoints({ capacity: 4 });
    let matrixVersion = glow.object.instanceMatrix.version;
    let colorVersion = glow.object.instanceColor!.version;
    glow.commit();
    expect(glow.object.instanceMatrix.version).toBeGreaterThan(matrixVersion);
    expect(glow.object.instanceColor!.version).toBeGreaterThan(colorVersion);

    matrixVersion = glow.object.instanceMatrix.version;
    colorVersion = glow.object.instanceColor!.version;
    glow.commit({});
    expect(glow.object.instanceMatrix.version).toBeGreaterThan(matrixVersion);
    expect(glow.object.instanceColor!.version).toBeGreaterThan(colorVersion);
  });

  it("commit({ matrix: false }) は色だけを確定する", () => {
    const glow = createGlowPoints({ capacity: 4 });
    const matrixVersion = glow.object.instanceMatrix.version;
    const colorVersion = glow.object.instanceColor!.version;
    glow.commit({ matrix: false });
    expect(glow.object.instanceMatrix.version).toBe(matrixVersion);
    expect(glow.object.instanceColor!.version).toBeGreaterThan(colorVersion);
  });
});

describe("createGlowPoints の dispose", () => {
  it("二度呼んでも例外を投げない（冪等）", () => {
    const glow = createGlowPoints({ capacity: 4 });
    expect(() => {
      glow.dispose();
      glow.dispose();
    }).not.toThrow();
  });
  it("注入した材質は基盤が解放しない（呼び手責任）", () => {
    const injected = new MeshStandardMaterial();
    let disposed = false;
    injected.addEventListener("dispose", () => {
      disposed = true;
    });
    const glow = createGlowPoints({ capacity: 4, geometry: new SphereGeometry(0.18, 8, 8), material: injected });
    glow.dispose();
    expect(disposed).toBe(false);
  });
});
