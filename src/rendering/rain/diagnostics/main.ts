// 雨パーティクルの単独診断ページ（rain.html の入口）。
// 実装した本物の雨モジュールを最小シーンで駆動し、連続落下と粒数0の消滅を目視確認する。
// 描画器・シーン・カメラは Issue #8 の定数（rendering/constants）と純粋関数（rendering/viewport）を
// 再利用して本編の見えに揃える。three.js は名前付きでのみ取り込む。本ページは本番ビルド（--mode app）では配信しない。

import { Color, FogExp2, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
} from "../../constants";
import { clampPixelRatio, computeAspect } from "../../viewport";
import { RAIN_PARTICLE_COUNT_DEFAULT } from "../constants";
import { createRainSystem, normalizeCount } from "../rain";

// 依存規則により描画層は tools を import しないため、要素取得は内製する。
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const query = new URLSearchParams(location.search);

// クエリ rain（粒数）の正規化。Number() で解釈する理由を先に述べる。parseInt は "12abc" のような
// 末尾混じりを通すため使わない。解釈値を normalizeCount に通すため、負の数値と空文字は0（雨なし）になる
// （空文字は Number("")=0 のため0扱い）。数値として解釈できない値（例として rain=abc）だけ
// 既定 RAIN_PARTICLE_COUNT_DEFAULT へ戻る。
const rainQuery = query.get("rain");
const RAIN_COUNT =
  rainQuery === null
    ? RAIN_PARTICLE_COUNT_DEFAULT
    : normalizeCount(Number(rainQuery), RAIN_PARTICLE_COUNT_DEFAULT);

// クエリ dpr（画素密度上限）の正規化。有限かつ正なら採用し、それ以外は既定 MAX_PIXEL_RATIO とし、
// いずれの場合も clampPixelRatio を通して上限を超える値を排除する。
const dprQuery = Number(query.get("dpr"));
const PIXEL_CAP = Number.isFinite(dprQuery) && dprQuery > 0 ? dprQuery : MAX_PIXEL_RATIO;

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, PIXEL_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);
scene.fog = new FogExp2(NIGHT_COLOR, FOG_DENSITY);

const camera = new PerspectiveCamera(
  CAMERA_FOV,
  computeAspect(window.innerWidth, window.innerHeight),
  CAMERA_NEAR,
  CAMERA_FAR
);
// 雨は中心から±45・高さ0〜40に広がる。その柱を正面から収める位置にカメラを置く。
camera.position.set(0, 16, 62);
camera.lookAt(new Vector3(0, 14, 0));

const rain = createRainSystem({ count: RAIN_COUNT });
scene.add(rain.object);

// 検証用の状態読み出し（本ページは本番ビルドに含まれない開発診断のため、状態を外部へ公開してよい）。
// 描画中の雨の頂点数と先頭粒のY座標を返す。連続落下（先頭粒のYが時間とともに動き、0以上40未満に留まる）と
// 粒数0の消滅（頂点数0）を、GPUの有無に依らず自動検証で確かめられるようにする。
(window as unknown as { __rainProbe?: () => { count: number; firstY: number | null } }).__rainProbe =
  () => {
    const attribute = rain.object.geometry.getAttribute("position");
    const count = attribute ? attribute.count : 0;
    return { count, firstY: count > 0 ? attribute.getY(0) : null };
  };

window.addEventListener("resize", () => {
  camera.aspect = computeAspect(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 毎秒フレーム数の表示。1フレームごとの所要時間から瞬間値を求める。
let lastFrameTime = performance.now();
let instantFps = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const deltaMs = now - lastFrameTime;
  lastFrameTime = now;

  rain.update(deltaMs);
  renderer.render(scene, camera);

  if (deltaMs > 0) {
    instantFps = Math.round(1000 / deltaMs);
  }
  // 粒数を常に表示する理由を先に述べる。rain=0 のとき画面が空になるだけだと読み込み失敗と区別できないため、
  // 正規化後の粒数（0を含む）を明示して消滅が意図どおりであることを確認できるようにする。
  hud.textContent = `粒数 ${RAIN_COUNT}  毎秒フレーム数 ${instantFps}`;
}

requestAnimationFrame(frame);
