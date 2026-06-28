// 差し替え可能なテキストモーションセット（19セット）の実描画ショーケース（motion-sets.html の入口）。
// buildMotionSetLibrary の全セットを切り替えて、サンプル文字へ各セットを合成経路（evaluate→composeGlyphState→
// applyComposed）で適用し、登場・保持・退場の循環を繰り返して目視確認する。最小シーン・カメラ・ブルームは
// effect-composition.html と同じ作り方で本編の見えに揃える。提出ビルド（--mode app）では vite.config.ts が除外する。
//
// セット種別の扱い:
//   - 通常（位置・回転・大きさ・字間・不透明度・色・発光・複製）: 文字の取っ手（spawnPhrase）を主取っ手にして合成結果を反映する。
//   - 変形（渦・波打ち・渦状転換）: 変形取っ手（spawnDeformingText）を主取っ手にする。種類は最初の評価から取り出す。
//   - 画面全体（暗転）: 文字を持たないため、合成した不透明度から黒の覆い（オーバーレイ）の不透明度（1−不透明度）を駆動する。
//
// 信号（声量・拍位相・感情・区間境界）は合成的に与える（実楽曲ではないため）。これにより声量や拍に反応するセット
// （感情声量・浮遊・点滅・暗転）も動く。

import { WebGLRenderer, Scene, Color, FogExp2, PerspectiveCamera, Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
  BLOOM_THRESHOLD,
} from "../../../rendering/constants";
import { clampPixelRatio, computeAspect } from "../../../rendering/viewport";
import { createKineticTextEngine, isPlaceholderHandle } from "../engine";
import { createFontRegistry } from "../fontRegistry";
import { ZEN_KAKU_GOTHIC_NEW_CREDIT } from "../fontCredits";
import { buildMotionSetLibrary } from "../effects/motionSetCatalog";
import { composeGlyphState } from "../effectCompositor";
import type { ComposeInput, ContributionEntry } from "../effectCompositor";
import { createCompositionTarget } from "../effectCompositionApplier";
import type { CompositionTarget } from "../effectCompositionApplier";
import type { GlyphHandle, KineticTextEngine, DeformKind, DeformParams } from "../types";
import type { EffectElement, EffectContext, EffectTargetUnit } from "../effectElement";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const FONT_NAME = "main";
const FONT_URL = "/fonts/zen-kaku-gothic-new-subset.woff";

// 拍の名目間隔（ミリ秒）。TAKEOVER のおよそ1拍343ミリ秒に合わせる（拍位相の合成に使う）。
const BEAT_MS = 343;
// 仮想時計の1フレームの進みの上限（毎秒60フレーム目標の1フレーム）。
const NOMINAL_FRAME_MS = 1000 / 60;
// 循環の間（無表示）の時間（ミリ秒）。登場→保持→退場→この間→次の循環、を繰り返す。
// 保持を短くする理由を先に述べる。表示窓が長いと運動（多くは150〜700ミリ秒）の後に長い静止が続き、運動が静止に
// 埋もれて「止まって見える」。表示窓を単位ごとに運動が見える最小限へ短くし、登場・保持・退場・間を繰り返すことで、
// 運動が時間を支配し、登場と退場の重ね掛けの余韻（設計書付録A.3）も見えるようにする。
const CYCLE_GAP_MS = 500;
// 対象単位ごとの表示窓（ミリ秒）。文字は短く、句ほど読む時間を取り長くする。
// 文字を700ミリ秒と短くする理由を先に述べる。直線移動（軸）は登場時間と退場時間（各400ミリ秒）が表示窓を超えると
// 重ね掛けが起こり、中央で停止せず通り抜ける（設計書§2.1.4）。文字の表示窓を700ミリ秒にして登場退場（合計800ミリ秒）が
// 重なるようにする。
function displayMsFor(unit: EffectTargetUnit): number {
  if (unit === "char") return 700;
  if (unit === "word") return 1300;
  return 1600; // phrase・画面全体
}
// 文字単位の中心位置。画面中央へ置く。
const CENTER_POSITION = { x: 0, y: 1.5, z: 0 };
// 速度に依存する演出（残像・押し潰しと引き伸ばし）は、本体が動いて初めて尾や伸縮が速度として読める（設計書§2.1.5）。
// 単体ショーケースでは本編の軸移動が無いため、これらの演出には本体へ伴走の横移動を与えて速度を供給する。
// 残像と押し潰しで移動の型を分ける理由を先に述べる。残像の尾は進行方向と逆の固定向き（左）に置かれるため、本体が
// 左右に往復すると半分は尾が進行方向の前に出て不自然になる。よって残像は一方向の等速ドリフト（左から右へ進み、画面外で
// 戻る）にして尾を常に後方へ保つ。押し潰しは伸ばす向きが横で左右対称のため、往復の正弦でよい。
const SWEEP_AMPLITUDE = 7;
const SWEEP_PERIOD_MS = 1200;
// 一方向ドリフトの範囲（画面外まで）と周期。画面外で戻るため戻りの跳びは見えない。
// 周期を短くして素早く横切る理由を先に述べる。本体がゆっくり動くと固定向きの尾が本体と一緒にゆっくり平行移動するだけで
// 「静止して見える」。素早く横切ると尾が後方へ筋を引く速度として読める。画面外±18を1100ミリ秒で渡る速さにする。
const DRIFT_RANGE = 18;
const DRIFT_PERIOD_MS = 1100;
// 基底の塗り色。採用理由を先に述べる。白（相対輝度1.0）はブルーム閾値 BLOOM_THRESHOLD（0.5）を大きく超え、
// にじみで文字の形が白く潰れて動きが見えない。文字の形と動きを鮮明に見せるため、相対輝度が閾値未満
// （青系 0x66aadd は約0.37）でにじまない色を基底にする。発光を出す演出（感情声量・点滅）はこの上で意図どおりにじむ。
const BASE_COLOR = 0x66aadd;

