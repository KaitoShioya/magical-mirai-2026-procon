// 空間品質ゲート（Issue #100）の診断ページ（spatial.html の入口）。
// 本番と同じ描画基盤 createRenderRoot と本番と同じ経路 mountStageTerrain で、反射水面・暫定発光点・
// 夜の照明・中心像・ブルーム・陸地地形を構成する。3姿勢（遠景・近景・横移動）のカメラで、遠景と近景を
// 描画して画素を縦横各128区画の平均輝度へ縮約し、横移動は視差の幾何的な射影にのみ用いる。
// 状態と縮約値と射影画面座標を window.__spatialReady / __spatialState / __spatialCapture に公開する。
// scripts/spatial-quality.mjs（手元のゲート本体）と scripts/rendering-spatial-smoke.mjs（構造スモーク）が読む。
// 本ページは反射・ブルームの起動時パラメータ（refl・bloom）を入口 src/main.ts と同一に解釈する。
// 依存規則により本体・診断は src/tools を import しないため、要素取得は内製する。本番ビルドでは配信しない。

import { PerspectiveCamera, Vector3 } from "three";
import { createRenderRoot, resolveReflectionResolution } from "../../index";
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR } from "../../constants";
import { PLACEHOLDER_GLOW_POSITIONS } from "../../placeholderGlow";
import { LAKE_STAGE } from "../../../config/stage";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

// 縮約格子の分割数（縦横各128区画、初期値）。細かくするほど局在する小さな反射やにじみが薄まりにくい。
const GRID_COLS = 128;
const GRID_ROWS = 128;

// カメラの3姿勢。固定発光点（PLACEHOLDER_GLOW_POSITIONS、原点付近・高さ約0）を枠に収める既知良好な
// 暫定カメラ視点（renderRoot の暫定視点と同じ枠取り）に倣う。注視点は水面付近の発光点の中心、遠景は
// 見下ろす一点、近景は中心へ寄せて発光点の投影面積を広げ、横移動は遠景を横へずらして視差を生む。
// いずれの高さも水面より上に保つ（反射板はカメラが水面より下にあると反射を描かないため）。
const CAMERA_TARGET = { x: 0, y: 1, z: 0 } as const;
const CAMERA_POSES = {
  far: { x: 0, y: 14, z: 34 },
  near: { x: 0, y: 9, z: 20 },
  lateral: { x: 22, y: 14, z: 34 },
} as const;
type PoseName = keyof typeof CAMERA_POSES;

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

// 起動時パラメータの解釈を入口 src/main.ts と同一にする。
const query = new URLSearchParams(window.location.search);
const reflectionResolution = resolveReflectionResolution(query.get("refl"));
const bloomEnabled = query.get("bloom") !== "0";

const renderRoot = createRenderRoot(container, { reflectionResolution, bloomEnabled });

let ready = false;

/** 容器要素から描画用キャンバスとWebGL描画文脈を取得する。取得できないときは null。 */
function getRenderingContext(): WebGL2RenderingContext | null {
  const canvas = container.querySelector("canvas");
  if (!canvas) {
    return null;
  }
  // 同一キャンバスへの2回目以降の getContext("webgl2") は最初に生成された描画文脈を返すため、
  // 描画器が使うものと同一になる（引数の属性は初回生成時のみ適用される）。
  return canvas.getContext("webgl2");
}

/** 描画直後のフレームバッファ全体を読み、縦横各区画の平均輝度へ縮約する。行0が画面の上、列0が画面の左。 */
function captureGrid(gl: WebGL2RenderingContext): {
  cols: number;
  rows: number;
  cells: number[];
} {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const cellCount = GRID_COLS * GRID_ROWS;
  const sums = new Float64Array(cellCount);
  const counts = new Uint32Array(cellCount);
  for (let bufferY = 0; bufferY < height; bufferY += 1) {
    // gl.readPixels は左下原点（行0が下）で読むため、画面の上からの行へ反転する。
    const screenYFromTop = height - 1 - bufferY;
    const row = Math.min(GRID_ROWS - 1, Math.floor((screenYFromTop / height) * GRID_ROWS));
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS));
      const base = (bufferY * width + x) * 4;
      const luminance =
        0.2126 * pixels[base] + 0.7152 * pixels[base + 1] + 0.0722 * pixels[base + 2];
      const cell = row * GRID_COLS + col;
      sums[cell] += luminance;
      counts[cell] += 1;
    }
  }
  const cells = new Array<number>(cellCount);
  for (let i = 0; i < cellCount; i += 1) {
    cells[i] = counts[i] > 0 ? sums[i] / counts[i] : 0;
  }
  return { cols: GRID_COLS, rows: GRID_ROWS, cells };
}

