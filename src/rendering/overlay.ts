// 2次元層（Issue #15）。3次元の演出世界の上へ、操作情報の2次元の表示物（落下式レーン・音程帯・反応位置の
// 光点など、いずれも後続Issueが載せる）を最前面で重ねるための、正射影カメラと専用シーンと物体登録口を提供する。
// 状態を読んで描く「ビュー」であり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。物体ごとの表示層（Object3D.layers）は使わず、明示的なパス順で合成する
// （docs/decisions/architecture.md §3.4）。

import { OrthographicCamera, Scene } from "three";
import type { Object3D, WebGLRenderer } from "three";
import { computeOverlayFrustum, type OverlayFrustum } from "./viewport";

// 2次元層のカメラの奥行き設定。採用理由を先に述べる。three.js の OrthographicCamera は near を0以上（0を含む）
// と定めており、負の near は公開契約の範囲外のため使わない。そこでカメラを手前（正のz）へ置き、near=0・far=2000
// とする。カメラ位置のzを1000にすると、可視範囲はワールド座標のzで -1000 から 1000 までとなり、既定で z=0 に
// 置く2次元層の物体が範囲の中央に入り、後続Issueが重ね順のためにわずかな奥行き差を付けても両側に等しく余地を
// 確保できる。正射影では物体のx・y方向の投影はカメラのz位置に依らないため、座標規約（x・y）は変わらない。
const OVERLAY_CAMERA_Z = 1000;
const OVERLAY_NEAR = 0;
const OVERLAY_FAR = 2000;

/** 2次元層の外部契約。 */
export interface OverlayLayer {
  /** 2次元層のシーン。最前面に描く表示物を載せる。 */
  scene: Scene;
  /** 2次元層の正射影カメラ。高さを基準軸に等方・解像度／画素密度非依存の視錐台を持つ。 */
  camera: OrthographicCamera;
  /** 2次元層へ表示物を足す。 */
  addObject(object: Object3D): void;
  /** 2次元層から表示物を外す。 */
  removeObject(object: Object3D): void;
  /**
   * 2次元層を最前面へ重ねる。出力先を画面へ明示し、深度のみ消してから2次元層を描く。
   * 採用理由を先に述べる。この手順を1つの関数に集約し、本番の描画基盤（renderRoot）と受け入れ診断ページの
   * 双方が同じ関数を呼ぶことで、実証する手順と本番の手順を一致させる。呼び出し側は事前に renderer.autoClear を
   * 偽に設定しておく（色を消さずに重ねるため）。
   */
  composite(renderer: WebGLRenderer): void;
  /** 表示寸法の変更を反映する（視錐台の左右を新しい縦横比で組み直す。上下と奥行きは不変）。 */
  resize(displayWidth: number, displayHeight: number): void;
  /** 診断・検証用に、載っている表示物の数を返す。 */
  objectCount(): number;
  /** 診断・検証用に、現在の視錐台（左・右・上・下）を返す。 */
  frustum(): OverlayFrustum;
  /**
   * 後始末。2次元層から表示物を外す（シーンからの取り外しのみ）。
   * 採用理由を先に述べる。載せた表示物のジオメトリ・マテリアル・テクスチャは載せた側が所有して解放するため、
   * ここで表示物の dispose を連鎖して呼ぶと載せた側が再利用できなくなる。よってシーンからの取り外しに留め、
   * 表示物のGPU資源には触れない。正射影カメラとシーン自体はGPU資源を持たない。
   */
  dispose(): void;
}

/**
 * 2次元層を生成する。
 * 正射影カメラはzを正の位置（OVERLAY_CAMERA_Z）へ置き、既定の前方向き（−z方向）で z=0 の表示物を見る。
 * 視錐台の左右は表示寸法の縦横比から、上下は常に +1 と -1 から定める（computeOverlayFrustum）。
 */
export function createOverlayLayer(options: {
  displayWidth: number;
  displayHeight: number;
}): OverlayLayer {
  const scene = new Scene();

  const initialFrustum = computeOverlayFrustum(options.displayWidth, options.displayHeight);
  const camera = new OrthographicCamera(
    initialFrustum.left,
    initialFrustum.right,
    initialFrustum.top,
    initialFrustum.bottom,
    OVERLAY_NEAR,
    OVERLAY_FAR
  );
  // カメラを手前（正のz）へ置く。z=0 の表示物を可視範囲の中央に入れるため。
  camera.position.z = OVERLAY_CAMERA_Z;

  return {
    scene,
    camera,
    addObject(object: Object3D): void {
      scene.add(object);
    },
    removeObject(object: Object3D): void {
      scene.remove(object);
    },
    composite(renderer: WebGLRenderer): void {
      // 出力先を画面（既定フレームバッファ）に明示する。合成器は最後に出力先を画面へ戻すが、明示しておくと
      // 将来パス構成が変わって別の描画先で終えても2次元層が確実に画面へ出る。
      renderer.setRenderTarget(null);
      // 深度のみ消す。色は3次元の描画結果を保持する（renderer.autoClear は偽に設定済み）。
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
    resize(displayWidth: number, displayHeight: number): void {
      const frustum = computeOverlayFrustum(displayWidth, displayHeight);
      camera.left = frustum.left;
      camera.right = frustum.right;
      camera.top = frustum.top;
      camera.bottom = frustum.bottom;
      camera.updateProjectionMatrix();
    },
    objectCount(): number {
      return scene.children.length;
    },
    frustum(): OverlayFrustum {
      return {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
      };
    },
    dispose(): void {
      scene.clear();
    },
  };
}
