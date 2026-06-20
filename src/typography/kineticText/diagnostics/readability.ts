// 可読性の受け入れ診断ページ（readability.html の入口）。
// 読ませる役の文字を、不利な背景の代表集合（暗い背景・明るい背景・暗から明への階調背景・ブルームで強くにじむ
// 明るい発光塊・湖のコード描画を模した高周波の模様の背景）の上に描き、発光とブルーム後処理を通した最終描画画素
// （最終出力段の後）から、文字内部と縁取りのコントラスト比を計測する。可読性モジュール（readability・
// readabilityRenderer）を本物のまま用いる。本ページは本番ビルド（--mode app）では配信しない。
//
// 計測の判断基準（プラン）を先に述べる。
// - コントラスト比は WCAG 2.1 の式。最終画素は最終出力段でトーンマッピングと sRGB 変換を経るため、sRGB を
//   線形化してから相対輝度を求める（readability の relativeLuminance と同じ式）。閾値は通常文字の適合水準 4.5:1。
// - 読ませる役の可読性は、塗りを全周で囲む暗い縁取りに対する塗りのコントラストで背景非依存に決まる。よって
//   合否は「文字領域内の明るい塗り（高位百分位）と暗い縁取り（低位百分位）のコントラスト比」で判定する。縁取りが
//   ブルームのにじみで明るくなる分は最終描画画素から読むため計測に含まれる。塗りと背景、縁取りと背景のコントラスト
//   は参考として併報する。
// - 計測は固定の条件（画面寸法・画素密度・グリフ・背景）で行い、同一の実行環境での反復で安定させる。GPUや
//   ブラウザが異なると最終画素は厳密には一致しないため、環境をまたいだ厳密一致は保証しない。
// - 百分位を使う理由を先に述べる。符号付き距離場の輪郭は滑らかに混色し、単一画素の厳密な最小は混色の外れ値で
//   過度に厳しく出る。塗りは高位百分位、縁取りは低位百分位で代表させ、より控えめな分位の比も併報する。

import {
  WebGLRenderer,
  Scene,
  Color,
  PerspectiveCamera,
  Vector2,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Float32BufferAttribute,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Text } from "troika-three-text";
import {
  BLOOM_STRENGTH,
  BLOOM_RADIUS,
  BLOOM_THRESHOLD,
  NIGHT_COLOR,
} from "../../../rendering/constants";
import {
  srgbChannelToLinear,
  contrastRatio,
  resolveReadabilityStyle,
  DEFAULT_READABILITY_OPTIONS,
} from "../readability";
import {
  applyReadableTextStyle,
  detectReadabilityCapability,
  createReadabilityBacking,
  type ReadableTextTarget,
  type ReadabilityBackingObject,
} from "../readabilityRenderer";

const query = new URLSearchParams(location.search);
const numberKnob = (key: string, fallback: number): number =>
  query.has(key) ? Number(query.get(key)) : fallback;

// 固定の計測条件（決定論のため）。
const WIDTH = numberKnob("w", 640);
const HEIGHT = numberKnob("h", 480);
const NEEDS_BACKING = numberKnob("backing", 0) === 1;
// 既定の計測文字。サブセットが必ず収録する印字可能ASCIIから選ぶ（収録の確実さのため）。?char= で変えられる。
const GLYPH = query.get("char") ?? "A";
const FONT_URL = "/fonts/zen-kaku-gothic-new-subset.woff";
const CAMERA_Z = 10;
const FONT_SIZE = 6;
const PASS_RATIO = 4.5;

type BackgroundKind = "dark" | "bright" | "gradient" | "bloom" | "highfreq";
const BACKGROUNDS: readonly BackgroundKind[] = ["dark", "bright", "gradient", "bloom", "highfreq"];

// 計測後に表示し続ける背景（目視確認用）。?bg=dark|bright|gradient|bloom|highfreq で切り替える。
function isBackgroundKind(value: string | null): value is BackgroundKind {
  return value !== null && (BACKGROUNDS as readonly string[]).includes(value);
}
const displayBgParam = query.get("bg");
const DISPLAY_BG: BackgroundKind = isBackgroundKind(displayBgParam) ? displayBgParam : "highfreq";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const renderer = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
container.appendChild(renderer.domElement);

const camera = new PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 500);
camera.position.set(0, 0, CAMERA_Z);
camera.lookAt(0, 0, 0);

// 本シーン（背景＋読ませる役の文字）。
const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);

