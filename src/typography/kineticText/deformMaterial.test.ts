import { describe, it, expect } from "vitest";
import { MeshBasicMaterial, type Vector2 } from "three";
import {
  createDeformMaterial,
  createDeformingTextUnit,
  buildBaseDeformTransform,
  CAPTURE_DEFORM_TRANSFORM,
} from "./deformMaterial";
import type { DeformParams } from "./types";

const baseParams: DeformParams = {
  strength: 0.5,
  speed: 2,
  spatialFreq: 0.3,
  phaseOffset: 0.1,
};

describe("createDeformMaterial のユニフォーム", () => {
  it("変形に使う6個のユニフォームを持ち、パラメータが反映される", () => {
    const handle = createDeformMaterial("swirl", { ...baseParams, originX: 1, originY: 2 });
    const uniforms = handle.material.uniforms;
    expect(uniforms.uDeformTimeSec.value).toBe(0);
    expect(uniforms.uDeformStrength.value).toBe(0.5);
    expect(uniforms.uDeformSpeed.value).toBe(2);
    expect(uniforms.uDeformSpatialFreq.value).toBe(0.3);
    expect(uniforms.uDeformPhaseOffset.value).toBe(0.1);
    const origin = uniforms.uDeformOrigin.value as Vector2;
    expect(origin.x).toBe(1);
    expect(origin.y).toBe(2);
  });

  it("originX・originY を省略すると変形中心は (0,0)（変形単位の中心）になる", () => {
    const handle = createDeformMaterial("swirl", baseParams);
    const origin = handle.material.uniforms.uDeformOrigin.value as Vector2;
    expect(origin.x).toBe(0);
    expect(origin.y).toBe(0);
  });

  it("setTimeSec で経過時間ユニフォームを更新する", () => {
    const handle = createDeformMaterial("wave", baseParams);
    handle.setTimeSec(1.5);
    expect(handle.material.uniforms.uDeformTimeSec.value).toBe(1.5);
  });

  it("setParams で各ユニフォームを更新する", () => {
    const handle = createDeformMaterial("wave", baseParams);
    handle.setParams({ strength: 9, speed: 8, spatialFreq: 7, phaseOffset: 6, originX: 5, originY: 4 });
    const uniforms = handle.material.uniforms;
    expect(uniforms.uDeformStrength.value).toBe(9);
    expect(uniforms.uDeformSpeed.value).toBe(8);
    expect(uniforms.uDeformSpatialFreq.value).toBe(7);
    expect(uniforms.uDeformPhaseOffset.value).toBe(6);
    const origin = uniforms.uDeformOrigin.value as Vector2;
    expect(origin.x).toBe(5);
    expect(origin.y).toBe(4);
  });
});

describe("buildBaseDeformTransform のGLSL組み立て", () => {
  it("渦と波打ちで異なるGLSLを返す", () => {
    const swirl = buildBaseDeformTransform("swirl");
    const wave = buildBaseDeformTransform("wave");
    expect(swirl).not.toBe(wave);
  });

  it("渦は変形中心からの距離による回転を含む", () => {
    const swirl = buildBaseDeformTransform("swirl");
    expect(swirl).toContain("uDeformOrigin");
    expect(swirl).toContain("mat2(cosA, -sinA, sinA, cosA)");
  });

  it("波打ちは取り込み層が書いた各文字の中心 gDeformGlyphCenter を使う", () => {
    const wave = buildBaseDeformTransform("wave");
    expect(wave).toContain("gDeformGlyphCenter");
    expect(wave).toContain("position.y +=");
    // 基材側の層は aTroikaGlyphBounds を参照しない（宣言順の制約で参照できないため取り込み層に委ねる）。
    expect(wave).not.toContain("aTroikaGlyphBounds");
  });

  it("取り込み層は各文字の矩形 aTroikaGlyphBounds から中心を共有グローバルへ書く", () => {
    expect(CAPTURE_DEFORM_TRANSFORM).toContain("aTroikaGlyphBounds");
    expect(CAPTURE_DEFORM_TRANSFORM).toContain("gDeformGlyphCenter");
  });
});

describe("createDeformingTextUnit の構造と解放", () => {
  it("変形部品の Text は troika 文字マテリアルの外側に取り込み層を重ねる", () => {
    // 各文字の中心を渡す取り込み層が確かに被さっていることを確かめる（被さらないと波打ちが全文字同位相に劣化する）。
    // 取り込み層は troika 文字マテリアル（isTroikaTextMaterial 印を持つ）を基材として包む。
    const unit = createDeformingTextUnit("wave", baseParams);
    const derived = unit.text.createDerivedMaterial(new MeshBasicMaterial()) as unknown as {
      baseMaterial?: { isTroikaTextMaterial?: boolean };
    };
    // 取り込み層の1つ内側が troika 文字マテリアル（isTroikaTextMaterial 印を持つ）であることを確かめる。
    // これは取り込み層が troika の上に乗っている証拠である。上書きが外れて取り込み層が消えると、
    // この内側は素の基材になり印を持たないため、この検査が回帰を捉える。
    expect(derived.baseMaterial?.isTroikaTextMaterial).toBe(true);
    unit.dispose();
  });

  it("dispose はジオメトリを破棄し、二度呼んでも一度しか破棄しない（冪等）", () => {
    const unit = createDeformingTextUnit("swirl", baseParams);
    let textDisposeCount = 0;
    const realDispose = unit.text.dispose.bind(unit.text);
    unit.text.dispose = (): void => {
      textDisposeCount += 1;
      realDispose();
    };
    unit.dispose();
    unit.dispose();
    expect(textDisposeCount).toBe(1);
  });
});
