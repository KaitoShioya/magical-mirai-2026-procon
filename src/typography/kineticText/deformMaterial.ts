// 頂点シェーダで各文字の矩形を使い、1つの Text 単位の全グリフをまとめて変形する仕組みを作る。
// この仕組みは troika-three-text の Text 専用である（各文字の矩形を表す頂点属性 aTroikaGlyphBounds に依存する）。
//
// 注入の構造（troika の BatchedText の作り方に倣う「挟み込み」）:
//   位置の変形は troika の矩形展開後の配置済みグリフ座標に対して行う必要があるため、基材側の層（最後に実行）で行う。
//   一方、各文字の矩形 aTroikaGlyphBounds は troika の文字マテリアル（外側）が宣言するので、基材側の層からは
//   GLSL の宣言順の制約で参照できない（派生の宣言は内側の層が先・外側の層が後に並び、使用は宣言より後に置く必要が
//   あるため、内側＝基材側の層から外側＝troika の宣言は見えない）。
//   そこで、文字マテリアルのさらに外側に「取り込み層」を足す。取り込み層は aTroikaGlyphBounds を参照でき、各文字の
//   中心を共有グローバル変数 gDeformGlyphCenter へ書き込む。基材側の層はこの共有グローバルを読んで変形する。
//   実行順は「取り込み層（中心を書く）→ troika（矩形展開）→ 基材側の層（中心を読んで変形）」となる。
//   共有グローバルは基材側の層の宣言（最初に並ぶ）で宣言するため、取り込み層からも基材側の層からも参照できる。
import { MeshBasicMaterial, DoubleSide, Vector2, type Material } from "three";
import { Text } from "troika-three-text";
import { createDerivedMaterial, type DerivedMaterial } from "troika-three-utils";
import type { DeformKind, DeformParams } from "./types";

/** 変形マテリアル（基材側の層）の取っ手。ユニフォームの更新と資源解放を持つ。 */
export interface DeformMaterialHandle {
  readonly material: DerivedMaterial;
  /** 経過時間（秒）を設定する。エンジンが毎フレーム gameTimeMs / 1000 を渡す。 */
  setTimeSec(sec: number): void;
  /** 変形パラメータを更新する。 */
  setParams(params: DeformParams): void;
  /** 基材を破棄する。troika が被せた文字マテリアルもこの破棄に連鎖して解放される。 */
  dispose(): void;
}

/** 変形テキストの部品。変形を仕込んだ troika Text と、時間・パラメータ更新・解放を持つ。 */
export interface DeformingTextUnit {
  readonly text: Text;
  setTimeSec(sec: number): void;
  setParams(params: DeformParams): void;
  dispose(): void;
}

// 基材側の層の大域宣言。共有グローバル gDeformGlyphCenter と変形のユニフォームを宣言する。
// aTroikaGlyphBounds は troika 側の宣言を使うためここには書かない（重ね宣言は GLSL のコンパイル誤りになる）。
const DEFORM_BASE_DEFS = `
vec2 gDeformGlyphCenter = vec2(0.0);
uniform float uDeformTimeSec;
uniform float uDeformStrength;
uniform float uDeformSpeed;
uniform float uDeformSpatialFreq;
uniform float uDeformPhaseOffset;
uniform vec2 uDeformOrigin;
`;

// 取り込み層の頂点変形。各文字の中心を共有グローバルへ書く（aTroikaGlyphBounds は troika が宣言済み）。
export const CAPTURE_DEFORM_TRANSFORM = `
gDeformGlyphCenter = mix(aTroikaGlyphBounds.xy, aTroikaGlyphBounds.zw, vec2(0.5));
`;

/**
 * 種類ごとの基材側の頂点変形のGLSLを組み立てる純粋関数。
 * position は troika の矩形展開後の配置済みグリフ座標（文字ローカル座標系）。
 */
