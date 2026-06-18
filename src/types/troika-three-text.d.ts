// troika-three-text は型を同梱しないため、描画性能検証ツールが実際に使うメンバに限り宣言する。
// THREE.Object3D を継承するため、position / scale / quaternion などは継承で得られる
// （scene.add(text) も Object3D として成立する）。未使用のメンバは宣言しない。
declare module "troika-three-text" {
  import { Object3D, Color } from "three";

  export class Text extends Object3D {
    text: string;
    fontSize: number;
    color: number | string | Color;
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    anchorX: number | string;
    anchorY: number | string;
    /** 文字の配置を確定する。troika は非同期に文字を組むため呼び出しが必要 */
    sync(callback?: () => void): void;
    /** ジオメトリ・マテリアル等のGPU資源を解放する */
    dispose(): void;
  }
}
