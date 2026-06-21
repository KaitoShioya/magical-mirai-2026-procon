// 描画性能ゲート（Issue #97）の計測ページ（performance.html の入口）。本番と同じ描画基盤（createRenderRoot）を
// 作り、本番と同じ経路（mountCenterCharacter・mountStageTerrain）で中心キャラクターのVRMと舞台土台を読み込み、
// VRM常在を含む情景を連続描画する。品質検査ハーネス（scripts/performance-quality.mjs）が読む計測フック
// （window.__fps・__avgFps・__fpsSamples・__resetFps・__drawCalls・__pixelRatio）を公開する。本ページは
// 本番ビルド（--mode app）では配信しない。
//
// 計測フックを読み込み完了後にだけ公開する採用理由を先に述べる。ハーネスの waitForReady は window.__fps が
// 関数として存在することを準備完了の条件にする。VRMと舞台土台の読み込み完了後にフックを公開すれば、
// ハーネスの標本窓が必ずVRM常在状態だけを含み、読み込み前の軽い状態を計測へ混ぜない。
//
// 標本刻みを500ミリ秒にする採用理由を先に述べる。計測ツール本体 src/tools/perf/main.ts と同じ刻みであり、
// 計測時間12秒で24標本となるため、下位5パーセンタイルが生最低と一致しない（順位2以上になる）標本数21以上を
// 満たす（scripts/harness/config.mjs の計測時間の採用理由と整合）。
//
// クエリのノブ:
//   miku=0|1        VRM常在の有無（既定1）。0のとき中心キャラクターを読み込まない。
//   reflectMiku=0|1 VRMを反射に含めるか（既定1）。miku=0 のときは意味を持たないため無視する。
//   bloom=0|1       ブルームの有無（既定1）。
//   refl=0|256|512  反射解像度（既定512）。0で反射無効。
//   terrain=0|1     舞台土台の有無（既定1）。0のとき舞台土台を読み込まない。
//   level=整数       縮退段階（任意）。指定時に読み込み後 applyPerformanceLevel へ渡す。

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
const withMiku = query.get("miku") !== "0";
const reflectMiku = query.get("reflectMiku") !== "0";
const withBloom = query.get("bloom") !== "0";
const withTerrain = query.get("terrain") !== "0";
const reflectionResolution = query.has("refl") ? Number(query.get("refl")) : 512;
// 縮退段階。有限の整数のときだけ採る（applyPerformanceLevel は範囲外も内部で丸めるが、入力を明示的に検証する）。
const levelRaw = query.get("level");
const requestedLevel =
  levelRaw !== null && Number.isFinite(Number(levelRaw)) ? Math.trunc(Number(levelRaw)) : null;

const renderRoot = createRenderRoot(container, {
  reflectionResolution,
  bloomEnabled: withBloom,
});

// ---- 計測フックの内部状態（読み込み完了後に公開する） ----
let frames = 0;
let lastSampleMs = performance.now();
let fps = 0;
const samples: number[] = [];

function resetFps(): void {
  // 計測開始直後に直前区間の値が混じらないよう、標本と区間カウンタを揃えて初期化する。
  samples.length = 0;
  frames = 0;
  fps = 0;
  lastSampleMs = performance.now();
}

function publishMeasurementHooks(): void {
  window.__fps = () => fps;
  window.__avgFps = () =>
    samples.length ? samples.reduce((acc, value) => acc + value, 0) / samples.length : 0;
  // 区間ごとの毎秒フレーム数の生標本を複製して返す（外部から内部配列を書き換えられないようにするため）。
  window.__fpsSamples = () => samples.slice();
  window.__resetFps = resetFps;
  // 参考診断。描画命令数と画素密度倍率は本番描画基盤の状態から読む（state() は描画器が無くても安全に返す）。
  window.__drawCalls = () => renderRoot.state().drawCalls;
  window.__pixelRatio = () => renderRoot.state().pixelRatio;
}

function deleteMeasurementHooks(): void {
  delete window.__fps;
  delete window.__avgFps;
  delete window.__fpsSamples;
  delete window.__resetFps;
  delete window.__drawCalls;
  delete window.__pixelRatio;
}

// ---- 読み込み（VRMと舞台土台）。完了後に計測フックを公開する ----
let loaded = false;
async function load(): Promise<void> {
  // 反射への含有の意図値を先に設定する（意図値は renderRoot が保持し、舞台土台の読み込みで水面が再生成されても保たれる）。
  if (withMiku && !reflectMiku) {
    renderRoot.setCenterFigureReflected(false);
  }
  const tasks: Array<Promise<boolean>> = [];
  if (withMiku) {
    tasks.push(renderRoot.mountCenterCharacter(MIKU_CHARACTER));
  }
  if (withTerrain) {
    tasks.push(renderRoot.mountStageTerrain(LAKE_STAGE));
  }
  await Promise.all(tasks);
  if (requestedLevel !== null) {
    renderRoot.applyPerformanceLevel(requestedLevel);
  }
  loaded = true;
  publishMeasurementHooks();
}
void load();

// ---- 連続描画ループと500ミリ秒刻みの毎秒フレーム数計測 ----
let lastTimeMs = performance.now();
function frame(nowMs: number): void {
  const deltaSeconds = (nowMs - lastTimeMs) / 1000;
  lastTimeMs = nowMs;
  renderRoot.update(deltaSeconds);
  renderRoot.render();

  frames += 1;
  const elapsed = nowMs - lastSampleMs;
  if (elapsed >= 500) {
    fps = Math.round((frames * 1000) / elapsed);
    frames = 0;
    lastSampleMs = nowMs;
    samples.push(fps);
    if (samples.length > 120) {
      samples.shift();
    }
    refreshHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function refreshHud(): void {
  const state = renderRoot.state();
  const avg = samples.length
    ? samples.reduce((acc, value) => acc + value, 0) / samples.length
    : 0;
  const reflectNote = withMiku ? `反射含有=${reflectMiku ? "あり" : "なし"}` : "反射含有=無視（miku=0）";
  hud.textContent =
    `${loaded ? "計測中" : "読み込み中…"} FPS ${fps} 平均 ${avg.toFixed(0)} 標本 ${samples.length}\n` +
    `ミク=${withMiku ? "あり" : "なし"}(${state.centerFigureStatus}) 土台=${withTerrain ? "あり" : "なし"} ` +
    `ブルーム=${withBloom ? "有効" : "無効"} 反射解像度=${state.reflectionResolution} ${reflectNote}\n` +
    `画素密度倍率=${state.pixelRatio} 描画命令=${state.drawCalls} 段階=${state.degradationLevel}`;
}

// ページ破棄時に後始末してから公開フックを削除する（既存診断ページと同じ順序）。
window.addEventListener("beforeunload", () => {
  renderRoot.dispose();
  deleteMeasurementHooks();
});