export function buildBaseDeformTransform(kind: DeformKind): string {
  if (kind === "swirl") {
    // 渦: 変形中心 uDeformOrigin からの距離 r に応じて回転角を変え、中心まわりに回す（半径依存回転）。
    return `
      vec2 d = position.xy - uDeformOrigin;
      float r = length(d);
      float angle = uDeformStrength * sin(uDeformTimeSec * uDeformSpeed + r * uDeformSpatialFreq + uDeformPhaseOffset);
      float sinA = sin(angle);
      float cosA = cos(angle);
      position.xy = uDeformOrigin + mat2(cosA, -sinA, sinA, cosA) * d;
    `;
  }
  // 波打ち: 各文字の中心（取り込み層が書いた gDeformGlyphCenter）の横位置に応じて縦方向へ周期変位を加える。
  return `
    position.y += uDeformStrength * sin(uDeformTimeSec * uDeformSpeed + gDeformGlyphCenter.x * uDeformSpatialFreq + uDeformPhaseOffset);
  `;
}

/**
 * 渦・波打ちの基材マテリアルを作る（内部用の低レベル関数）。基材の見えは troika の既定（白・両面・半透明）に揃える。
 * 注意: 波打ちは各文字の中心 gDeformGlyphCenter を取り込み層が書く前提である。このマテリアルだけを普通の Text に
 * 渡しても取り込み層が無く全文字が既定中心 (0,0) で同位相に揺れる。通常の利用は createDeformingTextUnit を使う。
 */
export function createDeformMaterial(kind: DeformKind, params: DeformParams): DeformMaterialHandle {
  // troika の既定マテリアル（Text.js）に揃える。色と不透明度は troika が text.color / text.fillOpacity から
  // ユニフォームへ流すため、ここでは設定しない。
  const base = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, transparent: true });
  const material = createDerivedMaterial(base, {
    chained: true,
    uniforms: {
      uDeformTimeSec: { value: 0 },
      uDeformStrength: { value: params.strength },
      uDeformSpeed: { value: params.speed },
      uDeformSpatialFreq: { value: params.spatialFreq },
      uDeformPhaseOffset: { value: params.phaseOffset },
      uDeformOrigin: { value: new Vector2(params.originX ?? 0, params.originY ?? 0) },
    },
    vertexDefs: DEFORM_BASE_DEFS,
    vertexTransform: buildBaseDeformTransform(kind),
  });

  return {
    material,
    setTimeSec(sec: number): void {
      material.uniforms.uDeformTimeSec.value = sec;
    },
    setParams(next: DeformParams): void {
      material.uniforms.uDeformStrength.value = next.strength;
      material.uniforms.uDeformSpeed.value = next.speed;
      material.uniforms.uDeformSpatialFreq.value = next.spatialFreq;
      material.uniforms.uDeformPhaseOffset.value = next.phaseOffset;
      (material.uniforms.uDeformOrigin.value as Vector2).set(next.originX ?? 0, next.originY ?? 0);
    },
    dispose(): void {
      material.dispose();
    },
  };
}

// 取り込み層を足す troika Text。material 取得時に「troika 文字マテリアル → 取り込み層」を被せる。
class DeformingTextMesh extends Text {
  override createDerivedMaterial(baseMaterial: Material): Material {
    const textMaterial = super.createDerivedMaterial(baseMaterial);
    return createDerivedMaterial(textMaterial, {
      chained: true,
      vertexTransform: CAPTURE_DEFORM_TRANSFORM,
    });
  }
}

/** 変形を仕込んだ troika Text の部品を作る。基材を取り込み層で包み、ユニフォーム更新と解放を提供する。 */
export function createDeformingTextUnit(kind: DeformKind, params: DeformParams): DeformingTextUnit {
  const handle = createDeformMaterial(kind, params);
  const text = new DeformingTextMesh();
  // 基材を代入する。material 取得時に DeformingTextMesh が troika 文字マテリアルと取り込み層を被せる。
  text.material = handle.material;
  let disposed = false;
  return {
    text,
    setTimeSec: handle.setTimeSec,
    setParams: handle.setParams,
    // 解放はこの1か所に集約する。ジオメトリ（text.dispose）と基材（handle.dispose、troika 派生・取り込み層へ連鎖）を
    // 破棄する。冪等にして、二度目以降の呼び出しでは何もしない（直接利用での二重破棄を無害にする）。
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      text.dispose();
      handle.dispose();
    },
  };
}
