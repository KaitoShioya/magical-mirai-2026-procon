// 撮影モード（Issue #68）のカメラ計算。結果画面でのみ、指の操作からカメラの姿勢（位置と注視点）を作る。
// three.js に依存しない純粋な計算にして決定的に単体検証できるようにする（既存方針。描画への反映は呼び出し側が
// renderRoot.setCameraPose で行う）。判定・得点には一切触れない（非干渉）。
//
// 操作の定義（concept-final.md §13）:
// - 1本指の操作（向き変更）: 位置と視距離を保ったまま、視線方向を世界の上方向まわり（ヨー）とカメラ右方向まわり（ピッチ）で回す。
// - 2本指の操作（平行移動）: 視線方向を保ったまま、カメラ右方向と上方向に沿って位置と注視点を同じだけ動かす。
// - 2本指の指間隔の変化（ピンチ）: 視線方向を保ったまま、カメラ位置を視線方向へ前後に動かす（視距離を変える＝寄り引き）。

import type { CameraPose, Vec3Like } from "./cameraTrajectory";

// 向き変更の感度（1画素あたりのラジアン）。横へ約600画素で約90度回る量。実機で体感調整する暫定値。
export const PHOTO_LOOK_RADIANS_PER_PIXEL = 0.0026;
// 平行移動の感度の係数（視距離に掛ける1画素あたりの移動量）。近景でも遠景でも見かけの移動量が一定に感じられるよう
// 視距離に比例させる。実機で体感調整する暫定値。
export const PHOTO_PAN_FACTOR_PER_PIXEL = 0.0016;
// ピンチ（指間隔の変化）による前後移動の感度の係数（視距離に掛ける、指間隔の1画素あたりの移動量）。平行移動と同じく
// 視距離に比例させ、寄り引きの見かけの量を景の遠近に依らず一定に保つ。実機で体感調整する暫定値。
export const PHOTO_DOLLY_FACTOR_PER_PIXEL = 0.0016;
// ピッチ（上下の向き）の制限（ラジアン）。約83度。理由を先に述べる。真上・真下に近づくと上方向ベクトルが退化して
// 注視点の計算が不安定になり、setCameraPose が適用を拒否し得るため、その手前で止める。
export const PHOTO_MAX_PITCH_RADIANS = (83 * Math.PI) / 180;

/** 撮影カメラの計算機。指の操作量（画素）を受け、現在の姿勢を返す。 */
export interface PhotoCameraRig {
  /** 1本指の操作。視線方向を回す（位置と視距離は不変）。 */
  look(deltaXPixels: number, deltaYPixels: number): void;
  /** 2本指の操作。位置と注視点を同じだけ平行移動する（視線方向は不変）。 */
  pan(deltaXPixels: number, deltaYPixels: number): void;
  /** ピンチの操作。指間隔の変化（画素）に応じてカメラ位置を視線方向へ前後に動かす（視距離を変える）。
   *  正の値（指を広げる）で前へ寄り、負の値（指を狭める）で後ろへ引く。視線方向は不変。 */
  dolly(deltaPinchPixels: number): void;
  /** 現在のカメラ姿勢（位置と注視点）を返す。 */
  pose(): CameraPose;
  /** 初期姿勢へ戻す（結果画面進入時に軌跡の終端姿勢で初期化する）。 */
  reset(initial: CameraPose): void;
}

function length(v: Vec3Like): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 撮影カメラの計算機を作る。初期姿勢から位置・視距離・向き（ヨー・ピッチ）を取り出して保持する。
 * 向きの表し方を先に述べる。視線方向（前方）を、世界の上方向（Y軸）まわりの角（ヨー）と水平からの上下角（ピッチ）で表す。
 * 前方 = (cosPitch・sinYaw, sinPitch, cosPitch・cosYaw)。これにより位置を固定したまま向きだけを回せる。
 */
