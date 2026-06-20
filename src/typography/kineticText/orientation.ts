// 文字の向き方針（カメラ正対の有無と粒度）と、群正対時のローカル位置計算。
// 純粋関数として保ち、判定・得点・時刻の論理や描画器に依存しない。
// 向き方針は spawn 単位で指定し、後続の演出文法（#130/#131/#132）が回転寄与として
// 束ねられる土台にする。本ファイルは登録基盤・合成・割付の論理は持たない。

import { Vector3, type Quaternion } from "three";

/** 向きの基本方式。カメラ正対するか、設定済みの回転を保持して固定するか。 */
export type OrientationMode = "faceCamera" | "fixed";

/** フレーズ正対の粒度。文字ごとに正対するか、フレーズを1枚の面として群正対するか。 */
export type PhraseOrientationGranularity = "perCharacter" | "asGroup";

/** 向き方針。granularity はフレーズ（一括層）でのみ意味を持つ。 */
export interface OrientationPolicy {
  readonly mode: OrientationMode;
  readonly granularity?: PhraseOrientationGranularity;
}

/** 既定の向き方針。現挙動（カメラ正対・文字ごと）を保つ。 */
export const DEFAULT_ORIENTATION: OrientationPolicy = {
  mode: "faceCamera",
  granularity: "perCharacter",
};

/** カメラ正対する向き方針か（メンバの四元数をカメラへ合わせるか）。 */
export function facesCamera(policy: OrientationPolicy): boolean {
  return policy.mode === "faceCamera";
}

/** 群正対か（フレーズを1枚の面として基準点まわりに正対させるか）。 */
export function isGroupBillboard(policy: OrientationPolicy): boolean {
  return policy.mode === "faceCamera" && policy.granularity === "asGroup";
}

/**
 * 群正対時の各メンバのローカル位置を求める。基準点 + カメラ四元数 × 元オフセット。
 * out を渡すと再利用する（毎フレーム呼ぶため割り当てを避ける）。
 */
export function groupBillboardPosition(
  basePosition: Vector3,
  originalOffset: Vector3,
  cameraQuaternion: Quaternion,
  out: Vector3 = new Vector3()
): Vector3 {
  return out.copy(originalOffset).applyQuaternion(cameraQuaternion).add(basePosition);
}
