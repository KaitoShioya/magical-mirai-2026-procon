import { describe, expect, it } from "vitest";
import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { createLanternButterflyFigures } from "./lanternButterflyFigures";
import {
  BUTTERFLY_BASE_PITCH_RADIANS,
  GLOW_NEON_RGB,
  LANTERN_BUTTERFLY_FULL_REVEAL_DISTANCE,
  LANTERN_BUTTERFLY_SCALE_MAX,
  LANTERN_BUTTERFLY_WING_PHASE_STEP,
  PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX,
} from "../constants";

// InstancedMesh の行列・色・インスタンス属性は CPU 側の配列に書かれ WebGL を要しないため、node で設定して読み戻せる。
// 本テストは描画器に触れず、追加・満杯時の不作為・実寸スケール・水平姿勢・翅角の連続位相・輝度上限・近距離フェード・
// 後始末を検証する。

describe("createLanternButterflyFigures の構成と追加", () => {
  it("単一の InstancedMesh で容量を保持し、索引付きジオメトリと翅位相属性を持つ", () => {
    const fig = createLanternButterflyFigures({ capacity: 4 });
    expect(fig.object.isInstancedMesh).toBe(true);
    expect(fig.capacity).toBe(4);
    expect(fig.object.geometry.getIndex()).not.toBeNull();
    expect(fig.object.geometry.getAttribute("aBflyPhase")).toBeTruthy();
    fig.dispose();
  });

  it("生成直後は何も描かず追加数0", () => {
    const fig = createLanternButterflyFigures({ capacity: 4 });
    expect(fig.object.count).toBe(0);
    expect(fig.activeCount()).toBe(0);
    fig.dispose();
  });

  it("インスタンス行列に水平へ寝かせる姿勢回転と実寸スケールが入る（大きさ強度1で上限スケール）", () => {
    const fig = createLanternButterflyFigures({ capacity: 1 });
    fig.add({ position: { x: 1, y: 2, z: 3 }, headingX: 0, headingZ: 0, sizeStrength: 1, brightnessStrength: 0.5, nearFade: false });
    const matrix = new Matrix4();
    fig.object.getMatrixAt(0, matrix);
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    matrix.decompose(position, quaternion, scale);
    // 位置はそのまま。
    expect(position.x).toBeCloseTo(1, 5);
    expect(position.y).toBeCloseTo(2, 5);
    expect(position.z).toBeCloseTo(3, 5);
    // 姿勢は横軸まわりに寝かせる回転（BUTTERFLY_BASE_PITCH_RADIANS）。
    const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
    expect(euler.x).toBeCloseTo(BUTTERFLY_BASE_PITCH_RADIANS, 4);
    // 大きさ強度1で実寸スケールの上限になる（差し渡しは概ねこの2倍）。
    expect(scale.x).toBeCloseTo(LANTERN_BUTTERFLY_SCALE_MAX, 5);
    fig.dispose();
  });

  it("軌道方向（heading）に蝶の胴の前方が向く", () => {
    const fig = createLanternButterflyFigures({ capacity: 1 });
    // 進行方向を +x（headingX=1, headingZ=0）にすると、蝶の胴軸（ローカル+Y）が世界の +x を向く。
    fig.add({ position: { x: 0, y: 0, z: 0 }, headingX: 1, headingZ: 0, sizeStrength: 0.5, brightnessStrength: 0.5, nearFade: false });
    const matrix = new Matrix4();
    fig.object.getMatrixAt(0, matrix);
    const quaternion = new Quaternion();
    matrix.decompose(new Vector3(), quaternion, new Vector3());
    const body = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    expect(body.x).toBeCloseTo(1, 4);
    expect(body.y).toBeCloseTo(0, 4);
    expect(body.z).toBeCloseTo(0, 4);
    fig.dispose();
  });

  it("翅角の位相が配置順で連続的に増える（軌跡上で翅角が連続変化する）", () => {
    const fig = createLanternButterflyFigures({ capacity: 3 });
    for (let i = 0; i < 3; i += 1) {
      fig.add({ position: { x: i, y: 0, z: 0 }, headingX: 0, headingZ: 0, sizeStrength: 0.5, brightnessStrength: 0.5, nearFade: false });
    }
    const phase = fig.object.geometry.getAttribute("aBflyPhase");
    expect(phase.getX(0)).toBeCloseTo(0, 5);
    expect(phase.getX(1)).toBeCloseTo(LANTERN_BUTTERFLY_WING_PHASE_STEP, 5);
    expect(phase.getX(2)).toBeCloseTo(2 * LANTERN_BUTTERFLY_WING_PHASE_STEP, 5);
    fig.dispose();
  });

  it("容量まで add は true、満杯後の add は false で追加数が増えない", () => {
    const fig = createLanternButterflyFigures({ capacity: 2 });
    const input = { position: { x: 0, y: 0, z: 0 }, headingX: 0, headingZ: 0, sizeStrength: 0.5, brightnessStrength: 0.5, nearFade: false };
    expect(fig.add(input)).toBe(true);
    expect(fig.add(input)).toBe(true);
    expect(fig.activeCount()).toBe(2);
    expect(fig.add(input)).toBe(false);
    expect(fig.activeCount()).toBe(2);
    expect(fig.object.count).toBe(2);
    fig.dispose();
  });

  it("輝度は上限 PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX を超えない（強度1で青成分が基準色×上限に一致）", () => {
    const fig = createLanternButterflyFigures({ capacity: 1 });
    fig.add({ position: { x: 0, y: 0, z: 0 }, headingX: 0, headingZ: 0, sizeStrength: 1, brightnessStrength: 1, nearFade: false });
    const color = new Color();
    fig.object.getColorAt(0, color);
    // 通常個体（nearFade=false）は基準輝度で置かれる。基準色の青成分は1.0なので、最終青成分は輝度に等しい。
    expect(color.b).toBeCloseTo(GLOW_NEON_RGB[2] * PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX, 5);
    expect(color.b).toBeLessThanOrEqual(PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX + 1e-6);
    fig.dispose();
  });
});

