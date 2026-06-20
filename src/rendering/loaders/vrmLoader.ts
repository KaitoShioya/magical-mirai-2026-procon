// VRMモデルのローダ（Issue #64）。GLTFLoader に VRMLoaderPlugin を登録して VRM を読み込み、
// 描画と毎フレーム更新と後始末を備えた取っ手を返す。状態を読むだけのビューであり、判定・得点・時刻の論理を
// 持たない（依存規則 docs/decisions/architecture.md §5）。profiles・tools は import しない。

import { type Material, type Object3D, type Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

/** 読み込み済みのVRMの取っ手。 */
export interface LoadedVrm {
  /** VRM本体。 */
  readonly vrm: VRM;
  /** シーンへ追加する本体（vrm.scene）。 */
  readonly object3d: Object3D;
  /** 毎フレーム呼ぶ。VRMの揺れ物・表情・注視などを進める（引数は秒）。 */
  update(deltaSeconds: number): void;
  /** 後始末。画像ビットマップを閉じてから GPU資源を解放する。冪等。 */
  dispose(): void;
}

/**
 * マテリアルからテクスチャを集める。標準マテリアルは直接のプロパティに、MToon のようなシェーダ材質は
 * uniforms にテクスチャを持つため、両方を調べる。特定の地図名を列挙せず型（isTexture）で判定する理由を
 * 先に述べる。法線地図・粗さ地図や MToon 固有の地図を漏らさないため。集合へ入れて重複を排除する理由を
 * 先に述べる。複数マテリアルが同一テクスチャを共有する場合に、同じ画像を二重に閉じないため。
 */
function collectTextures(material: Material, into: Set<Texture>): void {
  for (const key of Object.keys(material)) {
    const value = (material as unknown as Record<string, unknown>)[key];
    if (value && (value as Texture).isTexture) {
      into.add(value as Texture);
    }
  }
  const uniforms = (material as unknown as { uniforms?: Record<string, { value?: unknown }> })
    .uniforms;
  if (uniforms) {
    for (const key of Object.keys(uniforms)) {
      const value = uniforms[key]?.value;
      if (value && (value as Texture).isTexture) {
        into.add(value as Texture);
      }
    }
  }
}

/**
 * VRM のテクスチャの元画像が画像ビットマップ（ImageBitmap）のとき閉じる。
 * 閉じてから GPU資源を解放する順序にする理由は、解放後はシーン走査でテクスチャ参照を辿れなくなりうるため、
 * 参照が残る間に集めて閉じる（docs/decisions/architecture.md §3.5）。
 */
function closeImageBitmaps(root: Object3D): void {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    const candidate = (object as unknown as { material?: Material | Material[] }).material;
    if (!candidate) {
      return;
    }
    const materials = Array.isArray(candidate) ? candidate : [candidate];
    for (const material of materials) {
      collectTextures(material, textures);
    }
  });
  for (const texture of textures) {
    const data = texture.source?.data as unknown;
    if (typeof ImageBitmap !== "undefined" && data instanceof ImageBitmap) {
      data.close();
    }
  }
}

/**
 * 指定URLのVRMを読み込む。読み込み後に頂点と骨を整理し、スキンメッシュがカメラ外判定で消えないように
 * 視錐台カリングを無効化し、VRM0.0系は前方の向きを正規化する。失敗時は Promise が reject する。
 */
export function loadVrm(url: string): Promise<LoadedVrm> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return new Promise<LoadedVrm>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          reject(new Error("読み込んだファイルにVRMの情報が含まれていません。"));
          return;
        }

        // 不要頂点の除去とスキンメッシュの骨の統合で、描画負荷とメモリを抑える。引数はいずれも走査の起点。
        VRMUtils.removeUnnecessaryVertices(vrm.scene);
        VRMUtils.combineSkeletons(vrm.scene);
        // VRM0.0系のとき vrm.scene を鉛直軸まわりに180度回し前方を正規化する。VRM1.0では何もしない。
        VRMUtils.rotateVRM0(vrm);
        // スキンメッシュは境界の判定が外れてカメラ外と見なされ消えることがあるため、視錐台カリングを無効化する。
        vrm.scene.traverse((object) => {
          object.frustumCulled = false;
        });

        let disposed = false;
        resolve({
          vrm,
          object3d: vrm.scene,
          update(deltaSeconds: number): void {
            vrm.update(deltaSeconds);
          },
          dispose(): void {
            if (disposed) {
              return;
            }
            disposed = true;
            closeImageBitmaps(vrm.scene);
            VRMUtils.deepDispose(vrm.scene);
          },
        });
      },
      undefined,
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
