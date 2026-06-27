// ネオン星雲の夜空（Issue #205）の受け入れ診断ページ（night-sky.html の入口）。本番と同じ描画基盤
// （createRenderRoot）と本番経路（mountStageTerrain・mountCenterCharacter）で夜空・舞台土台・中心ミクを構成し、
// 夜空が組み込まれ反射に映り、地形・空が暗すぎず・明るすぎず描けることを確かめる。状態とアクセサを
// window.__nightSkyReady・window.__nightSkyState に公開し、scripts/rendering-night-sky-smoke.mjs が読む。
// 操作用の調整つまみは設けず、表示と画素読み戻しに絞る。本ページは本番ビルド（--mode app）では配信しない。
//
// 反射解像度はクエリ ?refl で切り替える（既定512）。反射512と256の双方で夜空が組み込まれ反射が有効なことを
// 検証するために用いる。

import { createRenderRoot } from "../../renderRoot";
import { resolveReflectionResolution } from "../../reflection";
import { MIKU_CHARACTER } from "../../../config/character";
import { LAKE_STAGE } from "../../../config/stage";

// 依存規則により本体・診断は tools を import しないため、要素取得は内製する。
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const query = new URLSearchParams(window.location.search);
const reflectionResolution = resolveReflectionResolution(query.get("refl"));

// 夜空そのものを評価するため、反射確認用の暫定発光点（Issue #9/#10 の固定の光点）は外す。
const renderRoot = createRenderRoot(container, {
  reflectionResolution,
  bloomEnabled: true,
  placeholderGlowEnabled: false,
});

// 画素読み戻し用に、描画基盤が container へ載せた canvas の WebGL2 文脈を得る（同種の getContext は既存の
// 文脈を返すため、描画基盤が使う文脈と同一である）。
function resolveGl(): WebGL2RenderingContext | null {
  const canvas = container.querySelector("canvas");
  if (!canvas) {
    return null;
  }
  return canvas.getContext("webgl2");
}

// 知覚に寄せた輝度（0以上255以下）。赤・緑・青の標準的な重みで重み付ける。
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 画面の矩形領域（左下原点・画素単位）を読み、平均輝度と最大輝度を返す。領域はバッファ内に丸める。
function readRegion(
  gl: WebGL2RenderingContext,
  fractionX: number,
  fractionY: number,
  fractionW: number,
  fractionH: number
): { average: number; maximum: number } {
  const bufferWidth = gl.drawingBufferWidth;
  const bufferHeight = gl.drawingBufferHeight;
  const x = Math.max(0, Math.min(bufferWidth - 1, Math.floor(fractionX * bufferWidth)));
  const y = Math.max(0, Math.min(bufferHeight - 1, Math.floor(fractionY * bufferHeight)));
  const w = Math.max(1, Math.min(bufferWidth - x, Math.floor(fractionW * bufferWidth)));
  const h = Math.max(1, Math.min(bufferHeight - y, Math.floor(fractionH * bufferHeight)));
  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let total = 0;
  let maximum = 0;
  const count = w * h;
  for (let i = 0; i < count; i += 1) {
    const lum = luminance(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    total += lum;
    if (lum > maximum) {
      maximum = lum;
    }
  }
  return { average: total / count, maximum };
}

let ready = false;

async function run(): Promise<void> {
  // 本番と同じ経路で舞台土台と中心ミクを読み込む。両方の完了を待ってからアクセサを公開する（途中状態を読まない）。
  // 中心ミクの読み込み失敗は致命ではない（光柱へ縮退する）。夜空の検証は中心ミクの成否に依存しない。
  await Promise.all([
    renderRoot.mountStageTerrain(LAKE_STAGE),
    renderRoot.mountCenterCharacter(MIKU_CHARACTER),
  ]);
  // 夜空を評価しやすいよう、ほぼ水平（地平線が画面中ほど）に構える。水面より上に置き反射を保つ。
  // 本番のカメラ姿勢はカメラ軌跡（Issue #59）が駆動するため、これは診断ページ専用の視点である。
  renderRoot.setCameraPose({ x: 0, y: 8, z: 34 }, { x: 0, y: 8.5, z: -50 });
  renderRoot.render();

  const state = renderRoot.state();
  hud.textContent =
    `sky present: ${state.skyPresent}  reflection: ${state.reflectionEnabled} (${state.reflectionResolution})\n` +
    `stage: ${state.stageTerrainStatus}  draw calls: ${state.drawCalls}`;

  // 読み込み完了後にアクセサを公開する。
  window.__nightSkyState = () => {
    // 新しいフレームを描いてから直後に画素を読み戻す（同一処理内で読むため背面バッファに当該フレームが残る）。
    renderRoot.render();
    const current = renderRoot.state();
    const gl = resolveGl();
    // 空の代表領域は画面上部の中央帯（左下原点のため縦は上寄り＝高い値）。地形・水面の代表領域は画面下部の中央帯。
    const sky = gl
      ? readRegion(gl, 0.3, 0.72, 0.4, 0.2)
      : { average: 0, maximum: 0 };
    const ground = gl
      ? readRegion(gl, 0.3, 0.08, 0.4, 0.15)
      : { average: 0, maximum: 0 };
    return {
      webglAvailable: current.webglAvailable,
      skyPresent: current.skyPresent,
      reflectionEnabled: current.reflectionEnabled,
      reflectionResolution: current.reflectionResolution,
      drawCalls: current.drawCalls,
      skyLuminance: sky.average,
      skyMaxLuminance: sky.maximum,
      terrainLuminance: ground.average,
    };
  };
  ready = true;
  window.__nightSkyReady = () => ready;
}
void run();

// 連続描画して星雲の漂いと星の瞬きを目視確認できるようにする。
let lastTimeMs = performance.now();
function frame(nowMs: number): void {
  const deltaSeconds = (nowMs - lastTimeMs) / 1000;
  lastTimeMs = nowMs;
  renderRoot.update(deltaSeconds);
  renderRoot.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 表示寸法の変更に追従する。
window.addEventListener("resize", () => {
  renderRoot.resize(window.innerWidth, window.innerHeight);
});

// ページ破棄時に後始末し、公開したアクセサを削除する。
window.addEventListener("beforeunload", () => {
  renderRoot.dispose();
  delete window.__nightSkyState;
  delete window.__nightSkyReady;
});
