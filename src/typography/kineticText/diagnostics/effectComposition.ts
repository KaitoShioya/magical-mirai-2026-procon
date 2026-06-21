// Issue #131 演出合成エンジンの実描画プレビュー（effect-composition.html の入口）。
// 複数演出を1単位へ重ねて破綻しないこと、複製の写しが時間とともに増減・後始末されることを目視確認する。
// 最小シーン・カメラ・ブルームは char-smash.html と同じ作り方で本編の見えに揃える。
//
// 本ページの位置づけ:
//   - 文字単位へ「1拍スマッシュ（大きさ・透明度）＋感情マッピング（色・発光・揺らぎ）」を重ね、合成器→適用層を
//     通して反映する。これが #131 の一般の合成である（char-smash.html の1演出専用反映とは異なる）。
//   - 単語単位へ複製演出（円状重ね）を時間で点滅させ、写しの取っ手が確保・後始末されることを見せる。
//   - 寄与は擬似的に組み立てる（実演出は charSmash のみのため）。本番の歌詞割当（#132・#33）ではない。
//   - 毎フレームの反映は engine.update の後に行う。理由は、update 内の最小寸法維持が別系統で寸法を動かすため、
//     合成結果を後に確定させるためである。
//   - 提出ビルド npm run build:app（--mode app）では vite.config.ts がこの入口を除外する。

import {
  WebGLRenderer,
  Scene,
  Color,
  FogExp2,
  PerspectiveCamera,
  Vector2,
} from "three";
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
import { createKineticTextEngine } from "../engine";
import { isPlaceholderHandle } from "../engine";
import { createFontRegistry } from "../fontRegistry";
import { ZEN_KAKU_GOTHIC_NEW_CREDIT } from "../fontCredits";
import { charSmash } from "../effects/charSmash";
import { composeGlyphState } from "../effectCompositor";
import type { ComposeInput, ContributionEntry } from "../effectCompositor";
import { createCompositionTarget } from "../effectCompositionApplier";
import type { CompositionTarget } from "../effectCompositionApplier";
import type { GlyphHandle, KineticTextEngine } from "../types";
import type { EffectContext, DuplicateCopy } from "../effectElement";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const FONT_NAME = "main";
const FONT_URL = "/fonts/zen-kaku-gothic-new-subset.woff";

// 拍の名目間隔（ミリ秒）。TAKEOVER のおよそ1拍343ミリ秒に合わせる（同期確認用の固定値）。
const BEAT_MS = 343;
// 文字単位を出し直す間隔（2拍に1回、charSmash の beatCadence:2 に対応）。
const SHOW_EVERY_BEATS = 2;
// 仮想時計の1フレームの進みの上限（毎秒60フレーム目標の1フレーム）。
const NOMINAL_FRAME_MS = 1000 / 60;
// 文字単位の基準フォント寸法と位置（画面の左上に置き、単語単位と重ならないようにする）。
const CHAR_FONT_SIZE = 2.6;
const CHAR_POSITION = { x: -6.5, y: 5.5, z: 0 };
// 単語単位の基準フォント寸法と位置（画面の右下に置く）。
const WORD_FONT_SIZE = 1.4;
const WORD_POSITION = { x: 2, y: -2.5, z: 0 };
const WORD_TEXT = "ソナーレ";
const WORD_LETTER_SPACING = 1.6;
// 複製（円状重ね）の写し数と半径。
const CIRCLE_COPIES = 6;
const CIRCLE_RADIUS = 1.2;
// 複製を点滅させる周期（ミリ秒）。前半は複製あり、後半は複製なし。
const DUPLICATION_PERIOD_MS = 4000;
// 重ねる文字の循環。
const CHAR_CYCLE = [..."ソナーレ湖"];

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

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
  const width = Math.max(1, window.innerWidth * 0.5);
  const height = Math.max(1, window.innerHeight * 0.5);
  composer.addPass(new UnrealBloomPass(new Vector2(width, height), 1.2, 0.6, BLOOM_THRESHOLD));
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

// 円状重ねの写しの配置を作る。
function circleCopies(): DuplicateCopy[] {
  const copies: DuplicateCopy[] = [];
  for (let index = 0; index < CIRCLE_COPIES; index += 1) {
    const theta = (index / CIRCLE_COPIES) * Math.PI * 2;
    copies.push({ offset: { x: Math.cos(theta) * CIRCLE_RADIUS, y: Math.sin(theta) * CIRCLE_RADIUS, z: 0 } });
  }
  return copies;
}

