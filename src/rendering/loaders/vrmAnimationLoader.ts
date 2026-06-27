// VRMアニメーション（拡張子 .vrma）のローダ（Issue #93 の再生型モーション）。GLTFLoader に
// VRMAnimationLoaderPlugin を登録して読み込み、先頭のVRMアニメーションと後始末を備えた取っ手を返す。
// 状態を読むだけのビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。VRM本体のローダ vrmLoader.ts と同じ構造に倣う。

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMAnimationLoaderPlugin, type VRMAnimation } from "@pixiv/three-vrm-animation";

/** 読み込み済みのVRMアニメーションの取っ手。 */
export interface LoadedVrmAnimation {
  /** 先頭のVRMアニメーション本体。 */
  readonly vrmAnimation: VRMAnimation;
  /** 後始末。冪等。画像処理装置の資源を持たないため何もしない。 */
  dispose(): void;
}

/**
 * 指定URLのVRMアニメーションを読み込み、先頭のアニメーションを返す。
 * VRMAnimationLoaderPlugin は読み込んだ glTF の userData.vrmAnimations にVRMアニメーションの配列を入れる。
 * 配列が空、または存在しない場合は、明示したエラーで Promise を reject する。失敗時も Promise が reject する。
 */
export function loadVrmAnimation(url: string): Promise<LoadedVrmAnimation> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  return new Promise<LoadedVrmAnimation>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const animations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
        if (!animations || animations.length === 0) {
          reject(new Error("読み込んだファイルにVRMアニメーションの情報が含まれていません。"));
          return;
        }
        resolve({
          vrmAnimation: animations[0],
          dispose(): void {
            // 画像処理装置の資源を持たないため何もしない。読み込み経路の競合の再確認が、追い越された
            // 読み込み結果に対して一様に dispose を呼べるよう、後始末の口だけは VRM本体の取っ手と揃える。
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
