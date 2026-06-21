// 既定の判定窓。数値は src/config/tuning.ts の判定窓定数から取り、本モジュールでは再定義しない
// （tuning.ts の出典 docs/research/04-ux-and-chart-design.md §1、docs/research/07-feasibility-and-parameters.md §2.4）。
// 呼び出し側（#59）が judgeTap に渡す既定値であり、プレイ検証での調整は tuning.ts 側で行う。

import { JUDGE_DECAY_OUTER_WINDOW_MS, JUDGE_PERFECT_WINDOW_MS } from "../config/tuning";
import type { JudgmentWindows } from "./types";

/** 既定の判定窓（満点窓40ミリ秒・外端90ミリ秒）。 */
export const DEFAULT_JUDGMENT_WINDOWS: JudgmentWindows = {
  perfectMs: JUDGE_PERFECT_WINDOW_MS,
  outerMs: JUDGE_DECAY_OUTER_WINDOW_MS,
};
