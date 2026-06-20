// インスタンス分割文字制御（Issue #21）。1文字を1描画単位として、位置・回転・大きさ・不透明度の
// 4系統を時間に沿って動かす。エンジン本体は改変せず、エンジンが返す GlyphHandle 経由で駆動する
// （docs/decisions/architecture.md §5、src/typography/kineticText/types.ts の GlyphHandle 契約）。
//
// 同期方式: GSAPのタイムラインを自走させず、毎フレーム与えられる再生位置へ移動（シーク）して値を
// 取り出す（docs/research/01-kinetic-typography.md §8）。これにより利用者がシークしても巻き戻しても
// 破綻せず、音と映像がずれない。
//
// 時刻の単位変換: GSAPは時間を秒で扱い、本プロジェクトの再生位置はミリ秒で扱う。両者を合わせるため、
// ミリ秒の値を MS_PER_SECOND で割って秒へ変換してからタイムラインへ渡す。

import gsap from "gsap";
import type { GlyphHandle, Vector3Like } from "./types";

const MS_PER_SECOND = 1000;

/** 1系統の1つの節目。`atMs` はアニメーション先頭からの相対時刻（ミリ秒）。`ease` は変化の緩急の名前。 */
export interface AnimationKeyframe<Value> {
  readonly atMs: number;
  readonly value: Value;
  /** 変化の緩急の名前（GSAPのイージング名。例: "none" は等速、"power2.out" は減速）。省略時は等速。 */
  readonly ease?: string;
}

/**
 * 1文字のアニメーション仕様。各系統は節目（キーフレーム）の列で表す。
 * 節目の相対時刻は0以上 durationMs 以下で、昇順であること。
 */
export interface GlyphAnimationSpec {
  /** このアニメーションが先頭になる絶対再生位置（ミリ秒）。 */
  readonly startTimeMs: number;
  /** アニメーション全体の長さ（ミリ秒）。正の値であること。 */
  readonly durationMs: number;
  readonly position?: readonly AnimationKeyframe<Vector3Like>[];
  /** 回転（オイラー角3成分、ラジアン）。 */
  readonly rotation?: readonly AnimationKeyframe<Vector3Like>[];
  /** 大きさ（一律倍率）。 */
  readonly scale?: readonly AnimationKeyframe<number>[];
  /** 不透明度（0以上1以下）。 */
  readonly opacity?: readonly AnimationKeyframe<number>[];
}

/** 進行状態。開始前・進行中・終了後。 */
export type GlyphAnimationPhase = "pending" | "active" | "finished";

/** 出したアニメーション付き文字を操作する操作子。 */
export interface GlyphAnimation {
  /** 再生位置に応じて各系統を文字へ反映する。タイムライン破棄後は何もしない。 */
  applyAt(gameTimeMs: number): void;
  /** 再生位置に対する進行状態を返す。 */
  phaseAt(gameTimeMs: number): GlyphAnimationPhase;
  /** 一括の終了処理。タイムラインを破棄し、続けて文字を解放する。冪等。 */
  finish(): void;
  /** タイムラインだけを破棄する（文字は解放しない）。finish から内部的に呼ばれる。冪等。 */
  dispose(): void;
}

/** タイムライン生成口（既定はGSAPの一時停止タイムライン）。単体テストで擬似に差し替える。 */
export interface AnimationTimeline {
  to(target: object, vars: object, position?: number): unknown;
  time(seconds: number): unknown;
  kill(): void;
}

/** 生成時に外から注入する依存。 */
export interface GlyphAnimationInternals {
  createTimeline?: () => AnimationTimeline;
}

