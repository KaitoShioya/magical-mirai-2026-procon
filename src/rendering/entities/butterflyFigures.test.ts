import { describe, expect, it } from "vitest";
import { DoubleSide, DynamicDrawUsage, type InstancedBufferAttribute } from "three";
import { createButterflyFigures, type ButterflySpawnInput } from "./butterflyFigures";
import { GLOW_NEON_RGB } from "../constants";

// InstancedMesh と InstancedBufferAttribute は WebGL を必要とせず node で構築でき、行列・色・位相の配列を
// 読み戻せる。本テストは描画器には触れず、これらの配列だけを検証する。シェーダの実コンパイルは実ブラウザ
// スモーク（scripts/rendering-butterfly-smoke.mjs）が確認する。

// 上昇・横揺れを止め、寿命中盤（フェード=1）で値を確かめるための基本入力。
function baseInput(overrides: Partial<ButterflySpawnInput>): ButterflySpawnInput {
  return {
    position: { x: 0, y: 0, z: 0 },
    scale: 1,
    brightness: 1,
    lifeSeconds: 1,
    flapPhase: 0,
    riseSpeed: 0,
    swayPhase: 0,
    swayAmplitude: 0,
    ...overrides,
  };
}

function translationAt(fig: ReturnType<typeof createButterflyFigures>, index: number) {
  const m = fig.object.instanceMatrix.array;
  const b = index * 16;
  return { x: m[b + 12], y: m[b + 13], z: m[b + 14], scale: m[b + 0] };
}

function colorAt(fig: ReturnType<typeof createButterflyFigures>, index: number) {
  const c = fig.object.instanceColor!.array;
  const b = index * 3;
  return { r: c[b + 0], g: c[b + 1], b: c[b + 2] };
}

function phaseAttr(fig: ReturnType<typeof createButterflyFigures>): InstancedBufferAttribute {
  return fig.object.geometry.getAttribute("aBflyPhase") as InstancedBufferAttribute;
}

function phaseAt(fig: ReturnType<typeof createButterflyFigures>, index: number): number {
  return phaseAttr(fig).array[index] as number;
}

describe("createButterflyFigures の構造", () => {
  it("単一の InstancedMesh、両面・トーンマップ無効の材質、視錐台カリング無効", () => {
    const fig = createButterflyFigures({ capacity: 8 });
    expect(fig.object.isInstancedMesh).toBe(true);
    expect(fig.capacity).toBe(8);
    expect(fig.object.frustumCulled).toBe(false);
    const material = fig.object.material as { toneMapped: boolean; side: number };
    expect(material.toneMapped).toBe(false);
    expect(material.side).toBe(DoubleSide);
  });

  it("生成直後は活動0・描画0・色は黒、行列と位相は動的転送設定", () => {
    const fig = createButterflyFigures({ capacity: 4 });
    expect(fig.activeCount()).toBe(0);
    expect(fig.object.count).toBe(0);
    const colors = fig.object.instanceColor!.array;
    for (let i = 0; i < colors.length; i += 1) {
      expect(colors[i]).toBe(0);
    }
    expect(fig.object.instanceMatrix.usage).toBe(DynamicDrawUsage);
    const phase = phaseAttr(fig);
    expect(phase.count).toBe(4);
    expect(phase.usage).toBe(DynamicDrawUsage);
  });

  it("容量が正の整数でなければ例外", () => {
    expect(() => createButterflyFigures({ capacity: 0 })).toThrow();
    expect(() => createButterflyFigures({ capacity: -2 })).toThrow();
    expect(() => createButterflyFigures({ capacity: 2.5 })).toThrow();
  });
});

describe("createButterflyFigures の spawn", () => {
  it("空きがあれば確保して true、活動数と描画数が増える", () => {
    const fig = createButterflyFigures({ capacity: 3 });
    expect(fig.spawn(baseInput({}))).toBe(true);
    expect(fig.activeCount()).toBe(1);
    expect(fig.object.count).toBe(1);
  });

  it("容量を超える spawn は false（例外ではない）", () => {
    const fig = createButterflyFigures({ capacity: 2 });
    expect(fig.spawn(baseInput({}))).toBe(true);
    expect(fig.spawn(baseInput({}))).toBe(true);
    expect(fig.spawn(baseInput({}))).toBe(false);
    expect(fig.activeCount()).toBe(2);
  });

  it("不正値（非有限・負の大きさ・寿命0以下）は例外", () => {
    const fig = createButterflyFigures({ capacity: 4 });
    expect(() => fig.spawn(baseInput({ position: { x: Number.NaN, y: 0, z: 0 } }))).toThrow();
    expect(() => fig.spawn(baseInput({ scale: -1 }))).toThrow();
    expect(() => fig.spawn(baseInput({ brightness: -0.1 }))).toThrow();
    expect(() => fig.spawn(baseInput({ lifeSeconds: 0 }))).toThrow();
  });
});

