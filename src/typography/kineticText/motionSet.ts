// 差し替え可能なモーションセットの抽象（イージング＋モーション＝1つの演出表現）。
// 設計根拠: docs/decisions/visual-expression-design.md §2.2.1。モーションセットは「EffectElement を生成する設定」で、
// 設定を差し替えるだけで演出を交換できる。登場と退場の重ね掛けは、合成器が主変形チャネルを最高優先度の1件で
// 上書きする（加算は揺らぎ層のみ）ため、合成段では行えない。よって1つの演出要素の内部で、登場側と退場側の
// 進行度を別々に計算し、内部で1つの値へ合成して主変形チャネルの単一値として返す（§2.2.1）。
//
// 依存規則（docs/decisions/architecture.md §5）: 純粋関数。three.js・profiles・tools を取り込まない。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectTargetUnit,
  EffectPriority,
  StartCondition,
  OperatedAttributes,
} from "./effectElement";
import type { Vector3Like } from "./types";
import { resolveEasing, type EasingRef, type EasingFn } from "./easing";

const ZERO_VEC: Vector3Like = { x: 0, y: 0, z: 0 };

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 単位の生存周期に対する時間窓。登場時間は単位開始から、退場時間は単位終了で終わる。 */
export interface MotionTimeWindow {
  /** 登場の長さ（ミリ秒）。0は登場なし。 */
  readonly entranceMs: number;
  /** 退場の長さ（ミリ秒）。0は退場なし。 */
  readonly exitMs: number;
  /** 文字ごとの登場のずらし（ミリ秒×文字番号）。出現の方向づけに使う。無指定は0。 */
  readonly perCharStaggerMs?: number;
}

/** 位相ごとのイージング指定。生成時に1回だけ関数へ解決する。 */
export interface MotionPhaseEasing {
  /** 登場のイージング（既定は出の指数）。 */
  readonly entrance?: EasingRef;
  /** 退場のイージング（既定は入りの指数）。 */
  readonly exit?: EasingRef;
}

/** 全モーションセットに共通する宣言。 */
interface MotionSetBase {
  readonly id: string;
  readonly displayName: string;
  readonly targetUnit: EffectTargetUnit;
  readonly startCondition: StartCondition;
  readonly priority: EffectPriority;
  /** 単位の文字数から最大費用を返す。 */
  readonly cost: (unitGlyphCount: number) => EffectCost;
}

/** 位置・回転・大きさ（ベクトル値の主変形または揺らぎ）。 */
export interface TransformMotionConfig extends MotionSetBase {
  readonly kind: "transform";
  readonly channel: "position" | "rotation" | "scale";
  readonly layer: "main" | "jitter";
  readonly window: MotionTimeWindow;
  readonly easing: MotionPhaseEasing;
  /** 開始・静止・終了の値。 */
  readonly values: { readonly from: Vector3Like; readonly rest: Vector3Like; readonly to: Vector3Like };
  /**
   * 位置を基準位置からの相対で扱うか。真のとき、値は ctx.basePosition への加算（offset）として解釈する。
   * 軸の直線移動・奥行き飛び込みが文字の自然な位置へ着地するために使う。位置チャネルでのみ意味を持つ。
   */
  readonly relativeToBase?: boolean;
}

/** 字間・不透明度（スカラー値）。 */
export interface ScalarMotionConfig extends MotionSetBase {
  readonly kind: "scalar";
  readonly channel: "letterSpacing" | "opacity";
  /** 字間は主変形か揺らぎ。不透明度は層を持たないため省略する。 */
  readonly layer?: "main" | "jitter";
  readonly window: MotionTimeWindow;
  readonly easing: MotionPhaseEasing;
  readonly values: { readonly from: number; readonly rest: number; readonly to: number };
}

/** 浮遊・小刻みの揺らぎ（位置の揺らぎ層への加算振動）。登場・退場を持たない。 */
export interface JitterMotionConfig extends MotionSetBase {
  readonly kind: "jitter";
  /** 各軸の振幅（ワールド単位）。 */
  readonly amplitude: Vector3Like;
  /** 振動の周波数（毎秒の周期数）。 */
  readonly freqHz: number;
  /** 声量に比例して振幅を増す係数。無指定は声量に依存しない。 */
  readonly loudnessGain?: number;
}

/** 点滅（不透明度の方形波。イージングを使わない）。 */
export interface SquareWaveMotionConfig extends MotionSetBase {
  readonly kind: "squareWave";
  /** 点灯・消灯の半周期（ミリ秒）。 */
  readonly halfPeriodMs: number;
  /** 点灯時の発光強度（0以上1以下）。無指定は発光しない。 */
  readonly onGlow?: number;
}

export type MotionSetConfig =
  | TransformMotionConfig
  | ScalarMotionConfig
  | JitterMotionConfig
  | SquareWaveMotionConfig;

// ---- 操作属性の導出（評価が出すチャネルと必ず一致させる）----

function deriveOperates(config: MotionSetConfig): OperatedAttributes {
  switch (config.kind) {
    case "transform":
      if (config.channel === "position") return { position: config.layer };
      if (config.channel === "rotation") return { rotation: config.layer };
      return { scale: config.layer };
    case "scalar":
      if (config.channel === "letterSpacing") return { letterSpacing: config.layer ?? "main" };
      return { opacity: true };
    case "jitter":
      return { position: "jitter" };
    case "squareWave":
      return config.onGlow !== undefined ? { opacity: true, glow: true } : { opacity: true };
  }
}

