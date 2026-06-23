// ランク専用ゲージ（Issue #65）の受け入れ診断ページ（rank-gauge.html の入口）。
// ランク専用ゲージは2次元層の表示物のため、本番と同じ2次元層（createOverlayLayer）に載せ、軽量な WebGLRenderer で
// 合成して描く。百分位を 0→100 で周回させて色が C→B→A→S へ滑らかに移るのを目視できるようにする。
// 受け入れ判定の数値は副作用の無い問い合わせ window.__rankGaugeProbe、現在の表示事実 window.__rankGaugeState、
// 指定百分位で描いて満ちバー中心の画素を読み戻す window.__rankGaugeSampleAt で公開する。
// 本ページは本番ビルド（--mode app）では配信しない。
//
// 軽量レンダラを本ページ自身で構成する理由を先に述べる。ヘッドレスのソフトウェア描画では、重い夜景シーンと
// 描画基盤の WebGL2 可否プローブ文脈を同時に持つと描画文脈が失われ、画素読み戻しが純黒になる。画素読み戻しを
// 行う既存の受け入れ診断（層合成 layer-composite）と同じく、単一の軽量文脈で2次元層だけを描いて読み戻す。
// 2次元層の合成手順（深度のみ消去して最前面へ重ねる）と色の取り扱い（出力 sRGB・トーンマップ無効）は本番と同一。
//
// ランクの帯分けは唯一所有元 src/scoring/rank.ts の rankFromPercentile・rankOrdinal を使い、帯境界（25/50/75）を
// 本ページ内へ再定義しない（診断こそランク判定のドリフト検出に使うため）。

import { Color, WebGLRenderer } from "three";
import { createOverlayLayer } from "../../overlay";
import { createRankGauge } from "../../rankGauge";
import { clampPixelRatio, computeOverlayFrustum } from "../../viewport";
import { NIGHT_COLOR } from "../../constants";
import { rankFromPercentile, rankOrdinal } from "../../../scoring/rank";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

// 画素密度倍率の上限は本番（viewport.ts）と同じ2に揃える。
const PIXEL_RATIO_CAP = 2;

// 単一の軽量レンダラ。色を消さずに2次元層を重ねるため autoClear を偽にする。
const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.autoClear = false;
renderer.setClearColor(new Color(NIGHT_COLOR), 1);
container.appendChild(renderer.domElement);

const overlay = createOverlayLayer({
  displayWidth: container.clientWidth,
  displayHeight: container.clientHeight,
});
const gauge = createRankGauge();
overlay.addObject(gauge.object);

const gl = renderer.getContext();

function viewportPixelWidth(): number {
  return Math.round(container.clientWidth * (window.devicePixelRatio || 1));
}
function viewportPixelHeight(): number {
  return Math.round(container.clientHeight * (window.devicePixelRatio || 1));
}
function currentAspect(): number {
  return computeOverlayFrustum(viewportPixelWidth(), viewportPixelHeight()).right;
}

// 直近に適用した寸法・画素密度倍率。毎フレーム setSize/setPixelRatio を呼ぶと描画バッファを毎回再確保し、
// ソフトウェア描画では描画文脈が失われるため、値が変わったときだけ再設定する。
let lastWidth = 0;
let lastHeight = 0;
let lastRatio = 0;

/** レンダラと2次元層の寸法を現在の表示寸法へ合わせる（寸法・画素密度倍率が変わったときだけ再設定する）。 */
function applySize(): void {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const ratio = clampPixelRatio(window.devicePixelRatio || 1, PIXEL_RATIO_CAP);
  if (width === lastWidth && height === lastHeight && ratio === lastRatio) {
    return;
  }
  lastWidth = width;
  lastHeight = height;
  lastRatio = ratio;
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);
  overlay.resize(width, height);
}
applySize();
window.addEventListener("resize", applySize);

/** ランクの添字（0=C, 1=B, 2=A, 3=S）を唯一所有元の帯分けから求める。 */
function rankIndexForPercentile(percentile: number): number {
  return rankOrdinal(rankFromPercentile(percentile));
}

/** ゲージを指定百分位へ更新する（横位置・満ち量・色・文字を確定）。 */
function updateGaugeAt(percentile: number): void {
  gauge.update({
    percentile,
    rankIndex: rankIndexForPercentile(percentile),
    aspect: currentAspect(),
    viewportPixelHeight: viewportPixelHeight(),
  });
}

/** 暗い背景を1回塗ってから2次元層を最前面へ重ねる（本番の合成手順と同じ重ね方）。 */
function drawOnce(): void {
  renderer.setRenderTarget(null);
  renderer.clear();
  overlay.composite(renderer);
}

/** 満ちバー中心の描画画素（sRGB、各チャンネル0..1）を読み戻す。描画バッファが無いときは null。 */
function readFillCenterPixel(): [number, number, number] | null {
  const bufferWidth = gl.drawingBufferWidth;
  const bufferHeight = gl.drawingBufferHeight;
  if (bufferWidth <= 0 || bufferHeight <= 0) {
    return null;
  }
  const state = gauge.state();
  // 2次元層は中央原点・上方向正、gl.readPixels も左下原点で上方向正のため両軸の符号は一致する。
  // 換算係数は両軸とも「描画バッファ高さ ÷ 2」（等方）。満ちバー中心は横が groupX、縦が下端と満ち上端の中点。
  const pixelsPerUnit = bufferHeight / 2;
  const fillCenterY = (state.trackBottomY + state.fillTopY) / 2;
  const x = Math.round(bufferWidth / 2 + state.groupX * pixelsPerUnit);
  const y = Math.round(bufferHeight / 2 + fillCenterY * pixelsPerUnit);
  const bytes = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  return [bytes[0] / 255, bytes[1] / 255, bytes[2] / 255];
}