// 背景の平面（文字の奥に置き、視野を覆う）。
const bgWorldHeight = 2 * CAMERA_Z * Math.tan((60 * Math.PI) / 180 / 2);
const bgWorldWidth = bgWorldHeight * (WIDTH / HEIGHT);
const bgMaterial = new MeshBasicMaterial({ color: 0x000000 });
const bgPlane = new Mesh(new PlaneGeometry(bgWorldWidth * 1.1, bgWorldHeight * 1.1), bgMaterial);
bgPlane.position.set(0, 0, -2);
scene.add(bgPlane);

// ブルームで強くにじむ明るい発光塊（背景種別 "bloom" のときだけ見せる）。
// 発光塊は文字の真後ろでなく脇に置く。理由を先に述べる。発光源が文字の真後ろにあると、ブルームのにじみが
// 文字全体を覆って飛ばしてしまい、現実の局所的な発光（湖の灯し）と異なる過酷さになる。脇に置くと、にじみが
// 文字の片側へ寄り、局所的な発光に近い不利を作れる。
const blobMaterial = new MeshBasicMaterial({ color: 0xffffff });
const blob = new Mesh(new PlaneGeometry(bgWorldWidth * 0.3, bgWorldHeight * 0.3), blobMaterial);
blob.position.set(bgWorldWidth * 0.32, bgWorldHeight * 0.28, -1);
blob.visible = false;
scene.add(blob);

// 頂点カラーの平面を作る（テクスチャに頼らず確実に描く）。t は横位置（0から1）で色を返す関数。
// 色は線形の明るさで与える（頂点カラーは線形として扱われ、最終出力段で sRGB へ変換される）。
// 明部は湖の非発光の明部相当としてブルーム閾値（線形0.5）未満の0.45にする。
function makeColoredPlane(brightnessAt: (t: number) => number): Mesh {
  const segments = 64;
  const geometry = new PlaneGeometry(bgWorldWidth * 1.1, bgWorldHeight * 1.1, segments, 1);
  const position = geometry.attributes.position;
  const colors: number[] = [];
  for (let i = 0; i < position.count; i += 1) {
    const t = position.getX(i) / (bgWorldWidth * 1.1) + 0.5;
    const value = brightnessAt(Math.min(1, Math.max(0, t)));
    colors.push(value, value, value);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }));
  mesh.position.set(0, 0, -1.5);
  mesh.visible = false;
  return mesh;
}

// 暗から明への階調（左0.002→右0.45）。
const gradientMesh = makeColoredPlane((t) => 0.002 + (0.45 - 0.002) * t);
scene.add(gradientMesh);
// 高周波の明暗（湖のコード描画を模した細い縞）。64分割で明暗を交互にする。
const highFreqMesh = makeColoredPlane((t) => (Math.floor(t * 64) % 2 === 0 ? 0.002 : 0.45));
scene.add(highFreqMesh);

function setBackground(kind: BackgroundKind): void {
  blob.visible = false;
  gradientMesh.visible = false;
  highFreqMesh.visible = false;
  switch (kind) {
    case "dark":
      bgMaterial.color.setHex(NIGHT_COLOR);
      break;
    case "bright":
      // 湖の非発光の明部相当（ブルーム閾値未満）。発光源は別途 "bloom" で扱う。
      bgMaterial.color.setHex(0xb3b3b3);
      break;
    case "gradient":
      bgMaterial.color.setHex(NIGHT_COLOR);
      gradientMesh.visible = true;
      break;
    case "bloom":
      bgMaterial.color.setHex(NIGHT_COLOR);
      blob.visible = true;
      break;
    case "highfreq":
      bgMaterial.color.setHex(NIGHT_COLOR);
      highFreqMesh.visible = true;
      break;
  }
  bgMaterial.needsUpdate = true;
}

// 読ませる役の文字。可読性モジュールを本物のまま用いて確定可読性指定を作り反映する。
const capability = detectReadabilityCapability(new Text() as unknown as object);
const readableStyle = resolveReadabilityStyle({
  options: { ...DEFAULT_READABILITY_OPTIONS, minPixelHeight: 0 },
  baseFillColor: 0xffffff,
  capability,
  bloomThreshold: BLOOM_THRESHOLD,
  fallbackFontUsed: false,
  needsBacking: NEEDS_BACKING,
});

