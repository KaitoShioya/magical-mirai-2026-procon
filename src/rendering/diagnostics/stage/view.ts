// 舞台土台モデル（Issue #105）の目視確認ページ（stage-view.html の入口）。開発サーバ専用で、ビルド入力・
// 本番配信・スモークには含めない。深夜の本編は背景・水面・地形がいずれも近い暗色のため形状を目視しづらい。
// 本ページは調整のため、明るいデバッグ照明と俯瞰カメラで地形・水面・原点（ミク相当の基準球）を描き、
// 第3節パラメータ（高さ拡大率・スケール・構図）の見栄えと、地形が水面を囲む湖盆であることを確認する。
// 本ページは描画方針の検証用であり本編の見えとは異なる（本編の見えは stage.html・index.html で確認する）。

import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LAKE_STAGE } from "../../../config/stage";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new Scene();
// デバッグ用の明るい背景。地形を視認するための調整用であり、本編の深夜色とは異なる。
scene.background = new Color(0x202a38);

const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);

// 明るいデバッグ照明（空・地面の半球光＋斜め上からの平行光）。地形の起伏を陰影で見せる。
scene.add(new HemisphereLight(0xcfe0ff, 0x404838, 1.1));
scene.add(new AmbientLight(0xffffff, 0.25));
const sun = new DirectionalLight(0xffffff, 1.2);
sun.position.set(120, 200, 140);
scene.add(sun);

// 原点（湖の中心、ミクを置く点）の基準球。半径はミク（高さ約4.2ワールド単位）の半分の2.1で立たせる。
const MIKU_HALF_HEIGHT = 2.1;
const marker = new Mesh(
  new SphereGeometry(MIKU_HALF_HEIGHT, 24, 16),
  new MeshStandardMaterial({ color: 0xff5577, emissive: 0x551122 })
);
marker.position.set(0, MIKU_HALF_HEIGHT, 0);
scene.add(marker);

const content = new Group();
scene.add(content);

let angle = 0.7;
let radius = 360;
let height = 240;
let center = new Vector3(0, 0, 0);

const loader = new GLTFLoader();
loader.load(
  LAKE_STAGE.url,
  (gltf) => {
    const terrain = gltf.scene.getObjectByName(LAKE_STAGE.terrainNodeName);
    const water = gltf.scene.getObjectByName(LAKE_STAGE.waterNodeName);
    if (terrain) {
      terrain.traverse((object) => {
        const mesh = object as Mesh;
        const geometry = mesh.geometry as BufferGeometry | undefined;
        if (geometry) {
          geometry.computeVertexNormals();
          // 標高で色を変えると湖盆の形が分かりやすい。デバッグ用の色分けマテリアル。
          mesh.material = new MeshStandardMaterial({ color: 0x7c8a5a, roughness: 1, side: DoubleSide });
        }
      });
      content.add(terrain);
    }
    if (water) {
      water.traverse((object) => {
        const mesh = object as Mesh;
        if ((mesh.geometry as BufferGeometry | undefined) !== undefined) {
          // 水面を不透明にする理由を先に述べる。半透明だと水面の下の湖底の地形色が透けて、DEM由来の水面の
          // 領域と延長した水面の領域で色が違って見える。本編は単一の反射水面で一様なため、目視も不透明な単一色の
          // 水面にして一様な湖面として見せ、湖底（水面より低い地形）は水面で覆って隠す。
          mesh.material = new MeshStandardMaterial({
            color: 0x2a6ad0,
            roughness: 0.25,
            metalness: 0.0,
            side: DoubleSide,
          });
        }
      });
      content.add(water);
    }
    // 地形全体が画面に収まる距離へカメラを引く。
    const box = new Box3().setFromObject(content);
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    radius = Math.max(size.x, size.z) * 1.1;
    height = size.x * 0.7;
    hud.textContent =
      `stage-view（開発専用・デバッグ照明）\n` +
      `terrain: ${terrain ? "あり" : "なし"}  water: ${water ? "あり" : "なし"}\n` +
      `範囲 X:${box.min.x.toFixed(0)}〜${box.max.x.toFixed(0)} Z:${box.min.z.toFixed(0)}〜${box.max.z.toFixed(0)} 高さ:${box.min.y.toFixed(1)}〜${box.max.y.toFixed(1)}`;
  },
  undefined,
  (error) => {
    hud.textContent = "読み込み失敗: " + (error instanceof Error ? error.message : String(error));
  }
);

function frame(): void {
  // ゆっくり周回して全方位から地形を見せる。
  angle += 0.0025;
  camera.position.set(
    center.x + radius * Math.cos(angle),
    center.y + height,
    center.z + radius * Math.sin(angle)
  );
  camera.lookAt(center.x, center.y, center.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