/** タイムラインが補間する素の状態。位置3成分・回転3成分・大きさ・不透明度。 */
interface AnimationState {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  opacity: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function validateKeyframes(
  channelName: string,
  frames: readonly AnimationKeyframe<unknown>[],
  durationMs: number
): void {
  let previousAtMs = -Infinity;
  for (const frame of frames) {
    if (frame.atMs < 0 || frame.atMs > durationMs) {
      throw new Error(
        `glyphAnimation: ${channelName} の節目の時刻 ${frame.atMs} が範囲[0, ${durationMs}]の外にある`
      );
    }
    if (frame.atMs <= previousAtMs) {
      throw new Error(`glyphAnimation: ${channelName} の節目の時刻が昇順でない（${frame.atMs}）`);
    }
    previousAtMs = frame.atMs;
  }
}

function buildScalarChannel(
  timeline: AnimationTimeline,
  state: AnimationState,
  field: "scale" | "opacity",
  frames: readonly AnimationKeyframe<number>[]
): void {
  // 先頭の節目より前の時刻では先頭値になるよう、初期値を先頭値にする。
  state[field] = frames[0].value;
  for (let index = 1; index < frames.length; index += 1) {
    const segmentMs = frames[index].atMs - frames[index - 1].atMs;
    timeline.to(
      state,
      {
        [field]: frames[index].value,
        duration: segmentMs / MS_PER_SECOND,
        ease: frames[index].ease ?? "none",
      },
      frames[index - 1].atMs / MS_PER_SECOND
    );
  }
}

function buildVectorChannel(
  timeline: AnimationTimeline,
  state: AnimationState,
  frames: readonly AnimationKeyframe<Vector3Like>[],
  fieldX: "x" | "rx",
  fieldY: "y" | "ry",
  fieldZ: "z" | "rz"
): void {
  state[fieldX] = frames[0].value.x;
  state[fieldY] = frames[0].value.y;
  state[fieldZ] = frames[0].value.z;
  for (let index = 1; index < frames.length; index += 1) {
    const segmentMs = frames[index].atMs - frames[index - 1].atMs;
    timeline.to(
      state,
      {
        [fieldX]: frames[index].value.x,
        [fieldY]: frames[index].value.y,
        [fieldZ]: frames[index].value.z,
        duration: segmentMs / MS_PER_SECOND,
        ease: frames[index].ease ?? "none",
      },
      frames[index - 1].atMs / MS_PER_SECOND
    );
  }
}

/**
 * 1文字のアニメーションを作る。handle は文字エンジンの spawnGlyph が返した取っ手、
 * spec はアニメーション仕様。internals でタイムライン生成口を擬似に差し替えられる。
 */
export function createGlyphAnimation(
  handle: GlyphHandle,
  spec: GlyphAnimationSpec,
  internals: GlyphAnimationInternals = {}
): GlyphAnimation {
  if (spec.durationMs <= 0) {
    throw new Error("glyphAnimation: durationMs は正の値である必要がある");
  }

  const createTimeline =
    internals.createTimeline ?? ((): AnimationTimeline => gsap.timeline({ paused: true }));

  const hasPosition = spec.position !== undefined && spec.position.length > 0;
  const hasRotation = spec.rotation !== undefined && spec.rotation.length > 0;
  const hasScale = spec.scale !== undefined && spec.scale.length > 0;
  const hasOpacity = spec.opacity !== undefined && spec.opacity.length > 0;

  if (hasPosition) {
    validateKeyframes("position", spec.position!, spec.durationMs);
  }
  if (hasRotation) {
    validateKeyframes("rotation", spec.rotation!, spec.durationMs);
  }
  if (hasScale) {
    validateKeyframes("scale", spec.scale!, spec.durationMs);
  }
  if (hasOpacity) {
    validateKeyframes("opacity", spec.opacity!, spec.durationMs);
  }

  const state: AnimationState = {
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    scale: 1,
    opacity: 1,
  };

  const timeline = createTimeline();
  if (hasPosition) {
    buildVectorChannel(timeline, state, spec.position!, "x", "y", "z");
  }
  if (hasRotation) {
    buildVectorChannel(timeline, state, spec.rotation!, "rx", "ry", "rz");
  }
  if (hasScale) {
    buildScalarChannel(timeline, state, "scale", spec.scale!);
  }
  if (hasOpacity) {
    buildScalarChannel(timeline, state, "opacity", spec.opacity!);
  }

  // 2つの解放済み印を別々に持つ（呼び出し順に関わらず二重解放しないため）。
  let timelineDisposed = false;
  let glyphReleased = false;

  function applyAt(gameTimeMs: number): void {
    if (timelineDisposed) {
      return;
    }
    const localMs = clamp(gameTimeMs - spec.startTimeMs, 0, spec.durationMs);
    timeline.time(localMs / MS_PER_SECOND);
    if (hasPosition) {
      handle.setPosition(state.x, state.y, state.z);
    }
    if (hasRotation) {
      handle.setRotation(state.rx, state.ry, state.rz);
    }
    if (hasScale) {
      handle.setScale(state.scale);
    }
    if (hasOpacity) {
      handle.setOpacity(state.opacity);
    }
  }

  function phaseAt(gameTimeMs: number): GlyphAnimationPhase {
    const localMs = gameTimeMs - spec.startTimeMs;
    if (localMs < 0) {
      return "pending";
    }
    if (localMs >= spec.durationMs) {
      return "finished";
    }
    return "active";
  }

  function dispose(): void {
    if (timelineDisposed) {
      return;
    }
    timeline.kill();
    timelineDisposed = true;
  }

  function finish(): void {
    dispose();
    if (glyphReleased) {
      return;
    }
    handle.release();
    glyphReleased = true;
  }

  return { applyAt, phaseAt, finish, dispose };
}
