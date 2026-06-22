import { describe, expect, it } from "vitest";
import { Color, Matrix4, Quaternion, Vector3 } from "three";
import { createSunflowerFigures } from "./sunflowerFigures";
import { reactionToBrightness, reactionToScale } from "./sunflowerReactionMapping";
import { SUNFLOWER_SEED_COUNT, SUNFLOWER_SEED_COUNT_HIGH } from "../constants";

// InstancedMesh の行列・色は CPU 側の配列に書かれ WebGL を要しないため、node で設定して読み戻せる。
// 本テストは描画器に触れず、容量・反応強度の写像・可視数の正規化・後始末・単一メッシュ構成を検証する。

describe("createSunflowerFigures の構成", () => {
  it("単一の InstancedMesh で、容量を保持し、索引付きジオメトリと頂点色を持つ", () => {
    const fig = createSunflowerFigures({ capacity: 8 });
    expect(fig.object.isInstancedMesh).toBe(true);
    expect(fig.capacity).toBe(8);
    expect(fig.object.geometry.getIndex()).not.toBeNull();
    expect(fig.object.geometry.getAttribute("color")).toBeTruthy();
    fig.dispose();
  });

  it("生成直後は何も描かない（描画個体数0）", () => {
    const fig = createSunflowerFigures({ capacity: 4 });
    expect(fig.object.count).toBe(0);
    fig.dispose();
  });

  it("既定は標準の種数、高品質は高い種数を使う", () => {
    const standard = createSunflowerFigures({ capacity: 2 });
    const high = createSunflowerFigures({ capacity: 2, highQuality: true });
    expect(standard.metrics.seedCount).toBe(SUNFLOWER_SEED_COUNT);
    expect(high.metrics.seedCount).toBe(SUNFLOWER_SEED_COUNT_HIGH);
    standard.dispose();
    high.dispose();
  });

  it("中心花弁比率は0と1の間にある", () => {
    const fig = createSunflowerFigures({ capacity: 2 });
    expect(fig.metrics.centerPetalRatio).toBeGreaterThan(0);
    expect(fig.metrics.centerPetalRatio).toBeLessThan(1);
    fig.dispose();
  });
});

describe("createSunflowerFigures の反応強度の写像", () => {
  it("setInstance が大きさ強度・輝度強度を大きさ（等方スケール）と輝度（インスタンス色）へ写像する", () => {
    const fig = createSunflowerFigures({ capacity: 2 });
    const sizeStrength = 0.4;
    const brightnessStrength = 0.7;
    fig.setInstance(0, { position: { x: 1, y: 2, z: 3 }, sizeStrength, brightnessStrength });
    fig.setVisibleCount(1);
    fig.commit();

    const matrix = new Matrix4();
    fig.object.getMatrixAt(0, matrix);
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    matrix.decompose(position, quaternion, scale);
    expect(position.x).toBeCloseTo(1, 5);
    expect(position.y).toBeCloseTo(2, 5);
    expect(position.z).toBeCloseTo(3, 5);
    const expectedScale = reactionToScale(sizeStrength);
    expect(scale.x).toBeCloseTo(expectedScale, 5);
    expect(scale.y).toBeCloseTo(expectedScale, 5);
    expect(scale.z).toBeCloseTo(expectedScale, 5);

    // 基準色は白で渡すため、インスタンス色は輝度がそのまま各成分に乗る（[1,1,1]×輝度）。
    const color = new Color();
    fig.object.getColorAt(0, color);
    const expectedBrightness = reactionToBrightness(brightnessStrength);
    expect(color.r).toBeCloseTo(expectedBrightness, 5);
    expect(color.g).toBeCloseTo(expectedBrightness, 5);
    expect(color.b).toBeCloseTo(expectedBrightness, 5);
    fig.dispose();
  });

  it("大きさ強度が大きいほど等方スケールが大きい（単調）", () => {
    const fig = createSunflowerFigures({ capacity: 2 });
    fig.setInstance(0, { position: { x: 0, y: 0, z: 0 }, sizeStrength: 0.2, brightnessStrength: 0.5 });
    fig.setInstance(1, { position: { x: 0, y: 0, z: 0 }, sizeStrength: 0.8, brightnessStrength: 0.5 });
    const m0 = new Matrix4();
    const m1 = new Matrix4();
    fig.object.getMatrixAt(0, m0);
    fig.object.getMatrixAt(1, m1);
    const s0 = new Vector3();
    const s1 = new Vector3();
    m0.decompose(new Vector3(), new Quaternion(), s0);
    m1.decompose(new Vector3(), new Quaternion(), s1);
    expect(s1.x).toBeGreaterThan(s0.x);
    fig.dispose();
  });
});

describe("createSunflowerFigures の可視数と後始末", () => {
  it("可視数は0以上capacity以下に正規化される", () => {
    const fig = createSunflowerFigures({ capacity: 5 });
    fig.setVisibleCount(100);
    expect(fig.object.count).toBe(5);
    fig.setVisibleCount(-3);
    expect(fig.object.count).toBe(0);
    fig.setVisibleCount(3);
    expect(fig.object.count).toBe(3);
    fig.dispose();
  });

  it("dispose は冪等（複数回呼んでも例外を投げない）", () => {
    const fig = createSunflowerFigures({ capacity: 2 });
    expect(() => {
      fig.dispose();
      fig.dispose();
    }).not.toThrow();
  });

  it("容量が正の整数でないと例外（基盤の検査）", () => {
    expect(() => createSunflowerFigures({ capacity: 0 })).toThrow();
    expect(() => createSunflowerFigures({ capacity: 2.5 })).toThrow();
  });
});
