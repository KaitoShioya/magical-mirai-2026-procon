// Issue #23 1文字1拍スマッシュの実描画プレビュー（char-smash.html の入口）。
// 演出合成 #131 が無い段階で、拍に合わせて1文字がはみ出すスマッシュで瞬間表示され、拍の目印と山が重なることを
// 目視確認する。最小シーン・カメラ・ブルームは診断ページ main.ts と同じ作り方で本編の見えに揃える。
//
// 本ページの位置づけ（#131 を先取りしないための制約）:
//   - 扱うのは1演出（charSmash）・1文字・大きさと不透明度だけである。複数演出をまとめる合成や優先度解決は持たない。
//   - 寄与を取っ手へ反映する applySmash は、charSmash が使うチャネルだけを当てるプレビュー専用の反映であり、
//     #131 の一般の合成ではない。kineticText の公開窓口には出さない。
//   - 文字選択（拍時刻に最も近い文字）は同期確認用の簡便な規則であり、本番の歌詞割当（#132・#33）ではない。
//   - 提出ビルド npm run build:app（--mode app）では vite.config.ts がこの入口を除外する。本番配信に含まれない。
//
// 依存規則: 本体中核は tools を import しないため、要素取得は内製する。three.js は名前付きでのみ取り込む。
// 拍同期スケジューラ（src/utils）と stressProfile（診断）は検証目的で取り込む。

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
} from "../../../rendering/constants";
import { clampPixelRatio, computeAspect } from "../../../rendering/viewport";
import { createKineticTextEngine } from "../engine";
import { createFontRegistry } from "../fontRegistry";
import { computeMaxConcurrent, computeSingleLayerLimit } from "../layerLimits";
import { ZEN_KAKU_GOTHIC_NEW_CREDIT } from "../fontCredits";
import { DEFAULT_READABILITY_OPTIONS } from "../readability";
import { extractCharOnsets, uniqueCharsOf } from "./stressProfile";
import type { CharOnset } from "./stressProfile";
import { charSmash } from "../effects/charSmash";
import { createBeatScheduler } from "../../../utils/beatScheduler";
import type { GlyphHandle, KineticTextEngine } from "../types";
import type { EffectContext, AttributeContribution } from "../effectElement";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const FONT_NAME = "main";
const FONT_URL = "/fonts/zen-kaku-gothic-new-subset.woff";
const SONGMAP_URL = "/docs/analysis/takeover.songmap.json";

// はみ出しを狙う基準フォント寸法（ワールド単位）。山倍率1.8倍で画面いっぱい近くまで拡大する初期値。
const PREVIEW_FONT_SIZE = 3.5;
// 文字の出現位置（湖の中心の高さに置く）。
const PREVIEW_POSITION = { x: 0, y: 5, z: 0 };
// 拍の目印の点灯時間（ミリ秒）。短く光らせて山との重なりを読み取る。
const BEAT_MARK_MS = 120;
// 2拍に1回の間引き。beatCadence:2 に対応し、偶数番の拍で表示する。
const SHOW_EVERY_BEATS = 2;
// 仮想時計を1フレームで進める名目時間の上限（ミリ秒）。1000÷60＝毎秒60フレーム目標の1フレーム。
// 仮想時計は実フレーム間隔で進めつつ、1フレームの進みをこの上限で頭打ちにする。理由を先に述べる。
// 実時間そのままで進めると、フレームのひっかかり・タブの非アクティブ化・高リフレッシュ表示で1フレームの進みが
// 大きくなり、拍が遅れて発火して出現の経過が1フレームを超える。上限で頭打ちにすると、毎秒60フレーム以上の
// 表示では実時間どおりに再生され、ひっかかった間だけ再生がその分ゆっくりになり、経過は常に1フレーム以内に収まる。
const NOMINAL_FRAME_MS = 1000 / 60;

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");
const beatMark = requireElement<HTMLElement>("beat");