// ---- 進行度と重ね掛けの合成 ----

function entranceProgress(window: MotionTimeWindow, ctx: EffectContext): number {
  if (window.entranceMs <= 0) return 1;
  const stagger = (window.perCharStaggerMs ?? 0) * (ctx.charIndex ?? 0);
  return clamp01((ctx.gameTimeMs - (ctx.unitStartMs + stagger)) / window.entranceMs);
}

function exitProgress(window: MotionTimeWindow, ctx: EffectContext): number {
  if (window.exitMs <= 0) return 0;
  const exitStart = ctx.unitEndMs - window.exitMs;
  return clamp01((ctx.gameTimeMs - exitStart) / window.exitMs);
}

/**
 * 静止値からの変位の和で重ね掛けする。entE は登場の進行（0から1）、exitE は退場の進行（0から1）。
 * 先頭（entE=0,exitE=0）で from、保持（entE=1,exitE=0）で rest、退場完了（exitE=1）で to を返し、
 * 登場と退場が重なる区間では減速の尾と加速の頭が重なって連続する（中央の平らな停止を生じない）。
 */
function blendScalar(from: number, rest: number, to: number, entE: number, exitE: number): number {
  return rest + (from - rest) * (1 - entE) + (to - rest) * exitE;
}

function blendVector(
  from: Vector3Like,
  rest: Vector3Like,
  to: Vector3Like,
  entE: number,
  exitE: number,
): Vector3Like {
  return {
    x: blendScalar(from.x, rest.x, to.x, entE, exitE),
    y: blendScalar(from.y, rest.y, to.y, entE, exitE),
    z: blendScalar(from.z, rest.z, to.z, entE, exitE),
  };
}

function addVector(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

// ---- 生成 ----

/**
 * モーションセットの設定から演出要素を作る。operates は設定から機械的に導出し、evaluate の出力と必ず一致させる。
 * イージングは生成時に1回だけ解決し、評価のホットパスでは解決済みの関数を使う。
 */
export function createMotionSetEffect(config: MotionSetConfig): EffectElement {
  const operates = deriveOperates(config);

  let evaluate: (ctx: EffectContext) => AttributeContribution | null;

  if (config.kind === "jitter") {
    const { amplitude, freqHz, loudnessGain } = config;
    evaluate = (ctx) => {
      const w = 2 * Math.PI * freqHz * (ctx.gameTimeMs / 1000);
      const gain = 1 + (loudnessGain ?? 0) * (ctx.loudness ?? 0);
      // 各軸を脱相関させ、機械的な同位相の揺れに見えないようにする。
      const value: Vector3Like = {
        x: amplitude.x * Math.sin(w) * gain,
        y: amplitude.y * Math.sin(w * 1.37 + 1.1) * gain,
        z: amplitude.z * Math.sin(w * 0.73 + 2.3) * gain,
      };
      return { position: { layer: "jitter", value } };
    };
  } else if (config.kind === "squareWave") {
    const { halfPeriodMs, onGlow } = config;
    evaluate = (ctx) => {
      const on = Math.floor(ctx.gameTimeMs / halfPeriodMs) % 2 === 0;
      const contribution: AttributeContribution = { opacity: { factor: on ? 1 : 0 } };
      if (onGlow !== undefined && on) {
        return { ...contribution, glow: { intensity: onGlow } };
      }
      return contribution;
    };
  } else if (config.kind === "transform") {
    const easeEntrance: EasingFn = resolveEasing(config.easing.entrance ?? "outExpo");
    const easeExit: EasingFn = resolveEasing(config.easing.exit ?? "inExpo");
    const { channel, layer, window, values, relativeToBase } = config;
    evaluate = (ctx) => {
      const entE = easeEntrance(entranceProgress(window, ctx));
      const exitE = easeExit(exitProgress(window, ctx));
      let value = blendVector(values.from, values.rest, values.to, entE, exitE);
      if (channel === "position" && relativeToBase) {
        value = addVector(ctx.basePosition ?? ZERO_VEC, value);
      }
      if (channel === "position") return { position: { layer, value } };
      if (channel === "rotation") return { rotation: { layer, value } };
      return { scale: { layer, value } };
    };
  } else {
    // scalar
    const easeEntrance: EasingFn = resolveEasing(config.easing.entrance ?? "outExpo");
    const easeExit: EasingFn = resolveEasing(config.easing.exit ?? "inExpo");
    const { channel, window, values } = config;
    const layer = config.layer ?? "main";
    evaluate = (ctx) => {
      const entE = easeEntrance(entranceProgress(window, ctx));
      const exitE = easeExit(exitProgress(window, ctx));
      const scalar = blendScalar(values.from, values.rest, values.to, entE, exitE);
      if (channel === "letterSpacing") return { letterSpacing: { layer, value: scalar } };
      return { opacity: { factor: clamp01(scalar) } };
    };
  }

  return {
    id: config.id,
    displayName: config.displayName,
    targetUnit: config.targetUnit,
    startCondition: config.startCondition,
    operates,
    defaultPriority: config.priority,
    estimateCost: (input) => config.cost(input.unitGlyphCount),
    evaluate,
  };
}