// セットの対象単位ごとのサンプル文字。文字単位は1文字、単語は短語、フレーズは短句。
function sampleTextFor(unit: EffectTargetUnit): string {
  if (unit === "char") return "湖";
  if (unit === "word") return "ソナーレ";
  if (unit === "phrase") return "湖のソナーレ";
  return ""; // 画面全体は文字を持たない。
}

// 対象単位ごとの基準フォント寸法。
// 採用理由を先に述べる。画面高はおよそ30ワールド単位で、字高が画面高の4〜5パーセント（単語1.6・句1.2）では日本語の
// 字形が潰れて「光の塊」に見える。各単位の字高が画面高の7〜8パーセント以上になるよう、単語2.4・句2.0へ拡大する。
function fontSizeFor(unit: EffectTargetUnit): number {
  if (unit === "char") return 2.6;
  if (unit === "word") return 2.4;
  return 2.0; // phrase
}

// 対象単位ごとの基準字間（ワールド単位）。
// 採用理由を先に述べる。一括描画層は文字 index を index×letterSpacing の位置へ置く（字間が字送りそのもので、字幅へ
// 加算するのではない。engine.ts の offsets 算出）。よって字を分離するには字間を字幅（CJK では概ねフォント寸法）以上に
// 取る必要がある。フォント寸法の1.1倍にして、字が触れず少しの隙間で並ぶ読める字送りにする。単語・句に適用し、単一文字は0。
function baseLetterSpacingFor(unit: EffectTargetUnit): number {
  return unit === "char" ? 0 : fontSizeFor(unit) * 1.1;
}

// 速度依存の演出の伴走移動の基準位置。残像は一方向の等速ドリフト、押し潰しは横の往復で速度を供給する。
function unitBasePosition(element: EffectElement, gameTimeMs: number): { x: number; y: number; z: number } {
  if (element.id === "effect.afterimageTrail") {
    // 一方向の等速ドリフト（左から右へ）。画面外（±DRIFT_RANGE）まで進み、画面外で戻る（戻りの跳びは見えない）。
    const phase = (gameTimeMs % DRIFT_PERIOD_MS) / DRIFT_PERIOD_MS;
    return { x: CENTER_POSITION.x - DRIFT_RANGE + phase * 2 * DRIFT_RANGE, y: CENTER_POSITION.y, z: CENTER_POSITION.z };
  }
  if (element.id === "effect.squashStretch") {
    const sweep = Math.sin((gameTimeMs / SWEEP_PERIOD_MS) * Math.PI * 2) * SWEEP_AMPLITUDE;
    return { x: CENTER_POSITION.x + sweep, y: CENTER_POSITION.y, z: CENTER_POSITION.z };
  }
  return CENTER_POSITION;
}

type Role = "normal" | "deform" | "fullscreen";

interface SetDescriptor {
  readonly element: EffectElement;
  readonly role: Role;
  readonly sampleText: string;
  readonly fontSize: number;
  /** 変形セットの種類（最初の評価から取り出す。通常・画面全体は null）。 */
  readonly deformKind: DeformKind | null;
  readonly initialDeformParams: DeformParams | null;
}