async function start(): Promise<void> {
  engine = createKineticTextEngine(
    {
      scene,
      camera,
      fonts,
      limits: { single: 8, batched: 32 },
      viewportPixelHeight: () => window.innerHeight * window.devicePixelRatio,
      bloomThreshold: BLOOM_THRESHOLD,
    },
    {}
  );
  await engine.warmUp([...new Set([...CHAR_CYCLE, ...WORD_TEXT])].join(""));

  // 文字単位の状態（重ね合成）。
  let charTarget: CompositionTarget | null = null;
  let charUnitStartMs = 0;
  let charUnitEndMs = 0;
  let charText = "";
  let lastGlowing = false;

  // 単語単位の状態（複製の点滅）。1つの取っ手を保ち続け、複製計画だけを切り替える。
  const wordTarget = createCompositionTarget({
    spawnPrimary: () =>
      engine.spawnPhrase({
        text: WORD_TEXT,
        fontName: FONT_NAME,
        position: WORD_POSITION,
        letterSpacing: WORD_LETTER_SPACING,
        fontSize: WORD_FONT_SIZE,
        color: 0x66ccff,
        opacity: 1,
      }),
    spawnCopy: () => {
      const handle = engine.spawnPhrase({
        text: WORD_TEXT,
        fontName: FONT_NAME,
        position: WORD_POSITION,
        letterSpacing: WORD_LETTER_SPACING,
        fontSize: WORD_FONT_SIZE,
        color: 0x66ccff,
        opacity: 1,
      });
      return isPlaceholderHandle(handle) ? null : handle;
    },
  });

  let gameTimeMs = 0;
  let lastFramePerfMs = performance.now();
  let lastShowBeatIndex = -SHOW_EVERY_BEATS;
  let charCycleIndex = 0;

  function spawnChar(beatTimeMs: number): void {
    if (charTarget) charTarget.release();
    const char = CHAR_CYCLE[charCycleIndex % CHAR_CYCLE.length];
    charCycleIndex += 1;
    let handle: GlyphHandle | null = null;
    charTarget = createCompositionTarget({
      spawnPrimary: () => {
        handle = engine.spawnGlyph({
          char,
          fontName: FONT_NAME,
          position: CHAR_POSITION,
          fontSize: CHAR_FONT_SIZE,
          color: 0xffffff,
          opacity: 1,
        });
        return handle;
      },
      spawnCopy: () => null,
    });
    charUnitStartMs = beatTimeMs;
    charUnitEndMs = beatTimeMs + SHOW_EVERY_BEATS * BEAT_MS;
    charText = char;
  }

  function composeChar(): void {
    if (!charTarget) return;
    const ctx: EffectContext = {
      gameTimeMs,
      unit: "char",
      unitStartMs: charUnitStartMs,
      unitEndMs: charUnitEndMs,
      text: charText,
      unitGlyphCount: 1,
      phraseIndex: 0,
    };
    const smash = charSmash.evaluate(ctx);
    // 感情マッピング（擬似）: 時間でゆっくり巡る色相、声量を模した発光、わずかな揺らぎ。
    const phase = (gameTimeMs % 6000) / 6000;
    const warm = phase < 0.5;
    const intensity = 0.5 + 0.5 * Math.sin((gameTimeMs / 1000) * 2);
    const jitter = 0.04 * Math.sin((gameTimeMs / 1000) * 13);
    const contributions: ContributionEntry[] = [];
    if (smash) {
      contributions.push({ id: "charSmash", contribution: smash, priority: charSmash.defaultPriority, operates: charSmash.operates });
    }
    contributions.push({
      id: "emotion",
      contribution: {
        color: { layer: "assertive", color: warm ? 0xff8800 : 0x33aaff },
        glow: { intensity: Math.max(0, intensity) },
        position: { layer: "jitter", value: { x: jitter, y: jitter, z: 0 } },
      },
      priority: 10,
      operates: { color: "assertive", glow: true, position: "jitter" },
    });
    const input: ComposeInput = {
      unit: "char",
      contributions,
      baseColor: 0xffffff,
      basePosition: CHAR_POSITION,
      bloomThreshold: BLOOM_THRESHOLD,
      readability: null,
    };
    const state = composeGlyphState(input);
    lastGlowing = state.glowing;
    charTarget.applyComposed(state);
  }

  function composeWord(): void {
    const angle = (gameTimeMs / 1000) % (Math.PI * 2);
    const duplicationOn = gameTimeMs % DUPLICATION_PERIOD_MS < DUPLICATION_PERIOD_MS / 2;
    const contributions: ContributionEntry[] = [
      {
        id: "spin",
        contribution: { rotation: { layer: "main", value: { x: 0, y: 0, z: angle } } },
        priority: 0,
        operates: { rotation: "main" },
      },
    ];
    if (duplicationOn) {
      contributions.push({
        id: "circle",
        contribution: { duplication: { layout: "polar", copies: circleCopies(), minCount: 3 } },
        priority: 0,
        operates: { duplication: true },
      });
    }
    const state = composeGlyphState({
      unit: "word",
      contributions,
      baseColor: 0x66ccff,
      basePosition: WORD_POSITION,
      bloomThreshold: BLOOM_THRESHOLD,
      readability: null,
    });
    wordTarget.applyComposed(state);
  }

  function frame(nowPerfMs: number): void {
    requestAnimationFrame(frame);
    const stepMs = Math.min(Math.max(0, nowPerfMs - lastFramePerfMs), NOMINAL_FRAME_MS);
    lastFramePerfMs = nowPerfMs;
    gameTimeMs += stepMs;

    // 2拍に1回、文字単位を出し直す。
    const beatIndex = Math.floor(gameTimeMs / BEAT_MS);
    if (beatIndex % SHOW_EVERY_BEATS === 0 && beatIndex !== lastShowBeatIndex) {
      lastShowBeatIndex = beatIndex;
      spawnChar(beatIndex * BEAT_MS);
    }

    // エンジン更新の後に合成結果を反映する。
    engine.update({ gameTimeMs, frameDeltaMs: stepMs });
    composeChar();
    composeWord();

    composer.render();

    hud.textContent =
      `演出合成エンジン プレビュー（#131）\n` +
      `文字単位: 1拍スマッシュ＋感情マッピング（色・発光・揺らぎ）を重ね合成  発光対象=${lastGlowing ? "あり" : "なし"}\n` +
      `単語単位: 円状重ねの複製を点滅  写しの数=${wordTarget.liveCopyCount()}（0と${CIRCLE_COPIES}を往復）`;
  }

  requestAnimationFrame(frame);
}

void start();
