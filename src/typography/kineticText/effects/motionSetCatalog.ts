// 差し替え可能なモーションセットのライブラリ（登録の一覧）。
// 設計書§2.2.4の表と§5.5の追加技法を、各々が差し替え可能な1セット（EffectElement）として集約する。
// buildMotionSetLibrary が全セットを返し、registerMotionSetLibrary がレジストリへ登録（登録時検証込み）する。
// 駆動側（指揮者）は、割付が active にした識別名をこのレジストリから引いて評価する。

import type { EffectElement, EffectRegistry } from "../effectElement";

// 演出文法（既定規則 effectAssignment.ts が参照する8文法の実演出）。
import { charSmash } from "./charSmash";
import { letterSpacingSpread } from "./letterSpacingSpread";
import { circularMultiply } from "./circularMultiply";
import { verticalStretchSwirl } from "./verticalStretchSwirl";
import { afterimageTrail } from "./afterimageTrail";
import { fadeBlackout } from "./fadeBlackout";
import { emotionLoudness } from "./emotionLoudness";
import { depthFlight } from "./depthFlight";
// 変形（渦・波打ち・渦状スキャッター転換）。
import { swirlDeform, waveDeform, vortexScatterTransition } from "./deformVortex";
// 設計書§5.5の追加技法（チャネル完結セット）。
import {
  axisMove,
  scaleSoftSmash,
  squashStretch,
  blink,
  floatJitter,
  wordRotation,
  unitOpacity,
  initialFlash,
} from "./extraMotionSets";

/** 差し替え可能なモーションセットの全一覧を返す。 */
export function buildMotionSetLibrary(): readonly EffectElement[] {
  return [
    // 演出文法（本編の既定割付が参照する）。
    charSmash,
    letterSpacingSpread,
    circularMultiply,
    verticalStretchSwirl,
    afterimageTrail,
    fadeBlackout,
    emotionLoudness,
    depthFlight,
    // 変形。
    swirlDeform,
    waveDeform,
    vortexScatterTransition,
    // 追加技法。
    axisMove,
    scaleSoftSmash,
    squashStretch,
    blink,
    floatJitter,
    wordRotation,
    unitOpacity,
    initialFlash,
  ];
}

/** 全モーションセットをレジストリへ登録する（register が登録時検証を行い、不整合・識別名重複で例外を投げる）。 */
export function registerMotionSetLibrary(registry: EffectRegistry): void {
  for (const element of buildMotionSetLibrary()) {
    registry.register(element);
  }
}