function roleOf(element: EffectElement): Role {
  if (element.targetUnit === "fullscreen") return "fullscreen";
  if (element.operates.deform === true) return "deform";
  return "normal";
}

// 変形セットの最初の評価から、変形の種類と初期パラメータを取り出す（取っ手の生成に要る）。
function extractDeform(element: EffectElement): { kind: DeformKind; params: DeformParams } | null {
  // 単位の中ほどの時刻で評価して変形寄与を得る。
  const ctx = makeContext(element.targetUnit, sampleTextFor(element.targetUnit), 800, 0, 1600, CENTER_POSITION);
  const contribution = element.evaluate(ctx);
  if (contribution && contribution.deform) {
    return { kind: contribution.deform.kind, params: contribution.deform.params };
  }
  return null;
}

// 信号込みの評価コンテキストを作る。声量・拍位相・感情・区間境界を合成的に与える。
function makeContext(
  unit: EffectTargetUnit,
  text: string,
  gameTimeMs: number,
  unitStartMs: number,
  unitEndMs: number,
  basePosition: { x: number; y: number; z: number }
): EffectContext {
  // 声量は表示窓にわたり0から1へ単調に増やす。単調にする理由を先に述べる。正弦の振動だと声量が閾値（0.5）を何度も
  // 跨ぎ、声量で枝分かれする演出（縦伸ばしと渦の切替）が点滅して見える。0から1へ一度だけ上げると、低声量側（縦伸ばし）
  // から高声量側（渦）への応答が一方向に読める。拍位相は拍内の進行、感情は固定、区間境界は単位末尾近傍で真。
  const span = Math.max(1, unitEndMs - unitStartMs);
  const loudness = Math.max(0, Math.min(1, (gameTimeMs - unitStartMs) / span));
  const beatPhase = (gameTimeMs % BEAT_MS) / BEAT_MS;
  const atSectionBoundary = gameTimeMs >= unitEndMs - 400;
  return {
    gameTimeMs,
    unit,
    unitStartMs,
    unitEndMs,
    text,
    unitGlyphCount: [...text].length,
    phraseIndex: 0,
    wordIndex: unit === "word" ? 0 : undefined,
    charIndex: unit === "char" ? 0 : undefined,
    beatPhase,
    loudness,
    emotion: 0.7,
    atSectionBoundary,
    basePosition,
  };
}

