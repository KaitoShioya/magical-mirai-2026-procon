import { describe, it, expect } from "vitest";
import { createFixedPoseMotion } from "./vrmMotion";

// createPosedMotion はここで単体テストしない。理由を先に述べる。createPosedMotion は createVRMAnimationClip に
// 実VRM（humanoid を備える本物の VRM）と実VRMアニメーションを渡す必要があり、画像処理装置の無い node 単体テストでは
// 実VRMを構築できないため、実体を伴わない見かけだけのテストになってしまう。固定ポーズの適用は、本物のVRMと本物の
// AnimationMixer を経由する中心キャラクター スモーク（scripts/rendering-center-figure-smoke.mjs）で、正規化した腰の
// 人体ボーンの回転を読み戻して受け入れ検証する。

describe("createFixedPoseMotion の固定ポーズ", () => {
  it("update を複数回呼んでも例外を投げない", () => {
    const motion = createFixedPoseMotion();
    expect(() => {
      motion.update(0.016);
      motion.update(0.5);
      motion.update(0);
    }).not.toThrow();
  });

  it("dispose は冪等で、複数回呼んでも例外を投げない", () => {
    const motion = createFixedPoseMotion();
    expect(() => {
      motion.dispose();
      motion.dispose();
    }).not.toThrow();
  });
});
