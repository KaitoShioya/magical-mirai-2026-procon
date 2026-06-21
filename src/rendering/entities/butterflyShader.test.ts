import { describe, expect, it } from "vitest";
import { DoubleSide, type MeshBasicMaterial } from "three";
import {
  BUTTERFLY_VERTEX_DEFS,
  buildButterflyVertexTransform,
  createButterflyMaterial,
} from "./butterflyShader";
import { BUTTERFLY_FLAP_AMPLITUDE, BUTTERFLY_FLAP_SPEED } from "../constants";

// シェーダは node でコンパイルされないため、本テストは GLSL 文字列の内容とマテリアルの設定値のみを検証する。
// 実コンパイルと実描画は実ブラウザスモーク（scripts/rendering-butterfly-smoke.mjs）で確認する。

describe("BUTTERFLY_VERTEX_DEFS の宣言", () => {
  it("時間・羽ばたき速度・羽ばたき振幅のユニフォームを宣言する", () => {
    expect(BUTTERFLY_VERTEX_DEFS).toContain("uniform float uBflyTimeSec;");
    expect(BUTTERFLY_VERTEX_DEFS).toContain("uniform float uBflyFlapSpeed;");
    expect(BUTTERFLY_VERTEX_DEFS).toContain("uniform float uBflyFlapAmplitude;");
  });

  it("独自属性（個体位相・翅符号・翅の胴軸からの距離）を明示宣言する", () => {
    expect(BUTTERFLY_VERTEX_DEFS).toContain("attribute float aBflyPhase;");
    expect(BUTTERFLY_VERTEX_DEFS).toContain("attribute float aBflyWingSign;");
    expect(BUTTERFLY_VERTEX_DEFS).toContain("attribute float aBflyWingSpan;");
  });
});

describe("buildButterflyVertexTransform のGLSL", () => {
  it("独自属性とユニフォームを使い、胴軸まわりの回転（position.xz と mat2）を含む", () => {
    const glsl = buildButterflyVertexTransform();
    expect(glsl).toContain("aBflyPhase");
    expect(glsl).toContain("aBflyWingSign");
    expect(glsl).toContain("aBflyWingSpan");
    expect(glsl).toContain("uBflyTimeSec");
    expect(glsl).toContain("position.xz");
    expect(glsl).toContain("mat2(");
  });
});

describe("createButterflyMaterial の設定", () => {
  it("羽ばたきの3ユニフォームを定数の初期値で持つ", () => {
    const handle = createButterflyMaterial();
    const uniforms = handle.material.uniforms;
    expect(uniforms.uBflyTimeSec.value).toBe(0);
    expect(uniforms.uBflyFlapSpeed.value).toBe(BUTTERFLY_FLAP_SPEED);
    expect(uniforms.uBflyFlapAmplitude.value).toBe(BUTTERFLY_FLAP_AMPLITUDE);
    handle.dispose();
  });

  it("setTimeSec で経過秒ユニフォームを更新する", () => {
    const handle = createButterflyMaterial();
    handle.setTimeSec(2.5);
    expect(handle.material.uniforms.uBflyTimeSec.value).toBe(2.5);
    handle.dispose();
  });

  it("基材は白・トーンマップ無効・両面（色×輝度の経路とブルームと裏面表示のため）", () => {
    const handle = createButterflyMaterial();
    // 派生マテリアルは基材の MeshBasicMaterial の見た目を引き継ぐ。型は DerivedMaterial で color を露出しないため
    // MeshBasicMaterial として参照する。
    const material = handle.material as unknown as MeshBasicMaterial;
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.toneMapped).toBe(false);
    expect(material.side).toBe(DoubleSide);
    handle.dispose();
  });
});
