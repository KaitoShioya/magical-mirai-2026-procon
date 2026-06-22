// 読ませる役・演出役の世界座標への配置（Issue #33）。
//
// 役割: 表示領域（画面に対する相対矩形）と想定表示寸法（デバイス画素）を、カメラ正対面上の世界座標と
// 世界座標の文字寸法へ変換する。駆動部 ConductorPlacement の実装を、純粋なベクトル計算（テスト可能）と
// three.js のカメラから値を取り出す薄いアダプタに分ける。
//
// 変換の根拠を先に述べる。読ませる役はカメラへ正対する（エンジンが毎フレーム camera.quaternion を複製する）ため、
// カメラ前方の距離 planeDistance のところに、カメラ正対の平面を考える。透視投影では距離 d で見える縦の世界高さは
// 2 d tan(縦視野角 ÷ 2)、横は縦×縦横比である。画面の相対位置（割合）を正規化装置座標（-1〜1）へ写し、その平面上の
// 右方向・上方向のずれへ掛けて、平面中心（カメラ前方 d）からの位置を得る。文字寸法は readability.minWorldFontSize で
// 同じ透視投影の関係から求める（二重定義を避ける）。

import { Vector3 } from "three";
import { minWorldFontSize } from "./readability";
import { READING_FIT_SAFETY_MARGIN } from "./readingLayout";
import type { Vector3Like } from "./types";
import type { ReadingPlacementResolved } from "./readingLayout";
import type { TypographyDisplayRegion } from "../../types/typography";
import type { ConductorPlacement } from "./conductor";

// ---- 純粋なベクトル計算（three.js に依存しない） ----