export function createPhotoCameraRig(initial: CameraPose): PhotoCameraRig {
  let posX = 0;
  let posY = 0;
  let posZ = 0;
  let yaw = 0;
  let pitch = 0;
  let dist = 1;

  function reset(pose: CameraPose): void {
    posX = pose.position.x;
    posY = pose.position.y;
    posZ = pose.position.z;
    const dx = pose.target.x - pose.position.x;
    const dy = pose.target.y - pose.position.y;
    const dz = pose.target.z - pose.position.z;
    dist = length({ x: dx, y: dy, z: dz });
    // 視距離が0（位置と注視点が同一）なら向きを定められないため、安全な既定（前方 -Z）にする。
    if (dist <= 1e-6) {
      dist = 1;
      yaw = 0;
      pitch = 0;
      return;
    }
    const fy = clamp(dy / dist, -1, 1);
    pitch = clamp(Math.asin(fy), -PHOTO_MAX_PITCH_RADIANS, PHOTO_MAX_PITCH_RADIANS);
    yaw = Math.atan2(dx, dz);
  }

  reset(initial);

  function look(deltaXPixels: number, deltaYPixels: number): void {
    // 横の指の動きでヨー、縦の指の動きでピッチを変える。縦は「指を下へ動かすと視線も下へ」になる符号にする（暫定）。
    yaw += deltaXPixels * PHOTO_LOOK_RADIANS_PER_PIXEL;
    pitch = clamp(
      pitch - deltaYPixels * PHOTO_LOOK_RADIANS_PER_PIXEL,
      -PHOTO_MAX_PITCH_RADIANS,
      PHOTO_MAX_PITCH_RADIANS
    );
  }

  function forward(): Vec3Like {
    const cosPitch = Math.cos(pitch);
    return {
      x: cosPitch * Math.sin(yaw),
      y: Math.sin(pitch),
      z: cosPitch * Math.cos(yaw),
    };
  }

  function pan(deltaXPixels: number, deltaYPixels: number): void {
    const f = forward();
    // カメラ右方向 = 前方 × 世界上方向（Y）。前方が真上に近いと退化するが、ピッチ制限で避けている。
    const rightX = f.z * 1 - f.y * 0; // cross(forward, (0,1,0)) の x 成分 = f.z*1 - f.y*0
    const rightY = f.x * 0 - f.z * 0; // = 0
    const rightZ = f.y * 0 - f.x * 1; // = -f.x
    // 上式を整理すると右方向 = (f.z, 0, -f.x)。水平面内のベクトルになる。長さで正規化する。
    const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ) || 1;
    const rx = rightX / rightLen;
    const ry = rightY / rightLen;
    const rz = rightZ / rightLen;
    // カメラ上方向 = 右方向 × 前方。
    const upX = ry * f.z - rz * f.y;
    const upY = rz * f.x - rx * f.z;
    const upZ = rx * f.y - ry * f.x;

    const perPixel = dist * PHOTO_PAN_FACTOR_PER_PIXEL;
    // 指を右へ動かすと被写体が右へ動く（カメラは左へ寄る）よう、右方向に対し負の符号にする（暫定）。縦は指を下へで被写体が下へ。
    const moveRight = -deltaXPixels * perPixel;
    const moveUp = deltaYPixels * perPixel;
    const offX = rx * moveRight + upX * moveUp;
    const offY = ry * moveRight + upY * moveUp;
    const offZ = rz * moveRight + upZ * moveUp;
    posX += offX;
    posY += offY;
    posZ += offZ;
    // 注視点も同じだけ動かすため、pose() が位置＋前方×視距離で注視点を作る本実装では位置の移動だけで視線方向が保たれる。
  }

  function dolly(deltaPinchPixels: number): void {
    const f = forward();
    // 指間隔の変化（画素）に視距離を掛けて前後移動量にする。指を広げる（正）と前へ寄り、狭める（負）と後ろへ引く。
    const move = deltaPinchPixels * dist * PHOTO_DOLLY_FACTOR_PER_PIXEL;
    posX += f.x * move;
    posY += f.y * move;
    posZ += f.z * move;
    // 注視点は pose() が位置＋前方×視距離で作るため、位置の前後移動だけで視線方向と視距離（注視点までの距離）が保たれ、
    // カメラと景の見かけの距離（寄り引き）だけが変わる。
  }

  function pose(): CameraPose {
    const f = forward();
    return {
      position: { x: posX, y: posY, z: posZ },
      target: { x: posX + f.x * dist, y: posY + f.y * dist, z: posZ + f.z * dist },
    };
  }

  return { look, pan, dolly, pose, reset };
}
