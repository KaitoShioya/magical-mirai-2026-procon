// troika-three-text は型を同梱しないため、本体が実際に使うメンバに限り宣言する。
// THREE.Object3D を継承するため、position / scale / quaternion / visible などは継承で得られる
// （scene.add(text) も Object3D として成立する）。未使用のメンバは宣言しない。
// 宣言した識別子が 0.52.4 の実体に存在することは troikaExports.test.ts で実行時に確認する。
declare module "troika-three-text" {
  import { Object3D, Color, Material } from "three";

  export class Text extends Object3D {
    text: string;
    /** フォントファイルのURL。null のとき troika の既定フォントを使う。対応形式は .ttf / .otf / .woff（.woff2 は非対応）。 */
    font: string | null;
    fontSize: number;
    color: number | string | Color;
    /** 塗りの不透明度（0から1）。 */
    fillOpacity: number;
    /** 文字間隔（em単位）。単一 Text 内の字間を広げる。 */
    letterSpacing: number;
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    anchorX: number | string;
    anchorY: number | string;
    /** 距離場の解像度（2の冪）。既定は64。大きいほど角・細線が鮮鋭だがメモリと生成時間が増える。 */
    sdfGlyphSize: number | null;
    /** 距離場の生成をGPUで加速するか。既定は true。 */
    gpuAccelerateSDF: boolean;
    /** 文字に割り当てられたマテリアル。 */
    material: Material;
    /** 基材から文字描画用の派生マテリアルを作る。サブクラスで上書きして変形層を重ねられる。 */
    createDerivedMaterial(baseMaterial: Material): Material;
    /** 文字の配置を確定する。troika は非同期に文字を組むため呼び出しが必要。 */
    sync(callback?: () => void): void;
    /** ジオメトリ・マテリアル等のGPU資源を解放する。 */
    dispose(): void;
  }

  /** 多数の Text を1回の描画命令にまとめる一括描画クラス（0.50.0 で追加）。 */
  export class BatchedText extends Text {
    /** メンバの Text を追加する。 */
    addText(text: Text): void;
    /** メンバの Text を取り除く。 */
    removeText(text: Text): void;
  }

  /**
   * 指定した文字の符号付き距離場（距離場）を事前生成して暖める。
   * font は対応形式（.ttf / .otf / .woff）のURL、characters は事前生成する文字、
   * sdfGlyphSize は距離場の解像度。完了時に callback を呼ぶ。
   */
  export function preloadFont(
    options: { font?: string | null; characters?: string | string[]; sdfGlyphSize?: number },
    callback: () => void
  ): void;

  /** 文字描画マテリアルから派生マテリアルを作る（頂点シェーダへの計算差し込みに使う）。 */
  export function createTextDerivedMaterial(baseMaterial: Material): Material;
}
