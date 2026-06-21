// ミクのボーンを操作するモーション層の抽象（Issue #93）。状態を読んで骨を動かすビューであり、判定・得点・
// 時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。profiles・tools は import しない。
//
// 抽象を設ける理由を先に述べる。後からミクへ動きを付加できるよう、ボーンを操作する層を1つの形に揃える。
// 最小実用版は固定ポーズ（毎フレーム骨を変えない無動作）とし、抽象の差し替えで後続の2方式を扱えるようにする。
// 出典は docs/research/06-tech-stack-and-architecture.md の7節。
//   第1の方式（手続き的モーション）: @pixiv/three-vrm の VRMHumanoid の正規化したボーンへコードで回転を与える。
//   第2の方式（再生型モーション）: @pixiv/three-vrm-animation で VRM Animation を読み込み、createVRMAnimationClip で
//     動作の区切りを作り、THREE.AnimationMixer を vrm.scene に対して進めて再生する。
// いずれの方式でも、毎フレーム vrm.update を呼んでばねの揺れと表情の更新を進める（その呼び出しは vrmLoader が担う）。

import type { LoadedVrm } from "../loaders/vrmLoader";

/** モーション層の取っ手。毎フレーム更新と後始末の2操作だけを持つ。 */
export interface VrmMotion {
  // 毎フレーム呼ぶ。引数 deltaSeconds は前フレームからの経過秒（差分。絶対時刻ではない）。
  // 呼ぶ順番の前提を先に述べる。本メソッドは vrm.update の前に呼ぶ。理由は、姿勢入力（手続き的なボーン回転、
  // または再生制御による姿勢入力）を先に適用し、その後の vrm.update がVRM内部の更新（姿勢の反映・ばねの揺れ・
  // 表情）を進める順にすると、当フレームの姿勢入力が同じフレームのVRM内部更新へ正しく取り込まれるためである。
  // 固定ポーズは何もしない。
  update(deltaSeconds: number): void;
  // 後始末。冪等とし、外へ例外を出さない契約とする。外へ例外を出さない理由を先に述べる。差し替えと後始末で
  // 例外を投げうる箇所を生成関数の1か所へ集約し、rendering 層の後始末経路を例外なく完走させるためである。
  // 外部資源（AnimationMixer 等）を持つ後続の実装は、その後始末の中で生じた例外を捕捉し、呼び出し側へ伝播させない。
  dispose(): void;
}

/** 読み込み済みVRMからモーション層を作る同期の生成関数。差し替え口へ渡す。 */
export type VrmMotionFactory = (loaded: LoadedVrm) => VrmMotion;

/**
 * 最小実用版の固定ポーズのモーション層を作る。
 * update は何もしない（読み込んだ既定姿勢を毎フレーム変えない＝ポーズ固定）。dispose は何もしない（保持資源が無い）。
 * いずれも冪等であり、外へ例外を出さない。
 */
export function createFixedPoseMotion(): VrmMotion {
  return {
    update(): void {
      // 固定ポーズは骨を動かさない。
    },
    dispose(): void {
      // 保持資源が無いため何もしない。
    },
  };
}