// ---- 最小の描画器・シーン・カメラ（main.ts の見えに揃える）----
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
// 静止カメラで中心の文字を正面から見る（スマッシュとビートの一致に集中するため動かさない）。
camera.position.set(0, 5, 22);
camera.lookAt(PREVIEW_POSITION.x, PREVIEW_POSITION.y, PREVIEW_POSITION.z);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
{
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

// ---- フォント登録 ----
const fonts = createFontRegistry();
fonts.register({ name: FONT_NAME, url: FONT_URL, weight: 700, credit: ZEN_KAKU_GOTHIC_NEW_CREDIT });

let engine: KineticTextEngine;

// 拍時刻に最も近い文字を二分探索で選ぶ（同期確認用の簡便な規則。本番の割当ではない）。
function nearestCharAt(onsets: readonly CharOnset[], timeMs: number): string {
  if (onsets.length === 0) return "あ";
  let low = 0;
  let high = onsets.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (onsets[mid].startTimeMs < timeMs) low = mid + 1;
    else high = mid;
  }
  // low は timeMs 以上の最小位置。直前と比べて近い方を選ぶ。
  const candidate = onsets[low];
  const previous = low > 0 ? onsets[low - 1] : candidate;
  const dCandidate = Math.abs(candidate.startTimeMs - timeMs);
  const dPrevious = Math.abs(previous.startTimeMs - timeMs);
  return dPrevious <= dCandidate ? previous.char : candidate.char;
}

// charSmash 1演出の寄与を取っ手へ当てるプレビュー専用の反映（#131 の一般合成ではない）。
function applySmash(handle: GlyphHandle, contribution: AttributeContribution | null): void {
  if (!contribution) return;
  if (contribution.scale) handle.setScale(contribution.scale.value.x);
  if (contribution.opacity) handle.setOpacity(contribution.opacity.factor);
}

