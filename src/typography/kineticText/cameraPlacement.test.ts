// 世界座標への配置計算（Issue #33）の単体テスト。
// 画面割合→世界座標、読ませる役の左寄せ開始位置、画素→ワールド寸法が minWorldFontSize と一致すること、アダプタを固定する。

import { describe, it, expect } from "vitest";
import {
  screenRatioToWorld,
  readingStartWorldPosition,
  worldFontSizeForPixelHeightPure,
  createCameraPlacement,
  type CameraFrame,
  type PerspectiveCameraLike,
} from "./cameraPlacement";
import { minWorldFontSize } from "./readability";

const frame: CameraFrame = {
  position: { x: 0, y: 0, z: 10 },
  forward: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 },
  fovYDegrees: 60,
  aspect: 1.5,
  viewportPixelHeight: 1000,
};

const planeDistance = 5;
const halfHeight = planeDistance * Math.tan((60 * Math.PI) / 180 / 2);
const halfWidth = halfHeight * frame.aspect;

describe("screenRatioToWorld 画面割合の世界座標", () => {
  it("画面中心（0.5, 0.5）はカメラ前方 planeDistance の点になる", () => {
    const p = screenRatioToWorld(frame, planeDistance, 0.5, 0.5);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(5); // 10 + (-1)*5
  });

  it("下端（縦割合1.0）は中心より低い（y が負、半高ぶん）", () => {
    const p = screenRatioToWorld(frame, planeDistance, 0.5, 1.0);
    expect(p.y).toBeCloseTo(-halfHeight);
  });

  it("右端（横割合1.0）は中心より右（x が正、半幅ぶん）", () => {
    const p = screenRatioToWorld(frame, planeDistance, 1.0, 0.5);
    expect(p.x).toBeCloseTo(halfWidth);
  });
});

describe("readingStartWorldPosition 読ませる役の左寄せ開始位置", () => {
  it("表示領域の左内側（中心より左）を返す", () => {
    const region = { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.2 };
    const p = readingStartWorldPosition(frame, planeDistance, region, 0.05);
    // 左内側 = 0.5 - 0.8×0.95/2 = 0.12 → ndcX = -0.76 → x = -0.76×halfWidth（負）。
    expect(p.x).toBeLessThan(0);
    expect(p.x).toBeCloseTo((0.12 * 2 - 1) * halfWidth);
    expect(p.z).toBeCloseTo(5);
  });
});

describe("worldFontSizeForPixelHeightPure 画素→ワールド寸法", () => {
  it("minWorldFontSize と同じ値を返す", () => {
    const expected = minWorldFontSize({
      minPixelHeight: 100,
      distance: planeDistance,
      fovYDegrees: frame.fovYDegrees,
      viewportPixelHeight: frame.viewportPixelHeight,
    });
    expect(worldFontSizeForPixelHeightPure(frame, planeDistance, 100)).toBeCloseTo(expected);
  });
});

describe("createCameraPlacement アダプタ", () => {
  const camera: PerspectiveCameraLike = {
    position: { x: 0, y: 0, z: 10 },
    up: { x: 0, y: 1, z: 0 },
    fov: 60,
    aspect: 1.5,
    getWorldDirection(target) {
      target.x = 0;
      target.y = 0;
      target.z = -1;
      return target;
    },
  };

  const region = { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.2 };
  const placement = createCameraPlacement(camera, () => 1000, {
    planeDistance,
  });

  it("読ませる役の行は領域の中心（中央基準）を返す", () => {
    const p = placement.readingWorldPosition({ unit: "phrase", targetPixelHeight: 24, region });
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(5);
  });

  it("画素→ワールド寸法を返す", () => {
    expect(placement.worldFontSizeForPixelHeight(100)).toBeGreaterThan(0);
  });
});
