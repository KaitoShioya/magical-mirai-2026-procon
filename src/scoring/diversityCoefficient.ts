// 多様性係数 D の計算（Issue #42）。
// docs/decisions/app-overall-decisions.md §3.4 は D を「通常 1.0、JUST が変化したのに前と同じ操作を
// 繰り返した場合だけ 1.0 未満」と定める。§3.5 は三部形式で JUST を進化させ、変化した区間で同操作を
// 繰り返したときに多様性逓減を発火させると定める。本関数はその発火判定を行う純粋関数である。
//
// 操作の同一性を音程スロットで判定する理由を先に述べる。§3.4 は「X軸の色は得点に寄与しない」と定め、
// D を JUST（音程）の変化に結びつけるため、操作の同一性は選んだ音程スロットで表し色は判定に含めない。
//
// 逓減量（reductionFactor）を引数で受け取る理由を先に述べる。§3.4 は D を「1.0 未満」とだけ定め具体値を
// 持たず、src/config/tuning.ts 冒頭規約が「得点合成の基準値は scoring の #55・#56 が定義」「原典に確定値が
// 無い値は推測で埋めず所有 Issue が確定」と定めるため、本番値の確定は目的関数統合 #56 に委ね、本関数は
// 逓減量を引数として受け取る。本関数は得点合成（#55・#56）が1タップごとに呼ぶことを想定する。
//
// 対応する前回（previousJustSlot・previousOperationSlot）の選び方（三部形式のどの区間を「前」とするか）は、
// 多様性逓減区間（diversityZones、Issue #42 が自動抽出）を参照する呼び出し側 #56 の責務であり、本関数は
// 前回値を引数として受け取るだけで選定は行わない。

/** 多様性係数の計算入力。スロットは音程スロットの索引（0始まり）。 */
export interface DiversityCoefficientInput {
  /** このタップ時点の正解スロット（JUST 音程）。 */
  currentJustSlot: number;
  /** 対応する前回の正解スロット。前回がない初回は undefined。 */
  previousJustSlot: number | undefined;
  /** このタップでプレイヤーが選んだ操作（音程スロット）。 */
  currentOperationSlot: number;
  /** 対応する前回にプレイヤーが選んだ操作。前回がない初回は undefined。 */
  previousOperationSlot: number | undefined;
}

/** 多様性係数の計算オプション。 */
export interface DiversityCoefficientOptions {
  /** 発火時に適用する係数。有効範囲は 0 以上 1 未満。本番値の確定は所有 Issue #56。 */
  reductionFactor: number;
}

/** 多様性係数 D を返す。JUST が変化したのに前と同じ操作を繰り返したときだけ reductionFactor、
 *  それ以外（前回がない、JUST が不変、操作を変えた）は 1.0 を返す。
 *  逓減量の検査 `reductionFactor >= 0 && reductionFactor < 1` の否定は、非数（全比較が偽）と
 *  正負の無限大（片方の境界比較が偽）も弾くため、別途の有限性検査を要しない。 */
export function computeDiversityCoefficient(
  input: DiversityCoefficientInput,
  options: DiversityCoefficientOptions,
): number {
  const { reductionFactor } = options;
  if (!(reductionFactor >= 0 && reductionFactor < 1)) {
    throw new Error(`逓減量は 0 以上 1 未満である必要があります（${reductionFactor}）`);
  }
  if (input.previousJustSlot === undefined || input.previousOperationSlot === undefined) {
    return 1.0;
  }
  const justChanged = input.currentJustSlot !== input.previousJustSlot;
  const operationRepeated = input.currentOperationSlot === input.previousOperationSlot;
  return justChanged && operationRepeated ? reductionFactor : 1.0;
}