const readableText = new Text();
readableText.text = GLYPH;
readableText.font = FONT_URL;
readableText.fontSize = FONT_SIZE;
readableText.anchorX = "center";
readableText.anchorY = "middle";
readableText.position.set(0, 0, 0);
readableText.fillOpacity = 1;
applyReadableTextStyle(readableText as unknown as ReadableTextTarget, readableStyle);
scene.add(readableText);

let backing: ReadabilityBackingObject | null = null;
if (readableStyle.backing !== "none") {
  backing = createReadabilityBacking(readableStyle, GLYPH, FONT_URL, {
    createText: () => new Text(),
  });
  if (backing) {
    backing.setTransform({ x: 0, y: 0, z: 0, fontSize: FONT_SIZE });
    scene.add(backing.object);
    // 配置の確定（sync）は計測前に待つため、下の pending の仕組みで行う（ここでは呼ばない）。
  }
}

// 文字被覆を得るための分離描画（白い塗り・縁取りなし・背景は黒）。ブルームを通さない素の描画で読む。
const maskScene = new Scene();
maskScene.background = new Color(0x000000);
const maskText = new Text();
maskText.text = GLYPH;
maskText.font = FONT_URL;
maskText.fontSize = FONT_SIZE;
maskText.anchorX = "center";
maskText.anchorY = "middle";
maskText.position.set(0, 0, 0);
maskText.color = 0xffffff;
maskScene.add(maskText);

// 合成パイプライン（シーン描画→ブルーム→最終出力）。最終出力段でトーンマッピングと sRGB 変換を行う。
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new Vector2(Math.max(1, WIDTH * 0.5), Math.max(1, HEIGHT * 0.5)),
  BLOOM_STRENGTH,
  BLOOM_RADIUS,
  BLOOM_THRESHOLD
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function readPixels(): { buf: Uint8Array; w: number; h: number } {
  // 既定フレームバッファ（画面）を明示的に束ねてから読む。合成器（EffectComposer）は内部の描画対象を
  // 束ねたまま残す場合があり、束ね直さないと画面の最終結果でなく内部対象を読んでしまうためである。
  const gl = renderer.getContext();
  renderer.setRenderTarget(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return { buf, w, h };
}

function luminanceAt(buf: Uint8Array, index: number): number {
  const r = srgbChannelToLinear(buf[index] / 255);
  const g = srgbChannelToLinear(buf[index + 1] / 255);
  const b = srgbChannelToLinear(buf[index + 2] / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 1ステップの膨張（8近傍）。
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (mask[i]) {
        out[i] = 1;
        continue;
      }
      let near = 0;
      for (let dy = -1; dy <= 1 && !near; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
            near = 1;
            break;
          }
        }
      }
      out[i] = near;
    }
  }
  return out;
}

function dilateBy(mask: Uint8Array, w: number, h: number, steps: number): Uint8Array {
  let current = mask;
  for (let s = 0; s < steps; s += 1) {
    current = dilate(current, w, h);
  }
  return current;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentileLow(values: number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * fraction)];
}

