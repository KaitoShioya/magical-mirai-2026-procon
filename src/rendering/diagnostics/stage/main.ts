// 舞台土台モデル（Issue #105）の受け入れ診断ページ（stage.html の入口）。
// 本番と同じ描画基盤（createRenderRoot）を作り、本番と同じ経路（mountStageTerrain）で舞台土台を読み込み、
// 地形・水面・反射が成立することを確かめる。地形が読めたかと水面の供給元・反射の有無・2次元層の表示物数を
// window.__stageState に公開する。scripts/rendering-stage-smoke.mjs が読む。
// 本ページは地形検証が目的のため、本体アプリの「診断モードで地形を読み込まない」とは逆に、必ず読み込む。
// 本番ビルド（--mode app）では配信しない。

import { createRenderRoot, resolveReflectionResolution } from "../../index";
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

// 反射解像度は起動時パラメータ refl で切り替えられる（既定512）。refl=0 で反射を無効にして検証できる。
const query = new URLSearchParams(window.location.search);
const reflectionResolution = resolveReflectionResolution(query.get("refl"));

const renderRoot = createRenderRoot(container, { reflectionResolution });

async function run(): Promise<void> {
  const ok = await renderRoot.mountStageTerrain(LAKE_STAGE);
  // 地形を読み込んだ後に1フレーム描き、画面に反映する。
  renderRoot.render();

  const state = renderRoot.state();
  hud.textContent =
    `stage terrain: ${state.stageTerrainStatus}\n` +
    `water source: ${state.waterSource}  reflection: ${state.reflectionEnabled}\n` +
    `mount ok: ${ok}` +
    (state.stageTerrainError ? `\nerror: ${state.stageTerrainError}` : "");

  // 読み込み完了（成功・失敗いずれも確定後）に診断アクセサを公開する。
  window.__stageState = () => {
    const current = renderRoot.state();
    return {
      webglAvailable: current.webglAvailable,
      stageTerrainStatus: current.stageTerrainStatus,
      stageTerrainError: current.stageTerrainError,
      waterSource: current.waterSource,
      reflectionEnabled: current.reflectionEnabled,
      overlayObjectCount: current.overlay ? current.overlay.objectCount : null,
      waterRegion: current.waterRegion,
      originalWaterBoundsWorld: current.originalWaterBoundsWorld,
    };
  };
}
void run();

// 表示寸法の変更に追従する。
window.addEventListener("resize", () => {
  renderRoot.resize(window.innerWidth, window.innerHeight);
  renderRoot.render();
});

// ページ破棄時に後始末し、公開したアクセサを削除する。
window.addEventListener("beforeunload", () => {
  renderRoot.dispose();
  delete window.__stageState;
});
