// 蝶の羽ばたきの頂点シェーダ（Issue #61）。既存 src/typography/kineticText/deformMaterial.ts と同じく
// troika-three-utils の createDerivedMaterial で MeshBasicMaterial の頂点シェーダに変形と時間ユニフォームを
// 注入する。胴軸（y 軸）まわりに翅を回し、個体ごとの位相 aBflyPhase でずらして同期した不自然さを避ける。
//
// 独自属性の宣言方針: three.js は position・normal・uv などの標準頂点属性のみを自動宣言し、aBflyWingSign の
// ような独自の頂点属性とインスタンス属性は自動宣言しないため、GLSL から参照する独自属性は vertexDefs で
// 明示宣言する。万一 three.js または troika が同名を別途宣言して二重宣言になった場合は、宣言を外すのではなく
// 属性名をさらに固有化して衝突を避ける（宣言を外すと未宣言参照のエラーに転ぶため）。実コンパイルは診断ページの
// 実ブラウザスモークで確認する（node 環境はシェーダをコンパイルしない）。

import { MeshBasicMaterial, DoubleSide } from "three";
import { createDerivedMaterial, type DerivedMaterial } from "troika-three-utils";
import { BUTTERFLY_FLAP_AMPLITUDE, BUTTERFLY_FLAP_SPEED } from "../constants";

// 大域宣言。時間・羽ばたき速度・羽ばたき振幅のユニフォームと、独自属性（個体位相・翅符号・翅の胴軸からの距離）。
export const BUTTERFLY_VERTEX_DEFS = `
uniform float uBflyTimeSec;
uniform float uBflyFlapSpeed;
uniform float uBflyFlapAmplitude;
attribute float aBflyPhase;
attribute float aBflyWingSign;
attribute float aBflyWingSpan;
`;

/**
 * 羽ばたきの頂点変形の GLSL を組み立てる純粋関数（文字列を返し単体テストで内容を検査する）。
 * 翅を胴軸（y 軸）まわりに回す。胴（aBflyWingSign が0）は回さない。回転角は翅端ほど大きく（aBflyWingSpan）、
 * 個体ごとの位相 aBflyPhase でずらした正弦で開閉する。
 */
export function buildButterflyVertexTransform(): string {
  return `
    float bflyFlap = sin(uBflyTimeSec * uBflyFlapSpeed + aBflyPhase);
    float bflyAngle = aBflyWingSign * aBflyWingSpan * uBflyFlapAmplitude * bflyFlap;
    float bflyS = sin(bflyAngle);
    float bflyC = cos(bflyAngle);
    position.xz = mat2(bflyC, -bflyS, bflyS, bflyC) * position.xz;
  `;
}

/** 羽ばたきマテリアルの取っ手。時間ユニフォームの更新と資源解放を持つ。 */
export interface ButterflyMaterialHandle {
  readonly material: DerivedMaterial;
  /** 羽ばたきの経過秒を設定する。エンティティが update で累積秒を渡す。 */
  setTimeSec(sec: number): void;
  /** 基材を破棄する（派生マテリアルもこの破棄に連鎖して解放される）。 */
  dispose(): void;
}

/**
 * 蝶の羽ばたきマテリアルを作る。基材は白の MeshBasicMaterial（toneMapped 無効・両面）。
 * 採用理由を先に述べる。白でないと instanceColor に書いた色が乗らず、toneMapped 無効でないとブルームの
 * しきい値判定の前に減光する（entities/glowPoints.ts と同一根拠）。翅は薄い両面の面のため DoubleSide で
 * 裏側から見ても消えないようにする。
 */
export function createButterflyMaterial(): ButterflyMaterialHandle {
  const base = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: DoubleSide });
  const material = createDerivedMaterial(base, {
    chained: true,
    uniforms: {
      uBflyTimeSec: { value: 0 },
      uBflyFlapSpeed: { value: BUTTERFLY_FLAP_SPEED },
      uBflyFlapAmplitude: { value: BUTTERFLY_FLAP_AMPLITUDE },
    },
    vertexDefs: BUTTERFLY_VERTEX_DEFS,
    vertexTransform: buildButterflyVertexTransform(),
  });

  return {
    material,
    setTimeSec(sec: number): void {
      material.uniforms.uBflyTimeSec.value = sec;
    },
    dispose(): void {
      material.dispose();
    },
  };
}
