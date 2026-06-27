// 中心キャラクター（常在ミク）の受け入れ診断ページ（center-figure.html の入口）（Issue #92）。
// 本番と同じ描画基盤（createRenderRoot）を作り、本番と同じ経路（mountCenterCharacter・mountStageTerrain）で
// 中心キャラクターのVRMと舞台土台を読み込む。中心オブジェクトが湖の中心へ配置され、湖面反射への含有を
// 切り替えられることを確かめる。状態を window.__centerFigureState に公開し、
// scripts/rendering-center-figure-smoke.mjs が読む。本ページは本番ビルド（--mode app）では配信しない。
//
// centerFigureReflected は反射に含める意図の値（既定は真。concept-final §10）、reflectionEnabled は反射
// そのものの実効値で別概念である。クエリ ?reflectMiku=0 のとき、起動時に反射からミクを外す。

import { createRenderRoot } from "../../renderRoot";
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
// ?reflectMiku=0 のとき反射からミクを外して起動する（手動・自動検証用）。既定は含める。
const reflectMiku = query.get("reflectMiku") !== "0";

const renderRoot = createRenderRoot(container, { reflectionResolution: 512, bloomEnabled: true });

async function run(): Promise<void> {
  // 反射への含有の意図値を先に設定する。意図値は renderRoot が保持するため、舞台土台の読み込み（水面再生成）の
  // 前後どちらで設定しても最終的な反射設定は同じ値へ収束する。
  if (!reflectMiku) {
    renderRoot.setCenterFigureReflected(false);
  }
  // 本番と同じ経路で中心キャラクターのVRMと舞台土台を読み込む。両方の完了を待ってからアクセサを公開する
  // （読み込み前の途中状態を読まないため）。舞台土台の読み込みで水面が再生成され、その後も反射設定が
  // 保たれることを本ページで確かめる。
  await Promise.all([
    renderRoot.mountCenterCharacter(MIKU_CHARACTER),
    renderRoot.mountStageTerrain(LAKE_STAGE),
  ]);
  renderRoot.render();

  const state = renderRoot.state();
  hud.textContent =
    `center figure: ${state.centerFigureStatus}\n` +
    `reflection enabled: ${state.reflectionEnabled}  reflect miku: ${state.centerFigureReflected}` +
    (state.centerFigureError ? `\nerror: ${state.centerFigureError}` : "");

  // 読み込み完了（成功・失敗いずれも確定後）に診断アクセサを公開する。
  window.__centerFigureState = () => {
    const current = renderRoot.state();
    return {
      webglAvailable: current.webglAvailable,
      centerFigureStatus: current.centerFigureStatus,
      centerFigureError: current.centerFigureError,
      centerFigureMotionMode: current.centerFigureMotionMode,
      centerFigurePoseMaxAngleDeg: current.centerFigurePoseMaxAngleDeg,
      reflectionEnabled: current.reflectionEnabled,
      centerFigureReflected: current.centerFigureReflected,
      cameraPosition: current.cameraPosition,
    };
  };
}
void run();

// 連続描画して目視確認できるようにする（光柱の明滅・VRMの内部更新を進める）。
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
  delete window.__centerFigureState;
});
