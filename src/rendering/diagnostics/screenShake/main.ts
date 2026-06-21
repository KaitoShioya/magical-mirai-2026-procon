// 画面拡大・減衰揺れの受け入れ診断ページ（screen-shake.html の入口、Issue #76）。
// 本番と同じ描画基盤（createRenderRoot）に2次元層の物体を載せ、出典由来の暫定TAKEOVER拍データで
// 拍同期スケジューラ（#16）と演出評価器（src/utils/screenShake）を実時間で駆動する。評価した変換を
// renderRoot.setScreenTransform で実canvasへ当て、3D世界（湖）と2次元層が一体で拡大・揺れすることを目視できる。
// 受け入れ判定の数値は window.__screenShakeProbe（決定的評価）と window.__screenShakeState（直近適用値）で公開する。
// 本ページは本番ビルド（--mode app）では配信しない。
//
// 実時間の刻みに performance.now を用いる理由を先に述べる。本診断は本編のゲームループ（再生位置由来の時計）を
// 使わず、演出単体を実機ブラウザで動かして目視と計測を行う。壁時計の経過を曲時刻とみなし、暫定拍が経過とともに
// 跨がれて発火する。

import { Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { createRenderRoot } from "../../renderRoot";
import { createBeatScheduler } from "../../../utils/beatScheduler";
import {
  createScreenShake,
  resolveBeatAmplitudes,
  BEAT_AMPLITUDE_DOWNBEAT,
} from "../../../utils/screenShake";
import { PROVISIONAL_TAKEOVER_BEATS } from "./provisionalTakeoverBeats";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

// 決定的評価の既定の画面寸法（画素）。スモークが減衰比・余白内拘束を時間非依存に検証するための固定値。
const PROBE_WIDTH = 1000;
const PROBE_HEIGHT = 1000;

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const renderRoot = createRenderRoot(container);

// 2次元層の物体（赤い四角）を最前面へ載せる。3D世界（湖）と一体で拡大・揺れすることを目視するための目印。
// 2次元層の座標は中央原点・高さの基準軸で±1のため、中央に一辺0.5の正方形を置く。
const markerGeometry = new PlaneGeometry(0.5, 0.5);
const markerMaterial = new MeshBasicMaterial({ color: 0xff3366 });
const marker = new Mesh(markerGeometry, markerMaterial);
renderRoot.addOverlayObject(marker);

// 拍ごとの拡大量を前計算し、拍時刻配列で拍同期スケジューラを作る。
const amplitudes = resolveBeatAmplitudes(PROVISIONAL_TAKEOVER_BEATS);
const beatStartTimesMs = PROVISIONAL_TAKEOVER_BEATS.map((b) => b.startTimeMs);
const beatScheduler = createBeatScheduler(beatStartTimesMs);
const screenShake = createScreenShake();
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

// 壁時計の基準を0に貼り、以後は経過を曲時刻として拍を跨がせる。
beatScheduler.syncTo(0);

let startMs: number | null = null;
let lastMs = 0;
let rafHandle = 0;

// 毎秒フレーム数の計測（500ミリ秒区間）。性能ゲート scripts/screen-shake-fps.mjs が窓 __fps 系から読む。
let fpsFrames = 0;
let fpsWindowStartMs = 0;
let fps = 0;
const fpsSamples: number[] = [];

function frame(nowMs: number): void {
  if (startMs === null) {
    startMs = nowMs;
    lastMs = nowMs;
    fpsWindowStartMs = nowMs;
  }
  const songTimeMs = nowMs - startMs;
  const deltaSeconds = Math.max(0, (nowMs - lastMs) / 1000);
  lastMs = nowMs;

  // 跨がれた拍を演出評価器へ登録する。
  beatScheduler.advance(songTimeMs, (event) => {
    screenShake.trigger(event.timeMs, amplitudes[event.index], event.index);
  });

  // canvasの表示寸法を毎フレーム読む（表示寸法の変更に追従する）。
  const width = container.clientWidth;
  const height = container.clientHeight;
  const transform = screenShake.evaluate(songTimeMs, width, height, reduceMotionQuery.matches);
  renderRoot.setScreenTransform(transform.scale, transform.offsetX, transform.offsetY);

  renderRoot.update(deltaSeconds);
  renderRoot.render();

  // 毎秒フレーム数を500ミリ秒区間で集計する。
  fpsFrames += 1;
  if (nowMs - fpsWindowStartMs >= 500) {
    fps = Math.round((fpsFrames * 1000) / (nowMs - fpsWindowStartMs));
    fpsSamples.push(fps);
    if (fpsSamples.length > 120) {
      fpsSamples.shift();
    }
    fpsFrames = 0;
    fpsWindowStartMs = nowMs;
  }

  hud.textContent =
    `songTime=${Math.round(songTimeMs)}ms reducedMotion=${reduceMotionQuery.matches} fps=${fps}\n` +
    `scale=${transform.scale.toFixed(4)} offset=(${transform.offsetX.toFixed(1)}, ${transform.offsetY.toFixed(1)})`;

  rafHandle = requestAnimationFrame(frame);
}
rafHandle = requestAnimationFrame(frame);

// 毎秒フレーム数の計測フック（性能ハーネス scripts/harness が読む契約に合わせる）。
window.__fps = () => fps;
window.__avgFps = () =>
  fpsSamples.length ? fpsSamples.reduce((acc, value) => acc + value, 0) / fpsSamples.length : 0;
window.__fpsSamples = () => fpsSamples.slice();
window.__resetFps = () => {
  fpsSamples.length = 0;
  fpsFrames = 0;
  fps = 0;
  fpsWindowStartMs = performance.now();
};

window.__screenShakeState = () => {
  const state = renderRoot.state();
  return {
    webglAvailable: state.webglAvailable,
    reducedMotion: reduceMotionQuery.matches,
    transform: state.screenTransform,
  };
};

window.__screenShakeProbe = (elapsedMs: number) => {
  // 小節頭の拡大量の拍を時刻0で1回登録した評価器の、経過ミリ秒における変換を返す（決定的）。
  const probe = createScreenShake();
  probe.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 0);
  return probe.evaluate(elapsedMs, PROBE_WIDTH, PROBE_HEIGHT, false);
};

// ページ破棄時に後始末する。描画反復の予約取り消し・描画基盤の解放・載せた物体のGPU資源解放・公開アクセサ削除を行う。
window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(rafHandle);
  renderRoot.removeOverlayObject(marker);
  renderRoot.dispose();
  markerGeometry.dispose();
  markerMaterial.dispose();
  delete window.__screenShakeState;
  delete window.__screenShakeProbe;
  delete window.__fps;
  delete window.__avgFps;
  delete window.__fpsSamples;
  delete window.__resetFps;
});