describe("createLanternButterflyFigures の近距離フェード（退化時の個体のみ）", () => {
  it("近距離フェード対象は、カメラが遠いと基準輝度・近いとほぼ0、update は色のみ反映する", () => {
    const fig = createLanternButterflyFigures({ capacity: 1 });
    fig.add({ position: { x: 0, y: 0, z: 0 }, headingX: 0, headingZ: 0, sizeStrength: 0.5, brightnessStrength: 1, nearFade: true });
    const color = new Color();

    // 追加直後は淡い（輝度0で置く）。
    fig.object.getColorAt(0, color);
    expect(color.b).toBeCloseTo(0, 5);

    // 遠い（上限距離以上）→ 基準輝度。色のみ反映で行列は書き換えない。
    // three.js の BufferAttribute.needsUpdate は書き込み専用（getter が無い）ため読めない。代わりに、needsUpdate=true で
    // 増える version を比較し、色は更新され（version 増加）行列は更新されない（version 不変）ことを確かめる。
    const colorAttr = fig.object.instanceColor;
    expect(colorAttr).not.toBeNull();
    const colorVersionBefore = colorAttr!.version;
    const matrixVersionBefore = fig.object.instanceMatrix.version;
    fig.update({ x: LANTERN_BUTTERFLY_FULL_REVEAL_DISTANCE + 10, y: 0, z: 0 });
    fig.object.getColorAt(0, color);
    expect(color.b).toBeCloseTo(GLOW_NEON_RGB[2] * PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX, 5);
    expect(colorAttr!.version).toBeGreaterThan(colorVersionBefore);
    expect(fig.object.instanceMatrix.version).toBe(matrixVersionBefore);

    // 近い（下限未満）→ ほぼ0。
    fig.update({ x: 0, y: 0, z: 0 });
    fig.object.getColorAt(0, color);
    expect(color.b).toBeCloseTo(0, 5);
    fig.dispose();
  });

  it("近距離フェード対象でない通常個体は update で輝度が変わらない", () => {
    const fig = createLanternButterflyFigures({ capacity: 1 });
    fig.add({ position: { x: 0, y: 0, z: 0 }, headingX: 0, headingZ: 0, sizeStrength: 0.5, brightnessStrength: 1, nearFade: false });
    const before = new Color();
    fig.object.getColorAt(0, before);
    // カメラを至近に置いても通常個体は更新対象でないため不変。
    fig.update({ x: 0, y: 0, z: 0 });
    const after = new Color();
    fig.object.getColorAt(0, after);
    expect(after.b).toBeCloseTo(before.b, 6);
    fig.dispose();
  });
});

describe("createLanternButterflyFigures の初期化と後始末", () => {
  it("reset 後は追加数0・可視数0で、旗の取り残しが無い（reset 後の通常個体は近距離でも淡くならない）", () => {
    const fig = createLanternButterflyFigures({ capacity: 2 });
    // 近距離フェード対象を置いてから reset する。
    fig.add({ position: { x: 0, y: 0, z: 0 }, headingX: 0, headingZ: 0, sizeStrength: 0.5, brightnessStrength: 1, nearFade: true });
    fig.reset();
    expect(fig.activeCount()).toBe(0);
    expect(fig.object.count).toBe(0);
    // reset 後に通常個体（nearFade=false）を追加。旗が残っていなければ近距離 update で淡くならない。
    fig.add({ position: { x: 0, y: 0, z: 0 }, headingX: 0, headingZ: 0, sizeStrength: 0.5, brightnessStrength: 1, nearFade: false });
    const before = new Color();
    fig.object.getColorAt(0, before);
    fig.update({ x: 0, y: 0, z: 0 });
    const after = new Color();
    fig.object.getColorAt(0, after);
    expect(after.b).toBeCloseTo(before.b, 6);
    expect(after.b).toBeGreaterThan(0);
    fig.dispose();
  });

  it("dispose は冪等（複数回呼んでも例外を投げない）", () => {
    const fig = createLanternButterflyFigures({ capacity: 2 });
    expect(() => {
      fig.dispose();
      fig.dispose();
    }).not.toThrow();
  });

  it("容量が正の整数でないと例外", () => {
    expect(() => createLanternButterflyFigures({ capacity: 0 })).toThrow();
    expect(() => createLanternButterflyFigures({ capacity: 2.5 })).toThrow();
  });
});
