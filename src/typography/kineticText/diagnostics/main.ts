// kineticText の受け入れ診断ページ（typography.html の入口）。
// 実装した本物のエンジンを最小シーンで駆動し、TAKEOVERの実出現を再現して描画性能を計測する。
// 描画器・シーン・カメラは Issue #8 の定数（rendering/constants）と純粋関数（rendering/viewport）を
// 再利用して本編の見えに揃える。three.js は名前付きでのみ取り込む。
// 指標は1フレームごとの所要時間を定常区間で配列に記録して算出する（500ミリ秒平均では単発落ちと
// 下位5パーセンタイルを求められないため）。本ページは本番ビルド（--mode app）では配信しない。

import {
  WebGLRenderer,
  Scene,
  Color,
  FogExp2,
  PerspectiveCamera,
  Vector2,
  CatmullRomCurve3,
  Vector3,
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
} from "../../../rendering/constants";
import { clampPixelRatio, computeAspect } from "../../../rendering/viewport";
import { createKineticTextEngine } from "../engine";
import { createFontRegistry } from "../fontRegistry";
import { computeMaxConcurrent, computeSingleLayerLimit, computeBatchedLayerLimit } from "../layerLimits";
import { ZEN_KAKU_GOTHIC_NEW_CREDIT } from "../fontCredits";
import {
  extractCharOnsets,
  uniqueCharsOf,
  buildRealReplayProfile,
  buildMaxLoadProfile,
  extractPhrases,
  buildDeformProfile,
} from "./stressProfile";
import { warmUpDeform } from "./deformWarmup";
import type { DeformingTextHandle, GlyphHandle, KineticTextEngine } from "../types";

// 依存規則により本体中核は tools を import しないため、要素取得は内製する。
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const query = new URLSearchParams(location.search);
const numberKnob = (key: string, fallback: number): number =>
  query.has(key) ? Number(query.get(key)) : fallback;
const stringKnob = (key: string, fallback: string): string => query.get(key) ?? fallback;

const BEAT_MS = 60000 / 175; // TAKEOVER は毎分175拍（★、出典 docs/analysis/song-insights.md）。
const RESIDENCE_MS = numberKnob("residence", BEAT_MS * 4); // 表示残存の既定は4拍（同時数最大の妥当値）。
const PIXEL_CAP = numberKnob("dpr", MAX_PIXEL_RATIO);
const BLOOM_ON = numberKnob("bloom", 1) === 1;
const REPLAY_SPEED = numberKnob("speed", 1);
const PROFILE = stringKnob("profile", "real"); // "real"（実測再現・合否）| "maxload"（最大負荷・余力）| "deform"（全文一括変形・合否）。
const START_MS = numberKnob("start", 0); // 実測再現の再生開始時刻（ミリ秒）。最悪集中区間を計測に含めるため指定する。
const FONT_NAME = "main";
const FONT_URL = "/fonts/zen-kaku-gothic-new-subset.woff";
const SONGMAP_URL = "/docs/analysis/takeover.songmap.json";

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

// ---- 最小の描画器・シーン・カメラ（#8 の見えに揃える） ----
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