describe("createButterflyFigures の update（値の反映）", () => {
  it("寿命中盤で 位置・大きさ・色（ネオンブルー×輝度）を書く", () => {
    const fig = createButterflyFigures({ capacity: 4 });
    fig.spawn(baseInput({ position: { x: 1, y: 2, z: 3 }, scale: 0.5, brightness: 2, flapPhase: 0.42 }));
    // 寿命1秒に対し0.2秒進めるとフェード=1（立ち上がり0.15を過ぎ、消滅0.6の手前）。
    fig.update(0.2);
    const t = translationAt(fig, 0);
    expect(t.x).toBeCloseTo(1, 5);
    expect(t.y).toBeCloseTo(2, 5);
    expect(t.z).toBeCloseTo(3, 5);
    expect(t.scale).toBeCloseTo(0.5, 5);
    const c = colorAt(fig, 0);
    expect(c.r).toBeCloseTo(GLOW_NEON_RGB[0] * 2, 5);
    expect(c.g).toBeCloseTo(GLOW_NEON_RGB[1] * 2, 5);
    expect(c.b).toBeCloseTo(GLOW_NEON_RGB[2] * 2, 5);
    expect(phaseAt(fig, 0)).toBeCloseTo(0.42, 5);
  });

  it("上昇速度が正なら高さ（y）が増える", () => {
    const fig = createButterflyFigures({ capacity: 4 });
    fig.spawn(baseInput({ position: { x: 0, y: 0, z: 0 }, riseSpeed: 1.5 }));
    fig.update(0.2);
    const t = translationAt(fig, 0);
    expect(t.y).toBeCloseTo(1.5 * 0.2, 5);
  });
});

describe("createButterflyFigures の swap-remove（3配列の整合）", () => {
  it("中央個体の満了で末尾個体が索引へ移り、行列・色・位相が一致して入れ替わる", () => {
    const fig = createButterflyFigures({ capacity: 3 });
    // A(索引0,長寿命) / B(索引1,短寿命) / C(索引2,長寿命) を発生。位置・輝度・位相を区別する。
    fig.spawn(baseInput({ position: { x: 1, y: 2, z: 3 }, scale: 0.5, brightness: 1, lifeSeconds: 1, flapPhase: 0.11 }));
    fig.spawn(baseInput({ position: { x: 9, y: 9, z: 9 }, scale: 1, brightness: 1, lifeSeconds: 0.1, flapPhase: 0.22 }));
    fig.spawn(baseInput({ position: { x: 4, y: 5, z: 6 }, scale: 0.8, brightness: 1.5, lifeSeconds: 1, flapPhase: 0.33 }));

    const matrixVersionBefore = fig.object.instanceMatrix.version;
    const colorVersionBefore = fig.object.instanceColor!.version;
    const phaseVersionBefore = phaseAttr(fig).version;

    // 0.2秒進めると B(寿命0.1)が満了し、A・C(寿命1)はフェード=1で残る。
    fig.update(0.2);

    expect(fig.object.count).toBe(2);
    expect(fig.activeCount()).toBe(2);

    // 索引1には末尾だった C が移っている（位置・大きさ・色・位相が C のもの）。
    const t1 = translationAt(fig, 1);
    expect(t1.x).toBeCloseTo(4, 5);
    expect(t1.y).toBeCloseTo(5, 5);
    expect(t1.z).toBeCloseTo(6, 5);
    expect(t1.scale).toBeCloseTo(0.8, 5);
    const c1 = colorAt(fig, 1);
    expect(c1.r).toBeCloseTo(GLOW_NEON_RGB[0] * 1.5, 5);
    expect(c1.b).toBeCloseTo(GLOW_NEON_RGB[2] * 1.5, 5);
    expect(phaseAt(fig, 1)).toBeCloseTo(0.33, 5);

    // 索引0は A のまま。
    const t0 = translationAt(fig, 0);
    expect(t0.x).toBeCloseTo(1, 5);
    expect(phaseAt(fig, 0)).toBeCloseTo(0.11, 5);

    // 3配列の版が進む（GPUへ再転送される）。
    expect(fig.object.instanceMatrix.version).toBeGreaterThan(matrixVersionBefore);
    expect(fig.object.instanceColor!.version).toBeGreaterThan(colorVersionBefore);
    expect(phaseAttr(fig).version).toBeGreaterThan(phaseVersionBefore);
  });

  it("全個体が満了すると活動0・描画0になる", () => {
    const fig = createButterflyFigures({ capacity: 3 });
    fig.spawn(baseInput({ lifeSeconds: 0.1 }));
    fig.spawn(baseInput({ lifeSeconds: 0.1 }));
    fig.update(0.2);
    expect(fig.activeCount()).toBe(0);
    expect(fig.object.count).toBe(0);
  });
});

describe("createButterflyFigures の dispose", () => {
  it("二度呼んでも例外を投げない（冪等）。dispose後の update は無処理", () => {
    const fig = createButterflyFigures({ capacity: 4 });
    fig.spawn(baseInput({}));
    expect(() => {
      fig.dispose();
      fig.dispose();
      fig.update(0.1);
    }).not.toThrow();
  });
});