/** 指定姿勢で、固定発光点を描画基盤と同一内在の遠近投影カメラへ射影した画面正規化座標を返す。 */
function projectGlowPoints(
  poseName: PoseName,
  aspect: number
): Array<{ x: number; y: number; onScreen: boolean }> {
  const camera = new PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  const pose = CAMERA_POSES[poseName];
  camera.position.set(pose.x, pose.y, pose.z);
  camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
  camera.updateMatrixWorld(true);
  return PLACEHOLDER_GLOW_POSITIONS.map((point) => {
    const ndc = new Vector3(point.x, point.y, point.z).project(camera);
    const onScreen =
      ndc.z >= -1 &&
      ndc.z <= 1 &&
      Math.abs(ndc.x) <= 1 &&
      Math.abs(ndc.y) <= 1;
    return { x: ndc.x, y: ndc.y, onScreen };
  });
}

/** 指定姿勢へカメラを置いて1フレーム描画し、縮約格子を返す。描画文脈が得られないときは例外を投げる。 */
function capturePose(poseName: PoseName): { cols: number; rows: number; cells: number[] } {
  const pose = CAMERA_POSES[poseName];
  renderRoot.setCameraPose(pose, CAMERA_TARGET);
  renderRoot.render();
  const gl = getRenderingContext();
  if (!gl) {
    throw new Error("WebGL の描画文脈を取得できませんでした（画素を読めません）");
  }
  return captureGrid(gl);
}

async function run(): Promise<void> {
  // 地形を読み込み（成功・失敗いずれも確定するまで待つ）、確定後に1フレーム描いて画面へ反映する。
  await renderRoot.mountStageTerrain(LAKE_STAGE);
  renderRoot.setCameraPose(CAMERA_POSES.far, CAMERA_TARGET);
  renderRoot.render();

  const state = renderRoot.state();
  hud.textContent =
    `webgl: ${state.webglAvailable}  terrain: ${state.stageTerrainStatus}\n` +
    `waterSource: ${state.waterSource}  reflection: ${state.reflectionEnabled}@${state.reflectionResolution}\n` +
    `bloom: ${state.bloom ? state.bloom.enabled : "null"}`;

  // 構造状態と、3姿勢の射影画面座標を返す。射影は画素を読まない幾何の計算。
  window.__spatialState = () => {
    const current = renderRoot.state();
    const aspect = current.cameraAspect;
    const poseEntry = (name: PoseName) => ({
      position: { ...CAMERA_POSES[name] },
      projected: projectGlowPoints(name, aspect),
    });
    return {
      webglAvailable: current.webglAvailable,
      reflectionEnabled: current.reflectionEnabled,
      reflectionResolution: current.reflectionResolution,
      waterSource: current.waterSource,
      stageTerrainStatus: current.stageTerrainStatus,
      stageTerrainError: current.stageTerrainError,
      bloomEnabled: current.bloom ? current.bloom.enabled : false,
      bloomStrength: current.bloom ? current.bloom.strength : 0,
      bloomOutputPassEnabled: current.bloom ? current.bloom.outputPassEnabled : false,
      cameraPoseRejectedCount: current.cameraPoseRejectedCount,
      waterRegion: current.waterRegion,
      poses: {
        far: poseEntry("far"),
        near: poseEntry("near"),
        lateral: poseEntry("lateral"),
      },
    };
  };

  // 指定姿勢で描画して縮約格子を返す。遠景と近景で呼ぶ（横移動は射影のみで描画しない）。
  window.__spatialCapture = (poseName: string) => {
    if (poseName !== "far" && poseName !== "near" && poseName !== "lateral") {
      throw new Error(`未知の姿勢名です: ${poseName}`);
    }
    return capturePose(poseName);
  };

  ready = true;
}
void run();

window.__spatialReady = () => ready;

// 表示寸法の変更に追従する。
window.addEventListener("resize", () => {
  renderRoot.resize(window.innerWidth, window.innerHeight);
  renderRoot.render();
});

// ページ破棄時に後始末し、公開したアクセサを削除する。
window.addEventListener("beforeunload", () => {
  renderRoot.dispose();
  delete window.__spatialReady;
  delete window.__spatialState;
  delete window.__spatialCapture;
});
