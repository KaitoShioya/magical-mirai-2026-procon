// 描画性能ゲート（Issue #97）の閾値判定。純粋関数のみを持ち、ブラウザ起動部品（Playwright）を読み込まない。
// 仕様の正典は docs/research/08-quality-assurance.md の3節（合格は平均と下位5パーセンタイルの両方で60以上）と
// 6節（最低フレーム下限は格下げ不可）、docs/research/03-rendering-ui.md の6節（ミク常在時の性能と縮退）。
// 閾値はすべて初期値であり、実装後のプレイ検証で調整して閾値定義集を確定するIssue #104と整合させる。
// 計測値の信頼性（実GPU・標本数・未捕捉例外）は scripts/harness/metrics.mjs の evaluateRunAcceptance が判定し、
// 本モジュールは信頼できる計測値に対する閾値の合否だけを担う（責務を分ける）。

/**
 * 描画性能ゲートの初期閾値。各値の採用理由を先に述べる。
 * - targetAvgFps と targetP5Fps を60にする採用理由: docs/research/03 の6節と docs/research/08 の3節が
 *   「平均だけでは瞬間的なカクつきを見逃すため、平均と下位5パーセンタイルの両方で毎秒60フレームの下限を
 *   満たす」と定めるため、両方の指標に60を課す。
 * - floorP5Fps を55にする採用理由: Issue #18 の自動劣化制御が縮退を発火する閾値
 *   PERF_DOWNSHIFT_FPS（src/rendering/constants.ts）が55であり、これは「これを割ると操作が破綻する床」
 *   として既に確定済みの単一の出所である。描画性能ゲートが独自の値を作らずこの床定数に揃えることで、
 *   両者が連携し二重管理を避ける。床を下位5パーセンタイルに課す採用理由: 単一の最悪フレーム（生最低）は
 *   雑音が大きく合否を不安定にするのに対し、下位5パーセンタイルは仕様（08 §3）が合否に用いる頑健な下側
 *   指標であり、床も同じ指標に課すと判定が安定するためである。
 *   この55が constants.ts の PERF_DOWNSHIFT_FPS と一致することは fps-metrics.test.mjs が検査する。
 */
export const DEFAULT_FPS_THRESHOLDS = {
  targetAvgFps: 60,
  targetP5Fps: 60,
  floorP5Fps: 55,
};

/**
 * 信頼できる計測値1件に対し、描画性能ゲートの目標と最低フレーム下限の合否を判定する（純粋）。
 *
 * 目標（格下げ可）と床（格下げ不可）を別々に返す採用理由を先に述べる。失敗時の扱いが両者で異なり、
 * 目標未達は逼迫時に警告へ格下げできるのに対し、最低フレーム下限の割れは格下げできない（docs/research/08 §6）。
 * 呼び側が終了コードの二層判定（目標は --warn-only で警告化、床は常に失敗）を組めるよう、判定結果も分離する。
 *
 * @param {{ avgFps: number, p5Fps: number }} measurements 平均と下位5パーセンタイルの毎秒フレーム数
 * @param {{ targetAvgFps: number, targetP5Fps: number, floorP5Fps: number }} [thresholds] 閾値（省略時は DEFAULT_FPS_THRESHOLDS）
 * @returns {{ targetMet: boolean, floorBreached: boolean, reasons: { target: string[], floor: string[] }, cues: { avgMeetsTarget: boolean, p5MeetsTarget: boolean, p5AboveFloor: boolean } }}
 */
export function evaluateFpsAcceptance(measurements, thresholds = DEFAULT_FPS_THRESHOLDS) {
  const t = thresholds;
  const avgFps = measurements.avgFps;
  const p5Fps = measurements.p5Fps;

  const targetReasons = [];
  const floorReasons = [];

  // 目標（格下げ可）: 平均と下位5パーセンタイルの両方が目標値以上。
  const avgMeetsTarget = avgFps >= t.targetAvgFps;
  if (!avgMeetsTarget) {
    targetReasons.push(
      `平均の毎秒フレーム数が目標未満です（${avgFps.toFixed(1)} で、目標 ${t.targetAvgFps} 未満です）`
    );
  }
  const p5MeetsTarget = p5Fps >= t.targetP5Fps;
  if (!p5MeetsTarget) {
    targetReasons.push(
      `下位5パーセンタイルの毎秒フレーム数が目標未満です（${p5Fps} で、目標 ${t.targetP5Fps} 未満です）`
    );
  }

  // 最低フレーム下限（格下げ不可）: 下位5パーセンタイルが床以上。
  const p5AboveFloor = p5Fps >= t.floorP5Fps;
  if (!p5AboveFloor) {
    floorReasons.push(
      `下位5パーセンタイルの毎秒フレーム数が最低フレーム下限を割りました（${p5Fps} で、下限 ${t.floorP5Fps} 未満です）`
    );
  }

  return {
    targetMet: targetReasons.length === 0,
    floorBreached: floorReasons.length > 0,
    reasons: { target: targetReasons, floor: floorReasons },
    cues: { avgMeetsTarget, p5MeetsTarget, p5AboveFloor },
  };
}