function percentileHigh(values: number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

interface BackgroundResult {
  kind: BackgroundKind;
  fillBorderContrast: number;
  conservativeFillBorder: number;
  fillVsBackground: number;
  borderVsBackground: number;
}

const results: BackgroundResult[] = [];
let overallReady = false;

// 文字領域へ広げる画素数（外側の縁取りまで含める）と、背景とみなす最小の離れ（画素）。固定値。
// 理由を先に述べる。画面寸法と画素密度を固定するため、にじみとアンチエイリアスの及ぶ画素幅も一定になり、
// 文字領域を被覆から一定画素広げて縁取りまで含め、背景はそこからさらに離れた外側から取る。
const GLYPH_REGION_DILATE = 3;
const BACKGROUND_MARGIN = 16;

let maskFillCount = 0;

function measureAll(): void {
  // まず文字被覆を分離描画から得る。初回の描画はSDFアトラスとマテリアルのGPUへの転送を伴うため、
  // 数フレーム暖めてから読む（最初の1回だけでは転送途中で空に読める場合がある）。
  for (let warm = 0; warm < 3; warm += 1) {
    renderer.setRenderTarget(null);
    renderer.render(maskScene, camera);
  }
  const mask = readPixels();
  const w = mask.w;
  const h = mask.h;
  const fill = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p += 1) {
    fill[p] = luminanceAt(mask.buf, p * 4) > 0.25 ? 1 : 0;
  }
  maskFillCount = fill.reduce((sum, value) => sum + value, 0);
  // 文字領域（塗りと、その外側の縁取りを含む）。
  const glyphRegion = dilateBy(fill, w, h, GLYPH_REGION_DILATE);
  // 背景（文字領域から十分離れた外側）。
  const backgroundOuter = dilateBy(fill, w, h, BACKGROUND_MARGIN);
  const background = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p += 1) {
    background[p] = backgroundOuter[p] ? 0 : 1;
  }

  for (const kind of BACKGROUNDS) {
    setBackground(kind);
    composer.render();
    composer.render();
    const frame = readPixels();
    const glyphLums: number[] = [];
    const bgLums: number[] = [];
    for (let p = 0; p < w * h; p += 1) {
      const lum = luminanceAt(frame.buf, p * 4);
      if (glyphRegion[p]) glyphLums.push(lum);
      if (background[p]) bgLums.push(lum);
    }
    // 文字領域内の明るい塗り（高位百分位）と暗い縁取り（低位百分位）。読ませる役の可読性は、塗りを囲む
    // 暗い縁取りに対する塗りのコントラストで背景非依存に決まる。縁取りがブルームのにじみで明るくなる分は
    // 最終描画画素から読むため、この計測に含まれる。
    const fillLum = percentileHigh(glyphLums, 0.85);
    const borderLum = percentileLow(glyphLums, 0.05);
    const bgLum = median(bgLums);
    // より控えめな分位（塗り75%対縁取り25%）のコントラスト比を併報する。分位が近いぶん値が小さくなる。
    const conservative = contrastRatio(
      percentileHigh(glyphLums, 0.75),
      percentileLow(glyphLums, 0.25)
    );
    results.push({
      kind,
      fillBorderContrast: contrastRatio(fillLum, borderLum),
      conservativeFillBorder: conservative,
      fillVsBackground: contrastRatio(fillLum, bgLum),
      borderVsBackground: contrastRatio(borderLum, bgLum),
    });
  }
  overallReady = true;
}

// window へ計測結果を公開する（scripts/readability-contrast.mjs が取得する）。型は src/types/globals.d.ts。
window.__readabilityReady = (): boolean => overallReady;
window.__readability = () => ({
  passRatio: PASS_RATIO,
  capability,
  mode: readableStyle.mode,
  backing: readableStyle.backing,
  fillPixelCount: maskFillCount,
  fillBorderContrastOverall: results.length
    ? Math.min(...results.map((r) => r.fillBorderContrast))
    : 0,
  backgrounds: results,
});

// 文字の配置確定（sync）を待ってから計測する。被覆と本描画の双方が確定してから読む。
// 計測前に、被覆マスク・読ませる文字本体・（あれば）可読性下地のすべての配置確定（sync）を待つ。
// 下地の文字形の暗い複製は確定後に可視化されるため、待たずに計測すると下地が写らない。
let pending = 2 + (backing ? 1 : 0);
function onSynced(): void {
  pending -= 1;
  if (pending === 0) {
    measureAll();
    // 目視確認のため、計測後は指定された背景（既定は高周波）を表示し続ける。
    setBackground(DISPLAY_BG);
    renderHud();
  }
}
maskText.sync(onSynced);
readableText.sync(onSynced);
if (backing) {
  backing.sync(onSynced);
}

function renderHud(): void {
  const overall = results.length ? Math.min(...results.map((r) => r.fillBorderContrast)) : 0;
  const lines = [
    `mode=${readableStyle.mode} backing=${readableStyle.backing} ` +
      `cap(stroke=${capability.stroke} offset=${capability.outlineOffset} blur=${capability.outlineBlur})`,
    `判定: 文字内部対縁取りのコントラスト比（百分位） 全背景の最小=${overall.toFixed(2)} ` +
      `(合格閾値 ${PASS_RATIO})`,
  ];
  for (const r of results) {
    lines.push(
      `[${r.kind}] 内部対縁取り=${r.fillBorderContrast.toFixed(2)} 控えめ分位=${r.conservativeFillBorder.toFixed(2)} ` +
        `参考: 内部対背景=${r.fillVsBackground.toFixed(2)} 縁取り対背景=${r.borderVsBackground.toFixed(2)}`
    );
  }
  hud.textContent = lines.join("\n");
}

// 連続描画はしない（静止画の計測）。再描画が要るときはページを再読み込みする。
function keepAlive(): void {
  // 計測後も最後の本背景を表示し続けるため、最後の合成を1度描く。
  if (overallReady) {
    composer.render();
  }
  requestAnimationFrame(keepAlive);
}
requestAnimationFrame(keepAlive);
