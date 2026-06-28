// 後処理モーションセット（グリッチ・色ずれ・句読点反転）の駆動記述子。
//
// 後処理は文字の取っ手を持たないため EffectElement（取っ手系）ではなく、再生位置から強度を算出し描画層の設定関数を
// 呼ぶ並列の記述子として定義する（設計書§2.2.4・§5.2、プランの後処理セット）。値の算出は純粋関数
// postprocessEnvelope（src/rendering）に置き、drive だけが描画層の設定関数（renderRoot.setChromaBurstIntensity 等）を
// 呼ぶ唯一の副作用とする。これで「描画層は状態を読むだけ」の依存規則を守りつつ、後処理を曲の信号で駆動できる。
//
// シーク再現性: 強度は再生位置と契機の時刻列だけで決まり、乱数・状態を持たない。グリッチのシェーダ時刻は
// 量子化した再生位置を渡すため、同じ再生位置では必ず同じ画素になる（コマ落ちの質感も兼ねる）。
//
// 本編での後処理パスの有効化は #59 が createRenderRoot({ postEffectEnabled: true }) で行う。本記述子は駆動だけを担い、
// パスが無効な端末・設定では設定関数が何もしない（renderRoot 側が WebGL 無しなどで吸収する）。

import { pulseEnvelopeAt, type DecayShape } from "../rendering/postprocessEnvelope";
import { quantizeTimeMs } from "../typography/kineticText/quantizeTime";

/** 後処理の設定関数（renderRoot が実装する。テストでは擬似に差し替える）。 */
export interface PostprocessTarget {
  setChromaBurstIntensity(intensity: number): void;
  setGlitchIntensity(intensity: number): void;
  setGlitchTimeSec(seconds: number): void;
  setInvertIntensity(intensity: number): void;
}

/** 1つの後処理モーションセット。再生位置から強度を算出し、描画層の設定関数を呼ぶ。 */
export interface PostprocessMotionSet {
  readonly id: string;
  /** 1フレームの駆動。再生位置 gameTimeMs に対し描画層の設定関数を呼ぶ。 */
  drive(gameTimeMs: number, target: PostprocessTarget): void;
}

/** インパルス駆動の共通設定。 */
export interface PulseSetConfig {
  /** 契機（強拍・曲の切れ目・場面転換）の時刻列（昇順）。 */
  readonly pulseTimesMs: readonly number[];
  /** 1つのインパルスの持続（ミリ秒）。 */
  readonly durationMs: number;
  /** 減衰の形。既定は直線。 */
  readonly shape?: DecayShape;
  /** 強度の上限係数（0以上1以下）。包絡1のときこの値になる。既定は1。 */
  readonly gain?: number;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pulseIntensity(config: PulseSetConfig, gameTimeMs: number): number {
  const envelope = pulseEnvelopeAt(gameTimeMs, config.pulseTimesMs, config.durationMs, config.shape ?? "linear");
  return clamp01(envelope * (config.gain ?? 1));
}

/**
 * 色ずれ（強拍のアクセント）。既存の色収差パスを強拍の包絡で駆動する。
 * 設計根拠: §2.1.5「速度の強調」「強拍のアクセント」、§2.2.4 表（色ずれ＝強拍で立ち上がる）。
 */
export function chromaBurstOnBeats(config: PulseSetConfig): PostprocessMotionSet {
  return {
    id: "postprocess.chromaBurst",
    drive(gameTimeMs, target) {
      target.setChromaBurstIntensity(pulseIntensity(config, gameTimeMs));
    },
  };
}

/** グリッチの設定（インパルス駆動＋シェーダ時刻の量子化刻み）。 */
export interface GlitchSetConfig extends PulseSetConfig {
  /**
   * グリッチのシェーダ時刻に渡す量子化の刻み（ミリ秒）。0以下のとき量子化しない（再生位置をそのまま秒へ）。
   * 量子化はコマ落ちの質感を与え、同じ刻みの区間で同じ画素にする（シーク再現性に資する）。
   */
  readonly timeQuantStepMs?: number;
}

/**
 * グリッチ（場面転換のアクセント）。場面転換の包絡で強度を、量子化した再生位置でシェーダ時刻を駆動する。
 * 設計根拠: §2.2.4 表（グリッチ＝場面転換のアクセント）、§5.2（シーク再現性）。
 */
export function glitchOnTransitions(config: GlitchSetConfig): PostprocessMotionSet {
  const stepMs = config.timeQuantStepMs ?? 0;
  return {
    id: "postprocess.glitch",
    drive(gameTimeMs, target) {
      const quantizedMs = stepMs > 0 ? quantizeTimeMs(gameTimeMs, stepMs) : gameTimeMs;
      target.setGlitchTimeSec(quantizedMs / 1000);
      target.setGlitchIntensity(pulseIntensity(config, gameTimeMs));
    },
  };
}

/**
 * 句読点反転（曲の切れ目）。曲の切れ目の包絡で反転度合いを駆動する。
 * 設計根拠: §2.1.5「曲の切れ目＝暗転」、§3.1「句読点＝1から2コマの色反転」、§2.2.4 表（句読点の色反転）。
 */
export function invertOnBoundaries(config: PulseSetConfig): PostprocessMotionSet {
  return {
    id: "postprocess.invert",
    drive(gameTimeMs, target) {
      target.setInvertIntensity(pulseIntensity(config, gameTimeMs));
    },
  };
}

/** 複数の後処理セットを1フレームでまとめて駆動する。 */
export function drivePostprocessMotionSets(
  sets: readonly PostprocessMotionSet[],
  gameTimeMs: number,
  target: PostprocessTarget
): void {
  for (const set of sets) {
    set.drive(gameTimeMs, target);
  }
}