// 受け入れ判定に使う百分位（帯中心）の満ちバー中心画素を、読み込み直後に同期で読み戻して控える。
// 採用理由を先に述べる。ヘッドレスのソフトウェア描画では読み込みののち時間を置くと描画文脈が失われ画素が読めなく
// なるため、画素読み戻しを行う既存の受け入れ診断（層合成）と同じく、読み込み直後に同期で読み、結果を控える。
const PRESAMPLE_PERCENTILES = [12.5, 37.5, 62.5, 87.5];
// 安定状態を見る最小の暖め描画回数（層合成診断の5回に倣う）。
const WARMUP_DRAWS = 5;
const cachedPixels = new Map<number, [number, number, number] | null>();
for (let i = 0; i < WARMUP_DRAWS; i += 1) {
  updateGaugeAt(0);
  drawOnce();
}
for (const presamplePercentile of PRESAMPLE_PERCENTILES) {
  updateGaugeAt(presamplePercentile);
  drawOnce();
  cachedPixels.set(presamplePercentile, readFillCenterPixel());
}

// 表示用百分位の周回周期（ミリ秒）。0→100 を繰り返し、C→B→A→S の色掃引を目視できるようにする。
const DISPLAY_PERIOD_MS = 6000;

let startMs: number | null = null;
let rafHandle = 0;

function frame(nowMs: number): void {
  if (startMs === null) {
    startMs = nowMs;
  }
  const phase = ((nowMs - startMs) % DISPLAY_PERIOD_MS) / DISPLAY_PERIOD_MS;
  const percentile = phase * 100;

  applySize();
  updateGaugeAt(percentile);

  const state = gauge.state();
  const probe = gauge.probe(percentile);
  hud.textContent =
    `percentile=${percentile.toFixed(1)} rankIndex=${state.rankIndex} fill=${state.fillFraction.toFixed(3)}\n` +
    `color(sRGB)=${probe.color.map((c) => c.toFixed(3)).join(", ")} groupX=${state.groupX.toFixed(3)}`;

  // 描画文脈が失われている間は描かない（ヘッドレスのソフトウェア描画で起こる。実ブラウザでは失われず描き続ける）。
  if (!gl.isContextLost()) {
    drawOnce();
  }

  rafHandle = requestAnimationFrame(frame);
}
rafHandle = requestAnimationFrame(frame);

// 副作用の無い問い合わせ。指定百分位の満ち量 t・算出色（材質へ設定する値そのもの）・ランク添字を返す。
window.__rankGaugeProbe = (percentile: number) => {
  const probe = gauge.probe(percentile);
  return {
    t: probe.t,
    color: [probe.color[0], probe.color[1], probe.color[2]],
    rankIndex: rankIndexForPercentile(percentile),
  };
};

// 現在の表示事実（描画状態を変えない）。視錐台の横半幅 aspect を添えて、矩形が画面内かの検査に使う。
window.__rankGaugeState = () => {
  const state = gauge.state();
  return {
    groupX: state.groupX,
    width: state.width,
    trackBottomY: state.trackBottomY,
    trackTopY: state.trackTopY,
    fillFraction: state.fillFraction,
    fillTopY: state.fillTopY,
    rankIndex: state.rankIndex,
    letterCenterY: state.letterCenterY,
    aspect: currentAspect(),
  };
};

// 指定百分位でゲージの表示事実を返す。満ちバー中心の描画画素は、帯中心の百分位については読み込み直後に控えた値を、
// それ以外は（描画文脈が生きていれば）その場の読み戻しを返す。算出色（材質へ設定する値）と描画画素の両方を確認
// できるようにして、色空間適用の取り違えを検出する。
window.__rankGaugeSampleAt = (percentile: number) => {
  updateGaugeAt(percentile);
  const state = gauge.state();
  const probe = gauge.probe(percentile);
  const aspect = currentAspect();

  let pixel: [number, number, number] | null;
  if (cachedPixels.has(percentile)) {
    pixel = cachedPixels.get(percentile) ?? null;
  } else if (!gl.isContextLost()) {
    drawOnce();
    pixel = readFillCenterPixel();
  } else {
    pixel = null;
  }

  return {
    percentile,
    t: probe.t,
    rankIndex: rankIndexForPercentile(percentile),
    color: [probe.color[0], probe.color[1], probe.color[2]] as [number, number, number],
    pixel,
    fillFraction: state.fillFraction,
    groupX: state.groupX,
    width: state.width,
    trackBottomY: state.trackBottomY,
    trackTopY: state.trackTopY,
    fillTopY: state.fillTopY,
    letterCenterY: state.letterCenterY,
    aspect,
  };
};

// ページ破棄時に後始末する。描画反復の予約取り消し・寸法待ち受けの解除・2次元層からの取り外し・ゲージの資源解放・
// 2次元層とレンダラの解放・公開アクセサ削除を行う。
window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(rafHandle);
  window.removeEventListener("resize", applySize);
  overlay.removeObject(gauge.object);
  gauge.dispose();
  overlay.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  delete window.__rankGaugeProbe;
  delete window.__rankGaugeState;
  delete window.__rankGaugeSampleAt;
});