async function start(): Promise<void> {
  const response = await fetch(SONGMAP_URL);
  const songmap = await response.json();
  const onsets = extractCharOnsets(songmap);
  const uniqueChars = uniqueCharsOf(onsets);
  const beatTimes: number[] = (songmap.beats ?? []).map((beat: { startTime: number }) => beat.startTime);
  if (beatTimes.length < 2) {
    hud.textContent = "拍データが不足しています";
    return;
  }

  // 単一文字層の同時上限（表示は常に1文字だが、暖めと上限算出のため main.ts と同じ算出を使う）。
  const singleLimit = Math.max(1, computeSingleLayerLimit(computeMaxConcurrent(beatTimes, 720), 0.3));
  engine = createKineticTextEngine(
    {
      scene,
      camera,
      fonts,
      limits: { single: singleLimit, batched: 1 },
      // 可読性（縁取りと影＝白影による地からの分離。docs/refs/reference-analysis.md §1B.2-6）を有効にするための注入。
      viewportPixelHeight: () => window.innerHeight * window.devicePixelRatio,
      bloomThreshold: 0.5,
    },
    {}
  );

  await engine.warmUp(uniqueChars);

  const scheduler = createBeatScheduler(beatTimes);
  const songEndMs = beatTimes[beatTimes.length - 1] + (beatTimes[beatTimes.length - 1] - beatTimes[beatTimes.length - 2]);

  // 表示中の文字の状態。
  let activeHandle: GlyphHandle | null = null;
  let activeUnitStartMs = 0;
  let activeUnitEndMs = 0;
  let activeText = "";
  // 表示拍（スマッシュが出る拍）の時刻。拍の目印はこの拍だけ点灯させ、各点灯が必ず1つのスマッシュに対応するようにする。
  let lastShowBeatTimeMs = -1;
  let maxSpawnElapsedMs = 0;

  // 機械的にも読み取れるよう、出現時の拍からの経過の最大値を公開する。
  (window as unknown as { __smashSpawnElapsedMaxMs?: () => number }).__smashSpawnElapsedMaxMs = () => maxSpawnElapsedMs;

  // 仮想時計。実フレーム間隔を名目フレームで頭打ちにして進める。曲の先頭の拍から始める。
  let gameTimeMs = beatTimes[0];
  let lastFramePerfMs = performance.now();

  function spawnAt(beatIndex: number, beatTimeMs: number): void {
    const unitStartMs = beatTimeMs; // ビート時刻（発火フレーム時刻でない）を開始時刻にする。
    const nextShowIndex = beatIndex + SHOW_EVERY_BEATS;
    const unitEndMs =
      nextShowIndex < beatTimes.length
        ? beatTimes[nextShowIndex]
        : beatTimeMs + (beatTimeMs - beatTimes[beatIndex - 1]);
    const char = nearestCharAt(onsets, beatTimeMs);
    if (activeHandle) activeHandle.release();
    activeHandle = engine.spawnGlyph({
      char,
      fontName: FONT_NAME,
      position: PREVIEW_POSITION,
      fontSize: PREVIEW_FONT_SIZE,
      color: 0xffffff,
      opacity: 1,
      readability: DEFAULT_READABILITY_OPTIONS,
    });
    activeUnitStartMs = unitStartMs;
    activeUnitEndMs = unitEndMs;
    activeText = char;
  }

  function frame(nowPerfMs: number): void {
    requestAnimationFrame(frame);

    // 実フレーム間隔を名目フレームで頭打ちにして仮想時計を進める。曲末で先頭へ戻して連続観察できるようにする。
    const stepMs = Math.min(Math.max(0, nowPerfMs - lastFramePerfMs), NOMINAL_FRAME_MS);
    lastFramePerfMs = nowPerfMs;
    gameTimeMs += stepMs;
    if (gameTimeMs > songEndMs) {
      if (activeHandle) {
        activeHandle.release();
        activeHandle = null;
      }
      scheduler.reset();
      gameTimeMs = beatTimes[0];
    }

    // 拍の発火。2拍に1回（偶数番）で文字を出し、その表示拍だけ目印を点ける。
    scheduler.advance(gameTimeMs, (event) => {
      if (event.index % SHOW_EVERY_BEATS !== 0) return;
      spawnAt(event.index, event.timeMs);
      lastShowBeatTimeMs = event.timeMs;
      if (event.elapsedSinceBeatMs > maxSpawnElapsedMs) maxSpawnElapsedMs = event.elapsedSinceBeatMs;
    });

    // エンジン更新（寿命処理・カメラ正対・可読性の最小寸法）。
    engine.update({ gameTimeMs, frameDeltaMs: stepMs });

    // スマッシュの反映はエンジン更新の後に行う（大きさを最後に確定させるため。アニメーション反映と同じ順序）。
    if (activeHandle) {
      const ctx: EffectContext = {
        gameTimeMs,
        unit: "char",
        unitStartMs: activeUnitStartMs,
        unitEndMs: activeUnitEndMs,
        text: activeText,
        unitGlyphCount: 1,
        phraseIndex: 0,
      };
      applySmash(activeHandle, charSmash.evaluate(ctx));
    }

    composer.render();

    // 表示拍の目印を点灯から BEAT_MARK_MS かけて消す。スマッシュの山（出現直後）と目印の重なりを目視で確認する。
    const sinceShowBeat = lastShowBeatTimeMs >= 0 ? gameTimeMs - lastShowBeatTimeMs : Number.POSITIVE_INFINITY;
    const markOpacity = sinceShowBeat < BEAT_MARK_MS ? 1 - sinceShowBeat / BEAT_MARK_MS : 0;
    beatMark.style.opacity = String(Math.max(0, markOpacity));

    hud.textContent =
      `1文字1拍スマッシュ プレビュー（#131非依存）\n` +
      `再生位置=${Math.round(gameTimeMs)}ms 文字=${activeText || "—"} ` +
      `表示単位=[${Math.round(activeUnitStartMs)}, ${Math.round(activeUnitEndMs)}]ms\n` +
      `出現の拍からの経過 最大=${maxSpawnElapsedMs.toFixed(2)}ms（1フレーム=${(1000 / 60).toFixed(2)}ms 以内が目標）`;
  }

  requestAnimationFrame(frame);
}

void start();
