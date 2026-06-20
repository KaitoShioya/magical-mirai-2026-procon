// troika-three-utils は型を同梱しないため、本体が実際に使うメンバに限り宣言する。
// 宣言した識別子が 0.52.4 の実体に存在することは troikaExports.test.ts で実行時に確認する。
declare module "troika-three-utils" {
  import { Material } from "three";

  /** createDerivedMaterial に渡せる選択肢のうち、本体が使うものだけを宣言する。 */
  export interface DerivedMaterialOptions {
    /** 基材を複製せず継承の連鎖を作る（基材の変更を追従する）。 */
    chained?: boolean;
    /** 追加するユニフォーム辞書。値は { value } の形を取る。 */
    uniforms?: Record<string, { value: unknown }>;
    /** 頂点シェーダの大域定義（void main より前に差し込む）。 */
    vertexDefs?: string;
    /** 頂点の position・normal・uv を変形する処理。 */
    vertexTransform?: string;
  }

  /** createDerivedMaterial が返すマテリアル。three の Material にユニフォーム辞書を加えた形。 */
  export interface DerivedMaterial extends Material {
    uniforms: Record<string, { value: unknown }>;
  }

  /** 基材から派生マテリアルを作る（頂点シェーダへの計算差し込みに使う）。 */
  export function createDerivedMaterial(
    baseMaterial: Material,
    options: DerivedMaterialOptions
  ): DerivedMaterial;
}