function buildDescriptors(): SetDescriptor[] {
  return buildMotionSetLibrary().map((element) => {
    const role = roleOf(element);
    const deform = role === "deform" ? extractDeform(element) : null;
    return {
      element,
      role,
      sampleText: sampleTextFor(element.targetUnit),
      fontSize: fontSizeFor(element.targetUnit),
      deformKind: deform ? deform.kind : null,
      initialDeformParams: deform ? deform.params : null,
    };
  });
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");
const blackout = requireElement<HTMLElement>("blackout");
const picker = requireElement<HTMLSelectElement>("picker");
const prevButton = requireElement<HTMLButtonElement>("prev");
const nextButton = requireElement<HTMLButtonElement>("next");
const replayButton = requireElement<HTMLButtonElement>("replay");

const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO));
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
camera.position.set(0, 2, 26);
camera.lookAt(0, 1.5, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
{
  // ブルームの強さと半径を弱める理由を先に述べる。本ショーケースの主目的はモーション（位置・大きさ・回転・変形・
  // 複製・字間）を鮮明に見せることである。強いブルームは文字の輪郭をにじませ形を白く潰す。基底色はブルーム閾値
  // 未満（相対輝度約0.37）で文字本体はにじまないが、にじみの広がり（半径）と強さが大きいと縁が滲む。よって強さ
  // 0.4・半径0.3に抑え、文字を鮮明に保ちつつ、発光を出す演出（感情声量・点滅）の光だけが控えめににじむようにする。
  const width = Math.max(1, window.innerWidth * 0.5);
  const height = Math.max(1, window.innerHeight * 0.5);
  composer.addPass(new UnrealBloomPass(new Vector2(width, height), 0.4, 0.3, BLOOM_THRESHOLD));
}

window.addEventListener("resize", () => {
  camera.aspect = computeAspect(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const fonts = createFontRegistry();
fonts.register({ name: FONT_NAME, url: FONT_URL, weight: 700, credit: ZEN_KAKU_GOTHIC_NEW_CREDIT });

let engine: KineticTextEngine;

async function start(): Promise<void> {
  engine = createKineticTextEngine(
    {
      scene,
      camera,
      fonts,
      limits: { single: 64, batched: 64 },
      viewportPixelHeight: () => window.innerHeight * window.devicePixelRatio,
      bloomThreshold: BLOOM_THRESHOLD,
    },
    {}
  );

  const descriptors = buildDescriptors();
  // 暖め: 全サンプル文字の集合。
  const allChars = new Set<string>();
  for (const d of descriptors) for (const c of d.sampleText) allChars.add(c);
  await engine.warmUp([...allChars].join(""));

  // 選択肢を作る。
  descriptors.forEach((d, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${d.element.displayName}（${d.element.targetUnit}）`;
    picker.appendChild(option);
  });

  let currentIndex = 0;
  let cycleStartGameTimeMs = 0;
  let target: CompositionTarget | null = null;

  function releaseTarget(): void {
    if (target) {
      target.release();
      target = null;
    }
    blackout.style.opacity = "0";
  }

  // 全画面暗転の参照文字。暗転が背景（暗い夜空）と区別できるよう、暗転の対象となる文字を背後に置く。
  // 単一文字にする理由を先に述べる。暗転の見せ場は画面全体が暗くなる動きで、参照は暗転で沈む対象が1つあれば足りる。
  // 単一文字の取っ手は配置が確実で、暗転の動きを安定して見せられる。
  const BLACKOUT_REFERENCE_TEXT = "湖";

  // 現在のセットの主取っ手を作る合成対象を生成する（種別に応じて取っ手を選ぶ）。
  function spawnTarget(descriptor: SetDescriptor): CompositionTarget | null {
    if (descriptor.role === "fullscreen") {
      // 暗転の対象となる参照文字を背後に表示する（黒の覆いがこの文字を含む画面全体を暗くする）。
      return createCompositionTarget({
        spawnPrimary: () =>
          engine.spawnPhrase({
            text: BLACKOUT_REFERENCE_TEXT,
            fontName: FONT_NAME,
            position: CENTER_POSITION,
            letterSpacing: 0,
            fontSize: fontSizeFor("char"),
            color: BASE_COLOR,
            opacity: 1,
          }),
        spawnCopy: () => null,
      });
    }
    if (descriptor.role === "deform" && descriptor.deformKind && descriptor.initialDeformParams) {
      const kind = descriptor.deformKind;
      const params = descriptor.initialDeformParams;
      return createCompositionTarget({
        spawnPrimary: () =>
          engine.spawnDeformingText({
            text: descriptor.sampleText,
            fontName: FONT_NAME,
            position: CENTER_POSITION,
            fontSize: descriptor.fontSize,
            color: BASE_COLOR,
            opacity: 1,
            kind,
            params,
          }),
        spawnCopy: () => null,
      });
    }
    // 通常: 文字の取っ手。字間に対応する spawnPhrase を使う。複製の写しも同じサンプルで作る。
    const spawn = (): GlyphHandle =>
      engine.spawnPhrase({
        text: descriptor.sampleText,
        fontName: FONT_NAME,
        position: CENTER_POSITION,
        letterSpacing: baseLetterSpacingFor(descriptor.element.targetUnit),
        fontSize: descriptor.fontSize,
        color: BASE_COLOR,
        opacity: 1,
      });
    return createCompositionTarget({
      spawnPrimary: spawn,
      spawnCopy: () => {
        const handle = spawn();
        return isPlaceholderHandle(handle) ? null : handle;
      },
    });
  }

  function selectIndex(index: number, gameTimeMs: number): void {
    releaseTarget();
    currentIndex = ((index % descriptors.length) + descriptors.length) % descriptors.length;
    picker.value = String(currentIndex);
    cycleStartGameTimeMs = gameTimeMs;
    target = spawnTarget(descriptors[currentIndex]);
  }

  function restartCycle(gameTimeMs: number): void {
    // 単位を出し直して登場から見せる。
    releaseTarget();
    cycleStartGameTimeMs = gameTimeMs;
    target = spawnTarget(descriptors[currentIndex]);
  }

  let gameTimeMs = 0;
  let lastFramePerfMs = performance.now();

  picker.addEventListener("change", () => selectIndex(Number(picker.value), gameTimeMs));
  prevButton.addEventListener("click", () => selectIndex(currentIndex - 1, gameTimeMs));
  nextButton.addEventListener("click", () => selectIndex(currentIndex + 1, gameTimeMs));
  replayButton.addEventListener("click", () => restartCycle(gameTimeMs));
  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") selectIndex(currentIndex - 1, gameTimeMs);
    else if (event.key === "ArrowRight") selectIndex(currentIndex + 1, gameTimeMs);
    else if (event.key === " ") {
      event.preventDefault();
      restartCycle(gameTimeMs);
    }
  });

  selectIndex(0, 0);

  function describeChannels(element: EffectElement): string {
    const op = element.operates;
    const parts: string[] = [];
    if (op.position) parts.push(`位置(${op.position})`);
    if (op.rotation) parts.push(`回転(${op.rotation})`);
    if (op.scale) parts.push(`大きさ(${op.scale})`);
    if (op.letterSpacing) parts.push(`字間(${op.letterSpacing})`);
    if (op.color) parts.push(`色(${op.color})`);
    if (op.opacity) parts.push("不透明度");
    if (op.glow) parts.push("発光");
    if (op.deform) parts.push("変形");
    if (op.duplication) parts.push("複製");
    if (op.clip) parts.push("切り抜き");
    return parts.join("・");
  }

  function frame(nowPerfMs: number): void {
    requestAnimationFrame(frame);
    const stepMs = Math.min(Math.max(0, nowPerfMs - lastFramePerfMs), NOMINAL_FRAME_MS);
    lastFramePerfMs = nowPerfMs;
    gameTimeMs += stepMs;

    const descriptor = descriptors[currentIndex];
    const displayMs = displayMsFor(descriptor.element.targetUnit);
    const elapsed = gameTimeMs - cycleStartGameTimeMs;
    // 循環の終わり（表示窓＋間）で出し直す（登場から繰り返す）。
    if (elapsed >= displayMs + CYCLE_GAP_MS) {
      restartCycle(gameTimeMs);
    }

    const unitStartMs = cycleStartGameTimeMs;
    const unitEndMs = cycleStartGameTimeMs + displayMs;
    const basePosition = unitBasePosition(descriptor.element, gameTimeMs);

    engine.update({ gameTimeMs, frameDeltaMs: stepMs });

    if (descriptor.role === "fullscreen") {
      // 背後の参照文字（単一文字）を基準のまま保つ（暗転で沈むのを見せる対象）。
      if (target) {
        target.applyComposed(
          composeGlyphState({
            unit: "char",
            contributions: [],
            baseColor: BASE_COLOR,
            basePosition: CENTER_POSITION,
            bloomThreshold: BLOOM_THRESHOLD,
            readability: null,
          })
        );
      }
      // 画面全体の暗転: 合成した不透明度から黒の覆いの不透明度（1−不透明度）を駆動する。
      const ctx = makeContext(descriptor.element.targetUnit, "", gameTimeMs, unitStartMs, unitEndMs, CENTER_POSITION);
      const contribution = descriptor.element.evaluate(ctx);
      const opacity = contribution && contribution.opacity ? contribution.opacity.factor : 1;
      const blackAlpha = Math.max(0, Math.min(1, 1 - opacity));
      blackout.style.opacity = String(blackAlpha);
    } else if (target) {
      const ctx = makeContext(
        descriptor.element.targetUnit,
        descriptor.sampleText,
        gameTimeMs,
        unitStartMs,
        unitEndMs,
        basePosition
      );
      const contribution = descriptor.element.evaluate(ctx);
      const contributions: ContributionEntry[] = [];
      if (contribution) {
        contributions.push({
          id: descriptor.element.id,
          contribution,
          priority: descriptor.element.defaultPriority,
          operates: descriptor.element.operates,
        });
      }
      const input: ComposeInput = {
        unit: descriptor.element.targetUnit,
        contributions,
        baseColor: BASE_COLOR,
        basePosition,
        bloomThreshold: BLOOM_THRESHOLD,
        readability: null,
      };
      target.applyComposed(composeGlyphState(input));
    }

    composer.render();

    const e = descriptor.element;
    const phase = elapsed < displayMs ? "表示中" : "間（無表示）";
    hud.textContent =
      `テキストモーションセット ショーケース（全${descriptors.length}セット）\n` +
      `${currentIndex + 1}/${descriptors.length}  ${e.displayName}\n` +
      `識別名=${e.id}  対象単位=${e.targetUnit}\n` +
      `操作チャネル: ${describeChannels(e)}\n` +
      `循環: ${phase}（${Math.round(elapsed)}/${displayMs + CYCLE_GAP_MS}ミリ秒）\n` +
      `操作: ← →（前後のセット）  スペース（再生やり直し）  または下のボタン・一覧`;
  }

  requestAnimationFrame(frame);
}

void start();
