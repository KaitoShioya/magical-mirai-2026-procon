// 性能バジェットの自動劣化制御（Issue #18）の受け入れ診断ページ（perf-budget.html の入口）。
// 2つのモードを持つ。本ページは本番ビルド（--mode app）では配信しない。
//
// 計測モード（クエリなし、既定）: 本番と同じ描画基盤（createRenderRoot）を作り、劣化段階0から3を順に適用して
// 各段階で数フレーム描き、適用後の状態（画素密度倍率・ブルーム解像度倍率・ブルーム有効・最終出力パスの維持・
// 描画命令数）と段階適用直後のフレーム時間を window.__perfApplied に公開する。scripts/rendering-perf-smoke.mjs
// が読む。描画器が段階を実際に適用するかを実FPSに依存せず決定的に確かめる。
//
// 閲覧モード（?view=1）: 目視確認用。湖のシーンを連続描画し、キーボードの 0・1・2・3 で劣化段階を切り替える。
// 各段階の見え方（画素密度の精細さ、ブルームのにじみの強さ、ブルーム無効時の色味の保持）を比較できる。
// 初期段階は ?level=N で指定できる（既定0）。計測用アクセサは公開しない。
//
// 実機での平均55以上・滑らかさの確認は本編アプリ（?smoke=1）に対する別計測が担い、正式な性能ゲートは
// Issue #97 が担う。

import { createRenderRoot } from "../../renderRoot";

// 依存規則により本体・診断は tools を import しないため、要素取得は内製する。
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const MAX_LEVEL = 3;

const params = new URLSearchParams(location.search);
const viewMode = params.get("view") === "1";

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const renderRoot = createRenderRoot(container, { reflectionResolution: 512, bloomEnabled: true });

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.trunc(value), MAX_LEVEL));
}

function levelDescription(level: number): string {
  // 各段階の縮退内容を日本語で示す（目視確認の手掛かり）。
  switch (level) {
    case 0:
      return "段階0 最高画質（画素密度上限2・ブルーム0.5）";
    case 1:
      return "段階1 画素密度上限1.0（やや精細さが下がる）・ブルーム0.5";
    case 2:
      return "段階2 画素密度上限1.0・ブルーム0.25（にじみ控えめ）";
    case 3:
      return "段階3 画素密度上限1.0・ブルーム無効（にじみ無し、色味は保持）";
    default:
      return `段階${level}`;
  }
}

if (viewMode) {
  // ---- 閲覧モード（目視確認用） ----
  let currentLevel = clampLevel(Number(params.get("level") ?? "0"));
  renderRoot.applyPerformanceLevel(currentLevel);

  function refreshHud(): void {
    const state = renderRoot.state();
    const bloom = state.bloom;
    hud.textContent =
      `閲覧モード（キー 0・1・2・3 で段階切替、devicePixelRatio ${window.devicePixelRatio}）\n` +
      `${levelDescription(currentLevel)}\n` +
      `画素密度倍率=${state.pixelRatio} ` +
      `ブルーム=${bloom ? (bloom.enabled ? "有効" : "無効") : "なし"} ` +
      `ブルーム解像度倍率=${bloom ? bloom.resolutionScale : "なし"} ` +
      `描画命令=${state.drawCalls}`;
  }

  window.addEventListener("keydown", (event) => {
    if (event.key >= "0" && event.key <= String(MAX_LEVEL)) {
      currentLevel = clampLevel(Number(event.key));
      renderRoot.applyPerformanceLevel(currentLevel);
      refreshHud();
    }
  });

  let lastTimeMs = performance.now();
  function frame(nowMs: number): void {
    const deltaSeconds = (nowMs - lastTimeMs) / 1000;
    lastTimeMs = nowMs;
    renderRoot.update(deltaSeconds);
    renderRoot.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  refreshHud();

  window.addEventListener("beforeunload", () => {
    renderRoot.dispose();
  });
} else {
  // ---- 計測モード（スモークが読む） ----
  // 各段階で描くフレーム数。採用理由を先に述べる。段階適用は描画バッファを作り直すことがあり、1フレーム目は
  // その一度きりの負荷を含む。安定した描画命令数を読むために、適用直後の1フレームに続けて数フレーム描く。
  const FRAMES_PER_LEVEL = 3;

  interface LevelSnapshot {
    requestedLevel: number;
    degradationLevel: number;
    pixelRatio: number;
    bloomResolutionScale: number;
    bloomEnabled: boolean;
    outputPassEnabled: boolean;
    drawCalls: number;
    pixelRatioChanged: boolean;
    bloomResolutionChanged: boolean;
    bloomEnabledChanged: boolean;
    effectiveChanged: boolean;
    applyFrameMs: number;
  }

  const snapshots: LevelSnapshot[] = [];

  for (let level = 0; level <= MAX_LEVEL; level += 1) {
    const applied = renderRoot.applyPerformanceLevel(level);
    // 段階適用直後の1フレームの所要時間（描画バッファ再確保を含む一度きりの負荷）を測る。
    const start = performance.now();
    renderRoot.render();
    const applyFrameMs = performance.now() - start;
    // 続けて数フレーム描き、描画命令数を安定させてから読む。
    for (let frame = 1; frame < FRAMES_PER_LEVEL; frame += 1) {
      renderRoot.render();
    }
    const state = renderRoot.state();
    snapshots.push({
      requestedLevel: level,
      degradationLevel: state.degradationLevel,
      pixelRatio: state.pixelRatio,
      bloomResolutionScale: state.bloom ? state.bloom.resolutionScale : -1,
      bloomEnabled: state.bloom ? state.bloom.enabled : false,
      outputPassEnabled: state.bloom ? state.bloom.outputPassEnabled : false,
      drawCalls: state.drawCalls,
      pixelRatioChanged: applied.pixelRatioChanged,
      bloomResolutionChanged: applied.bloomResolutionChanged,
      bloomEnabledChanged: applied.bloomEnabledChanged,
      effectiveChanged: applied.effectiveChanged,
      applyFrameMs,
    });
  }

  const webglAvailable = renderRoot.state().webglAvailable;

  window.__perfApplied = () => ({
    webglAvailable,
    devicePixelRatio: window.devicePixelRatio,
    levels: snapshots,
  });

  hud.textContent =
    `perf budget levels (devicePixelRatio ${window.devicePixelRatio})\n` +
    snapshots
      .map(
        (s) =>
          `L${s.requestedLevel} dpr=${s.pixelRatio} bloomScale=${s.bloomResolutionScale} ` +
          `bloom=${s.bloomEnabled ? "on" : "off"} draws=${s.drawCalls} applyMs=${s.applyFrameMs.toFixed(1)}`
      )
      .join("\n");

  // ページ破棄時に後始末し、公開したアクセサを削除する。
  window.addEventListener("beforeunload", () => {
    renderRoot.dispose();
    delete window.__perfApplied;
  });
}