// カメラ軌跡（カメラ正対の負荷を出すため動かす）。
const cameraCurve = new CatmullRomCurve3(
  [
    new Vector3(-30, 6, 30),
    new Vector3(-10, 9, 10),
    new Vector3(15, 5, 12),
    new Vector3(25, 7, -20),
    new Vector3(0, 12, -34),
  ],
  true
);
const cameraTarget = new Vector3(0, 3, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (BLOOM_ON) {
  const width = Math.max(1, window.innerWidth * 0.5);
  const height = Math.max(1, window.innerHeight * 0.5);
  composer.addPass(new UnrealBloomPass(new Vector2(width, height), 1.2, 0.6, 0.5));
}

window.addEventListener("resize", () => {
  camera.aspect = computeAspect(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---- フォント登録とエンジン生成 ----
const fonts = createFontRegistry();
fonts.register({ name: FONT_NAME, url: FONT_URL, weight: 700, credit: ZEN_KAKU_GOTHIC_NEW_CREDIT });

// 初回表示遅延の計測。最初に文字が可視化された瞬間を onGlyphShown で受ける。
let initProbeStartedAt = -1;
let initLatencyMs = -1;
let pendingInitRender = false;

function onGlyphShown(): void {
  if (initProbeStartedAt >= 0 && initLatencyMs < 0 && !pendingInitRender) {
    pendingInitRender = true;
  }
}

// エンジンは実データから上限を算出して start 内で生成する。
let activeEngine: KineticTextEngine;

// ---- 計測（1フレームごとの所要時間） ----
const frameDeltas: number[] = [];
let measuring = false;
let lastFrameTime = 0;
let lastInstantFps = 0;

window.__resetFps = (): void => {
  frameDeltas.length = 0;
  measuring = true;
  lastFrameTime = performance.now();
};
window.__fps = (): number => lastInstantFps;
window.__avgFps = (): number => {
  if (frameDeltas.length === 0) return 0;
  const sum = frameDeltas.reduce((accumulator, value) => accumulator + value, 0);
  return Math.round(1000 / (sum / frameDeltas.length));
};
window.__p5Fps = (): number => {
  if (frameDeltas.length === 0) return 0;
  // 各フレームの毎秒フレーム数を昇順に並べ、下位5パーセンタイルの値を返す（体感のカクつきを捉える）。
  const fpsValues = frameDeltas.map((delta) => 1000 / delta).sort((a, b) => a - b);
  const index = Math.floor(fpsValues.length * 0.05);
  return Math.round(fpsValues[index]);
};
window.__frameDrops = (): number => frameDeltas.filter((delta) => delta > 33).length;
window.__initLatencyMs = (): number => initLatencyMs;
// 変形シナリオの実レンダリング検査（scripts/typography-deform-smoke.mjs）に使う。
// 描画命令の回数は three.js が毎描画で更新する renderer.info から読む。変形単位の数は直近フレームの値を返す。
let lastActiveDeformUnits = 0;
window.__drawCalls = (): number => renderer.info.render.calls;
window.__activeDeformUnits = (): number => lastActiveDeformUnits;

// ---- 出現の駆動 ----
interface ScheduledSpawn {
  readonly char: string;
  readonly atMs: number;
  readonly lifetimeMs: number;
}

// 0以上1未満の擬似乱数。小数部を取り出すため value - floor(value) を使う。
// 理由: 剰余 (% 1) は被除数が負のとき負を返し、その値を Math.sqrt に渡すと NaN になるため、
// 必ず0以上1未満になる小数部で正規化する。
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function randomGlyphPosition(seed: number): { x: number; y: number; z: number } {
  // 見せ場が中心に集まる構図を模し、半径を平方根で中心へ寄せる。決定性は要らないため擬似乱数で散らす。
  const radius = Math.sqrt(pseudoRandom(seed)) * 18;
  const angle = pseudoRandom(seed + 7) * Math.PI * 2;
  const height = 2 + pseudoRandom(seed + 13) * 8;
  return {
    x: Math.cos(angle) * radius,
    y: height,
    z: Math.sin(angle) * radius,
  };
}

async function start(): Promise<void> {
  const response = await fetch(SONGMAP_URL);
  const songmap = await response.json();
  const onsets = extractCharOnsets(songmap);
  const uniqueChars = uniqueCharsOf(onsets);
  const startTimes = onsets.map((onset) => onset.startTimeMs);

  // 最長フレーズの文字数（一括層上限の根拠）。
  let maxPhraseChars = 0;
  for (const phrase of songmap.phrases ?? []) {
    let count = 0;
    for (const word of phrase.words ?? []) {
      count += (word.chars ?? []).length;
    }
    maxPhraseChars = Math.max(maxPhraseChars, count);
  }

  const singleLimit = numberKnob(
    "single",
    computeSingleLayerLimit(computeMaxConcurrent(startTimes, RESIDENCE_MS), 0.3)
  );
  const batchedLimit = numberKnob("batched", computeBatchedLayerLimit(maxPhraseChars, 15));

  // 実データから算出した上限でエンジンを作り直す。
  activeEngine = createKineticTextEngine(
    { scene, camera, fonts, limits: { single: singleLimit, batched: batchedLimit } },
    { onGlyphShown }
  );

  // 暖め（サブセット全グリフの距離場を読み込み時に生成）。
  const warmStart = performance.now();
  await activeEngine.warmUp(uniqueChars);

  // 描画パイプラインの暖め。隠し文字を数フレーム描き、初回の配置確定（sync）とシェーダの
  // 一度きりのコンパイル費用を計測前に支払う。これをしないと、最初に出す文字の表示が
  // 初回syncとシェーダコンパイルを含んで遅くなる（初回表示遅延が大きく出る）。
  const warmFrame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const warmHandle = activeEngine.spawnGlyph({
    char: uniqueChars[0] ?? "あ",
    fontName: FONT_NAME,
    position: { x: 0, y: 4, z: 0 },
    fontSize: 3,
    color: 0xffffff,
    opacity: 1,
    lifetimeMs: 4000,
  });
  for (let warmCount = 0; warmCount < 12; warmCount += 1) {
    await warmFrame();
    activeEngine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    composer.render();
  }
  warmHandle.release();
  activeEngine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
  const warmMs = Math.round(performance.now() - warmStart);

  const replay = PROFILE === "real" ? buildRealReplayProfile(onsets, RESIDENCE_MS) : null;
  const maxLoad =
    PROFILE === "maxload"
      ? buildMaxLoadProfile({ singleLimit, batchedLimit, charSample: uniqueChars })
      : null;
  const deform = PROFILE === "deform" ? buildDeformProfile(extractPhrases(songmap), RESIDENCE_MS) : null;

  // 変形シナリオは渦・波打ち両方のシェーダを先行コンパイルしてから計測する（初回コンパイル遅延を計測前に支払う）。
  if (deform) {
    await warmUpDeform({
      engine: activeEngine,
      render: () => composer.render(),
      sampleChar: uniqueChars[0] ?? "あ",
      fontName: FONT_NAME,
    });
  }

  // 初回表示遅延の計測。暖め後に最初の出現を出し、可視化された直後の描画完了までを測る。
  // 計測は次の描画ループ（出現が続きワーカーが稼働する実プレイに近い状態）で確定する。
  // 変形シナリオでは変形テキストを、それ以外では単一文字を出す（profile に合わせて初回コンパイル後の表示を測る）。
  initProbeStartedAt = performance.now();
  if (deform) {
    activeEngine.spawnDeformingText({
      text: uniqueChars[0] ?? "あ",
      fontName: FONT_NAME,
      position: { x: 0, y: 4, z: 0 },
      fontSize: 3,
      color: 0xffffff,
      opacity: 1,
      kind: "swirl",
      params: { strength: 0.35, speed: 3, spatialFreq: 0.12, phaseOffset: 0 },
      lifetimeMs: 500,
    });
  } else {
    activeEngine.spawnGlyph({
      char: uniqueChars[0] ?? "あ",
      fontName: FONT_NAME,
      position: { x: 0, y: 4, z: 0 },
      fontSize: 3,
      color: 0xffffff,
      opacity: 1,
      lifetimeMs: 500,
    });
  }

  const lastDeformAtMs = deform && deform.events.length > 0 ? deform.events[deform.events.length - 1].atMs : 0;
  const songEndMs = deform
    ? lastDeformAtMs + RESIDENCE_MS
    : onsets.length > 0
      ? onsets[onsets.length - 1].startTimeMs + RESIDENCE_MS
      : 1000;
  const schedule: ScheduledSpawn[] = replay ? [...replay.events] : [];
  // 再生開始時刻 START_MS 以降の最初の出現から始める（最悪集中区間を計測に含めるため）。
  // START_MS が全出現より後（範囲外）のときは findIndex が -1 を返すため、先頭（0）から再生する
  // 明示的な扱いにする（範囲外指定でも未定義の挙動にしない）。
  const foundIndex = schedule.findIndex((event) => event.atMs >= START_MS);
  const startIndex = foundIndex >= 0 ? foundIndex : 0;
  let scheduleIndex = startIndex;
  let phraseSpawned = false;

  // 最大負荷は一度だけ単一層を飽和させ、フレーズを1つ出す。
  if (maxLoad) {
    for (const event of maxLoad.singleEvents) {
      activeEngine.spawnGlyph({
        char: event.char,
        fontName: FONT_NAME,
        position: randomGlyphPosition(Math.random() * 1000),
        fontSize: 3,
        color: 0xffffff,
        opacity: 1,
        lifetimeMs: event.lifetimeMs,
      });
    }
  }

  // 変形シナリオの出現計画。フレーズを変形単位として開始時刻に出す。実測再現と同じく START_MS から始める。
  const deformSchedule = deform ? [...deform.events] : [];
  const deformFoundIndex = deformSchedule.findIndex((event) => event.atMs >= START_MS);
  const deformStartIndex = deformFoundIndex >= 0 ? deformFoundIndex : 0;
  let deformIndex = deformStartIndex;
  const activeDeformHandles = new Set<DeformingTextHandle>();

  let playbackStart = performance.now();
  let seed = 0;
  let phraseHandle: GlyphHandle | null = null;
  // 実測再現は曲末で先頭へ戻すため、出した文字の取っ手を覚えておき、折り返しで全解放する。
  // これをしないと、曲末付近で出した寿命付きの文字が次周まで残る（解放は冪等なので二重解放は無害）。
  const activeHandles = new Set<GlyphHandle>();

  function frame(now: number): void {
    requestAnimationFrame(frame);

    // カメラ移動。
    cameraCurve.getPointAt((now * 0.00002) % 1, camera.position);
    camera.lookAt(cameraTarget);

    let playbackMs = START_MS + (now - playbackStart) * REPLAY_SPEED;

    if (replay) {
      // 実測再現: 開始時刻が来た文字を出す。曲末で開始時刻へ戻して連続計測できるようにする。
      if (playbackMs > songEndMs) {
        // 折り返し前に前周の残存文字を全解放する。
        for (const handle of activeHandles) {
          handle.release();
        }
        activeHandles.clear();
        playbackStart = now;
        scheduleIndex = startIndex;
        playbackMs = START_MS;
      }
      while (scheduleIndex < schedule.length && schedule[scheduleIndex].atMs <= playbackMs) {
        const event = schedule[scheduleIndex];
        const handle = activeEngine.spawnGlyph({
          char: event.char,
          fontName: FONT_NAME,
          position: randomGlyphPosition(seed++),
          fontSize: 3,
          color: 0xffffff,
          opacity: 1,
          lifetimeMs: event.lifetimeMs,
        });
        activeHandles.add(handle);
        scheduleIndex += 1;
      }
    }

    if (maxLoad && !phraseSpawned) {
      const phraseText = uniqueChars.slice(0, maxLoad.batchedPhraseLength) || "あ";
      phraseHandle = activeEngine.spawnPhrase({
        text: phraseText,
        fontName: FONT_NAME,
        position: { x: -10, y: 8, z: 0 },
        letterSpacing: 1.2,
        fontSize: 2.5,
        color: 0x9ffbd0,
        opacity: 1,
      });
      phraseSpawned = true;
    }

    if (deform) {
      // 変形シナリオ: 開始時刻が来たフレーズを変形単位として出す。曲末で開始時刻へ戻して連続計測する。
      if (playbackMs > songEndMs) {
        for (const handle of activeDeformHandles) {
          handle.release();
        }
        activeDeformHandles.clear();
        playbackStart = now;
        deformIndex = deformStartIndex;
        playbackMs = START_MS;
      }
      while (deformIndex < deformSchedule.length && deformSchedule[deformIndex].atMs <= playbackMs) {
        const event = deformSchedule[deformIndex];
        // 渦と波打ちで形の出やすいパラメータを与える。渦は回転角を控えめに、波打ちは振幅を大きめにする。
        const params =
          event.kind === "swirl"
            ? { strength: 0.35, speed: 3, spatialFreq: 0.12, phaseOffset: 0 }
            : { strength: 0.6, speed: 3, spatialFreq: 0.35, phaseOffset: 0 };
        const handle = activeEngine.spawnDeformingText({
          text: event.text,
          fontName: FONT_NAME,
          position: randomGlyphPosition(seed++),
          fontSize: 2.2,
          color: 0x9ffbd0,
          opacity: 1,
          kind: event.kind,
          params,
          lifetimeMs: event.lifetimeMs,
        });
        activeDeformHandles.add(handle);
        deformIndex += 1;
      }
    }

    activeEngine.update({ gameTimeMs: playbackMs, frameDeltaMs: now - lastFrameTime });

    composer.render();

    // 初回表示遅延を可視化の次の描画完了で確定する。
    if (pendingInitRender && initLatencyMs < 0) {
      initLatencyMs = Math.round(performance.now() - initProbeStartedAt);
      pendingInitRender = false;
    }

    // 1フレームごとの所要時間を記録する。
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    if (delta > 0) {
      lastInstantFps = Math.round(1000 / delta);
    }
    if (measuring && delta > 0) {
      frameDeltas.push(delta);
    }

    const stats = activeEngine.stats();
    lastActiveDeformUnits = stats.activeDeformingTexts;
    hud.textContent =
      `profile=${PROFILE} fps=${lastInstantFps} avg=${window.__avgFps ? window.__avgFps() : 0} ` +
      `p5=${window.__p5Fps ? window.__p5Fps() : 0} drops>33ms=${window.__frameDrops ? window.__frameDrops() : 0}\n` +
      `init=${initLatencyMs}ms warm=${warmMs}ms 上限(単一${singleLimit}/一括${batchedLimit}) ` +
      `活動${stats.activeGlyphs} 一括${stats.activeBatchedMembers} 変形${stats.activeDeformingTexts} ` +
      `描画命令${renderer.info.render.calls} 残存${Math.round(RESIDENCE_MS)}ms` +
      (phraseHandle ? " phrase出現" : "");
  }

  lastFrameTime = performance.now();
  requestAnimationFrame(frame);
}

void start();
