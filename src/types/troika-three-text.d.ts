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
    // 縁取り（stroke）。文字輪郭の中心線に沿う線。可読性の縁取りに使う（Issue #31）。
    strokeWidth: number | string;
    strokeColor: number | string | Color;
    strokeOpacity: number;
    /** 文字間隔（em単位）。単一 Text 内の字間を広げる。 */
    letterSpacing: number;
    // 影（outline）。文字の背面に重ねる複製。ずれとぼかしで影、ずれなしで縁取りの代替に使う（Issue #31）。
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    outlineOpacity: number;
    outlineOffsetX: number | string;
    outlineOffsetY: number | string;
    outlineBlur: number | string;
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
    /**
     * 配置確定（sync）の完了後に得られる文字計測。配置確定前は null。
     * 本体が使うのは visibleBounds（可視グリフに密着した範囲、[最小X, 最小Y, 最大X, 最大Y]、
     * フォントサイズで尺度済みのローカル世界座標）のみのため、これだけを宣言する（未使用のメンバは宣言しない方針）。
     */
    textRenderInfo: { visibleBounds: readonly [number, number, number, number] } | null;
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
