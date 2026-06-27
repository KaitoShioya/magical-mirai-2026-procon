// 判定UI 落下式レーン（Issue #57）の受け入れ診断ページ（falling-lane.html の入口）。
// 本番と同じ描画基盤（createRenderRoot）に落下式レーンを2次元層へ載せ、固定のテスト用ノーツ列を壁時計の
// 経過をゲーム時刻とみなして駆動し、落下を目視できるようにする。受け入れ判定の数値は window.__fallingLaneProbe
// （副作用の無い問い合わせ）で公開する。本ページは本番ビルド（--mode app）では配信しない。
//
// 壁時計の経過をゲーム時刻に用いる理由を先に述べる。本診断は本編のゲームループ（再生位置由来の時計）を使わず、
// レーン単体を実機ブラウザで動かして目視と計測を行う。問い合わせ __fallingLaneProbe は引数のゲーム時刻に対して
// 落下位置の純粋関数で計算するだけで、描画の進行とは切り離す。

import { createRenderRoot } from "../../renderRoot";
import { createFallingLane } from "../../fallingLane";
import { computeOverlayFrustum } from "../../viewport";
import type { LaneNote } from "../../../types/judgmentLane";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const renderRoot = createRenderRoot(container);

// 固定のテスト用ノーツ列。識別子で特定ノーツを引けるよう一意の識別子を付ける。時刻昇順で、音程番号は1〜7。
const TEST_NOTES: LaneNote[] = [
  { id: "probe-a", timeMs: 1000, slotIndex: 3 },
  { id: "probe-b", timeMs: 2000, slotIndex: 7 },
  { id: "probe-c", timeMs: 2600, slotIndex: 1 },
  { id: "probe-d", timeMs: 5000, slotIndex: 5 },
];

const lane = createFallingLane({ notes: TEST_NOTES });
renderRoot.addOverlayObject(lane.object);

function viewportPixelWidth(): number {
  return Math.round(container.clientWidth * (window.devicePixelRatio || 1));
}
function viewportPixelHeight(): number {
  return Math.round(container.clientHeight * (window.devicePixelRatio || 1));
}
function currentAspect(): number {
  return computeOverlayFrustum(viewportPixelWidth(), viewportPixelHeight()).right;
}

// 表示用ゲーム時刻の巡回の周期（ミリ秒）。採用理由を先に述べる。テスト用ノーツの最終時刻は5000ミリ秒で、
// これに少しの余白を足した7000ミリ秒を周期として壁時計の経過を巡回させると、ライブ目視で落下を繰り返し
// 観察できる。検査用の問い合わせ __fallingLaneProbe は引数のゲーム時刻で計算するため巡回の影響を受けない。
const DISPLAY_PERIOD_MS = 7000;

let startMs: number | null = null;
let lastMs = 0;
let rafHandle = 0;

function frame(nowMs: number): void {
  if (startMs === null) {
    startMs = nowMs;
    lastMs = nowMs;
  }
  const gameTimeMs = (nowMs - startMs) % DISPLAY_PERIOD_MS;
  const deltaSeconds = Math.max(0, (nowMs - lastMs) / 1000);
  lastMs = nowMs;

  lane.update({ gameTimeMs, aspect: currentAspect(), viewportPixelHeight: viewportPixelHeight() });
  renderRoot.update(deltaSeconds);
  renderRoot.render();

  hud.textContent =
    `gameTime=${Math.round(gameTimeMs)}ms 可視=${lane.probe(gameTimeMs).length} 消滅エフェクト=${lane.burstActiveCount()}\n` +
    `topY=${lane.topY.toFixed(3)} 通路左=${lane.channelLeftX().toFixed(3)} 通路右=${lane.channelRightX().toFixed(3)}`;

  rafHandle = requestAnimationFrame(frame);
}
rafHandle = requestAnimationFrame(frame);

window.__fallingLaneProbe = (gameTimeMs: number) => {
  // 落下位置は副作用の無い純粋な問い合わせで計算する。通路の両端・縦横比・表示物数・消滅エフェクトは描画状態を変えずに読む。
  return {
    notes: lane.probe(gameTimeMs),
    topY: lane.topY,
    judgmentLineY: lane.judgmentLineY,
    channelLeftX: lane.channelLeftX(),
    channelRightX: lane.channelRightX(),
    aspect: currentAspect(),
    overlayObjectCount: renderRoot.state().overlay?.objectCount ?? 0,
    burstActiveCount: lane.burstActiveCount(),
    burstSuppressedCount: lane.burstSuppressedCount(),
    burstSample: lane.burstSample(),
  };
};

// ページ破棄時に後始末する。描画反復の予約取り消し・2次元層からの取り外し・レーンの資源解放・描画基盤の解放・
// 公開アクセサ削除を行う。
window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(rafHandle);
  renderRoot.removeOverlayObject(lane.object);
  lane.dispose();
  renderRoot.dispose();
  delete window.__fallingLaneProbe;
});