function add(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a: Vector3Like, s: number): Vector3Like {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function cross(a: Vector3Like, b: Vector3Like): Vector3Like {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function normalize(a: Vector3Like): Vector3Like {
  const length = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return scale(a, 1 / length);
}

/** 配置計算に要するカメラの状態（plain ベクトルで表す）。 */
export interface CameraFrame {
  readonly position: Vector3Like;
  /** カメラの前方向（正規化前でよい。内部で正規化する）。 */
  readonly forward: Vector3Like;
  /** カメラの上方向（正規化前でよい）。 */
  readonly up: Vector3Like;
  /** 縦視野角（度）。 */
  readonly fovYDegrees: number;
  /** 縦横比（横÷縦）。 */
  readonly aspect: number;
  /** 画面の縦デバイス画素数。 */
  readonly viewportPixelHeight: number;
}

/** カメラ正対面の正規直交基底（前方・右・上）を作る。 */
function basisOf(frame: CameraFrame): { forward: Vector3Like; right: Vector3Like; up: Vector3Like } {
  const forward = normalize(frame.forward);
  const right = normalize(cross(forward, frame.up));
  // 上方向を前方・右と直交させ直す（入力の up が前方と直交していない場合に備える）。
  const up = normalize(cross(right, forward));
  return { forward, right, up };
}

/**
 * 画面上の相対位置（横割合・縦割合）に対応する世界座標を求める。planeDistance はカメラ前方の正対面までの距離。
 * 横は左0・右1、縦は上0・下1の割合を正規化装置座標へ写し、正対面の半幅・半高へ掛ける。
 */
export function screenRatioToWorld(
  frame: CameraFrame,
  planeDistance: number,
  xRatio: number,
  yRatio: number
): Vector3Like {
  const { forward, right, up } = basisOf(frame);
  const fovYRadians = (frame.fovYDegrees * Math.PI) / 180;
  const halfHeight = planeDistance * Math.tan(fovYRadians / 2);
  const halfWidth = halfHeight * frame.aspect;
  // 正規化装置座標。横は中心0.5で0、縦は上0で+1・下1で-1（画面の縦は下向きが割合増、世界の上は+なので符号反転）。
  const ndcX = xRatio * 2 - 1;
  const ndcY = 1 - yRatio * 2;
  const center = add(frame.position, scale(forward, planeDistance));
  return add(add(center, scale(right, ndcX * halfWidth)), scale(up, ndcY * halfHeight));
}

/**
 * 読ませる役の開始位置（フレーズの先頭文字を置く世界座標）を求める。
 * 文字エンジンはフレーズを先頭文字から右へ一定送り量で並べるため、表示領域の左内側を先頭位置にして
 * 領域内を左から右へ満たす。横位置は領域の左端から安全余白ぶん内側、縦位置は領域の中心とする。
 */
export function readingStartWorldPosition(
  frame: CameraFrame,
  planeDistance: number,
  region: TypographyDisplayRegion,
  safetyMargin: number = READING_FIT_SAFETY_MARGIN
): Vector3Like {
  const leftInnerXRatio = region.centerXRatio - (region.widthRatio * (1 - safetyMargin)) / 2;
  return screenRatioToWorld(frame, planeDistance, leftInnerXRatio, region.centerYRatio);
}

/** 想定表示寸法（デバイス画素）に対応する世界座標の文字寸法を求める。 */
export function worldFontSizeForPixelHeightPure(
  frame: CameraFrame,
  planeDistance: number,
  pixelHeight: number
): number {
  return minWorldFontSize({
    minPixelHeight: pixelHeight,
    distance: planeDistance,
    fovYDegrees: frame.fovYDegrees,
    viewportPixelHeight: frame.viewportPixelHeight,
  });
}

// ---- three.js のカメラを読むアダプタ ----

/** three.js の透視投影カメラのうち、配置計算が使う最小形。 */
export interface PerspectiveCameraLike {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly up: { readonly x: number; readonly y: number; readonly z: number };
  readonly fov: number;
  readonly aspect: number;
  /** 世界空間での前方向を書き込んで返す（three.js の getWorldDirection と同形）。 */
  getWorldDirection(target: { x: number; y: number; z: number }): { x: number; y: number; z: number };
}

/** カメラから配置計算用の状態を読み出す。
 * three.js の getWorldDirection は受け取った対象へ set で書き込むため、対象は Vector3 を渡す
 * （プレーンオブジェクトには set が無く実行時例外になる）。 */
function frameFromCamera(camera: PerspectiveCameraLike, viewportPixelHeight: number): CameraFrame {
  const dir = camera.getWorldDirection(new Vector3());
  return {
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    forward: { x: dir.x, y: dir.y, z: dir.z },
    up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    fovYDegrees: camera.fov,
    aspect: camera.aspect,
    viewportPixelHeight,
  };
}

/** カメラ配置の設定。 */
export interface CameraPlacementOptions {
  /** カメラ前方の正対面までの距離（世界座標）。読ませる役をこの距離の面に置く。 */
  readonly planeDistance: number;
}

/**
 * three.js のカメラを裏側に持つ ConductorPlacement を作る。カメラの状態を毎回読むため、カメラが動いても追従する。
 * viewportPixelHeight は画面の縦デバイス画素数を返す関数。
 */
export function createCameraPlacement(
  camera: PerspectiveCameraLike,
  viewportPixelHeight: () => number,
  options: CameraPlacementOptions
): ConductorPlacement {
  return {
    readingWorldPosition(placement: ReadingPlacementResolved): Vector3Like {
      const frame = frameFromCamera(camera, viewportPixelHeight());
      // 読ませる役の行は中央基準の1つのテキストとして置くため、表示領域の中心へ配置する。
      return screenRatioToWorld(
        frame,
        options.planeDistance,
        placement.region.centerXRatio,
        placement.region.centerYRatio
      );
    },
    worldFontSizeForPixelHeight(pixelHeight: number): number {
      const frame = frameFromCamera(camera, viewportPixelHeight());
      return worldFontSizeForPixelHeightPure(frame, options.planeDistance, pixelHeight);
    },
  };
}
