// 目的関数統合（Issue #56）。
// 設計根拠 docs/decisions/app-overall-decisions.md §3.4・§3.5・§3.6、docs/idea/concept-final.md §8。
//
// 役割を先に述べる。既に実装済みの純粋関数群（素点 a＝tapBaseScore、多様性係数 D＝computeDiversityCoefficient、
// 投下倍率 M＝deploy、合成集計＝reduceScore）を、1プレイ全体にわたって状態を保持しながら結線する。タップ1回ごとに
// その瞬間の D と M を決めて合成式 a×D×M+combo へ渡し、一回性（タップ総数上限 N）を適用する。
//
// 既存の純粋関数志向（scoreAccumulator.ts・gauge.ts と同様、状態は呼び出し側が保持し「現在状態→次状態」を返す）に揃える。
// 入力状態とその内部の写像・配列は破壊せず、変更した部分だけを複製した新しい状態を返す。
//
// 依存規則（docs/decisions/architecture.md §5、src/scoring/README.md）に従い profiles・rendering・tools・three.js を
// 取り込まない。曲固有の値（反復区間・見せ場・タップ総数上限・正解スロット）は最小の値の形（ObjectiveContext）で受け取る。

import type { JudgmentResult } from "./types";
import {
  type ScoreState,
  type ScoreConfig,
  INITIAL_SCORE_STATE,
  DEFAULT_SCORE_CONFIG,
  reduceScore,
} from "./scoreAccumulator";
import { computeDiversityCoefficient } from "./diversityCoefficient";
import { type GaugeConfig, DEFAULT_GAUGE_CONFIG, accumulateGauge, deploy } from "./gauge";
import { tapBaseScore } from "./tapBaseScore";
import { summarizeScore, type ScoreResult } from "./scoreResult";
import type { ScoreBoundsInput } from "./scoreBounds";
import type { DiversityIndex } from "./diversityIndex";

/**
 * 逓減量 reductionFactor の本番初期値。#56 が所有する★暫定値で、実装後のプレイ検証で調整する。
 * 0.7 を採用する理由を先に述べる。docs/decisions/app-overall-decisions.md §3.4 は多様性係数 D を「1.0 未満」とだけ定め
 * 具体値を持たない。反復停滞タップの寄与を3割だけ減らす軽めの逓減とすることで、失敗のない床の方針（罰しすぎない）に
 * 配慮しつつ、多様性の有無で総合得点に明確な差を作れる中庸値とする。
 */
export const DEFAULT_REDUCTION_FACTOR = 0.7;

/** 目的関数の3要素の有効・無効。受け入れ基準「3要素ON/OFFで得点差が出る」の切替に使う。 */
export interface ObjectiveToggles {
  /** 多様性逓減 D を有効にするか。偽のとき D は常に 1.0。 */
  diversityReduction: boolean;
  /** 投下倍率 M を有効にするか。偽のとき投下は成立せず M は常に 1.0。 */
  deployment: boolean;
  /** 一回性（タップ総数上限 N）を有効にするか。偽のとき上限を見ない。 */
  oneShotLimit: boolean;
}

/** 3要素すべてを有効にした既定値。 */
export const DEFAULT_TOGGLES: ObjectiveToggles = {
  diversityReduction: true,
  deployment: true,
  oneShotLimit: true,
};

/** 目的関数エンジンの設定値。逓減量・ゲージ設定・得点合成設定・3要素のトグルをまとめる。 */
export interface ObjectiveConfig {
  reductionFactor: number;
  gauge: GaugeConfig;
  score: ScoreConfig;
  toggles: ObjectiveToggles;
}

/** 既定の設定値。 */
export const DEFAULT_OBJECTIVE_CONFIG: ObjectiveConfig = {
  reductionFactor: DEFAULT_REDUCTION_FACTOR,
  gauge: DEFAULT_GAUGE_CONFIG,
  score: DEFAULT_SCORE_CONFIG,
  toggles: DEFAULT_TOGGLES,
};

/** 見せ場の最小入力。曲プロファイルの Showcase の区間と重みを写す。 */
export interface ShowcaseWindow {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  weight: number;
}

/** エンジンが参照する曲固有データ。下流結線（#59）が曲プロファイルから組み立てて渡す。 */
export interface ObjectiveContext {
  diversityIndex: DiversityIndex;
  showcases: ReadonlyArray<ShowcaseWindow>;
  /** タップ総数上限 N。0以下のとき一回性が有効なら全タップが不算入になる。 */
  tapBudget: number;
}

/**
 * 適用中の投下。startedAtMusicTimeMs は発動時刻、endTimeMs は発動した見せ場の終了時刻、multiplier は投下倍率 M。
 * multiplier は常に 1 より大きい（倍率が1.0になる投下は成立させないため。applyDeploy 参照）。
 */
export interface ActiveDeploy {
  showcaseIndex: number;
  multiplier: number;
  startedAtMusicTimeMs: number;
  endTimeMs: number;
}

/** 1プレイ分の目的関数状態。呼び出し側が保持し、各遷移関数は破壊せずに次状態を返す。 */
export interface ObjectiveState {
  score: ScoreState;
  gaugeValue: number;
  /** 一回性の計上数。床タップを含む全タップを1ずつ数える。 */
  tapCount: number;
  /** 区間ごとの「拍オフセット→そのとき選んだ操作スロット」。前回区間の操作参照に使う。配列の索引は整列後の区間索引。 */
  zoneOperations: ReadonlyArray<ReadonlyMap<number, number>>;
  /** 適用中の投下。無いとき null。 */
  activeDeploy: ActiveDeploy | null;
}

/**
 * 初期状態を作る。区間数は context.diversityIndex.zoneCorrectSlots.length から導出する。
 * 引数で区間数を別に受け取らないのは、diversityIndex の区間数との食い違いを構造的に防ぐためである。
 */
export function createObjectiveState(context: ObjectiveContext): ObjectiveState {
  const zoneCount = context.diversityIndex.zoneCorrectSlots.length;
  const zoneOperations: Array<ReadonlyMap<number, number>> = [];
  for (let i = 0; i < zoneCount; i += 1) {
    zoneOperations.push(new Map<number, number>());
  }
  return {
    score: INITIAL_SCORE_STATE,
    gaugeValue: 0,
    tapCount: 0,
    zoneOperations,
    activeDeploy: null,
  };
}

/** 1タップ分の入力。 */
export interface TapEvent {
  /** judgeTap の戻り値。boundNoteId で区間内位置を引き、timingJust・pitchJust を combo・ゲージへ流す。 */
  judgment: JudgmentResult;
  /** プレイヤーが選んだ操作の音程スロット。Reaction.slotIndex（0始まり）をそのまま渡す。床タップでも常に値がある。 */
  operationSlot0: number;
  /** 投下区間の判定に使うゲーム時計の音楽時刻（ミリ秒）。 */
  musicTimeMs: number;
}

/** context.tapBudget を有限・非負へ整える。非有限値は0として扱う（実行時安定性を優先し例外で止めない）。 */
function finiteBudget(tapBudget: number): number {
  return Number.isFinite(tapBudget) ? tapBudget : 0;
}

/**
 * 1タップを反映した次状態を返す純粋関数。手順は次のとおり。
 * 1. 一回性: oneShotLimit が真かつ計上数が上限以上なら状態不変（上限超は得点・ゲージ・計上のいずれにも算入しない）。
 * 2. 素点 a を tapBaseScore で求める。
 * 3. 多様性係数 D: ノーツ位置を引き、前回区間の同じ拍オフセットの正解スロットと操作スロットを使って求める。
 *    diversityReduction が偽なら D=1.0。区間内タップなら操作スロットを履歴へ記録する（トグルの真偽に依らず記録）。
 * 4. 投下倍率 M: 適用中の投下の半開区間内なら倍率、それ以外1.0。倍率を決めた後で、窓を過ぎた投下を消す。
 * 5. ゲージ加算、6. 得点合成、7. 計上数を1増やす。
 */
export function applyTap(
  state: ObjectiveState,
  event: TapEvent,
  context: ObjectiveContext,
  config: ObjectiveConfig = DEFAULT_OBJECTIVE_CONFIG,
): ObjectiveState {
  // 1. 一回性。上限が0以下では初回（計上数0）から不算入になり全タップが算入されない。
  if (config.toggles.oneShotLimit && state.tapCount >= finiteBudget(context.tapBudget)) {
    return state;
  }

  // 2. 素点 a。
  const a = tapBaseScore(event.judgment);

  // 3. 多様性係数 D と操作履歴の記録。
  const { diversityIndex } = context;
  const boundNoteId = event.judgment.boundNoteId;
  const position = boundNoteId !== null ? diversityIndex.byNoteId.get(boundNoteId) : undefined;

  let diversity = 1.0;
  let zoneOperations = state.zoneOperations;

  if (position !== undefined) {
    const previousZone = diversityIndex.previousZoneIndex[position.zoneIndex];
    if (previousZone !== undefined) {
      const previousJustSlot = diversityIndex.zoneCorrectSlots[previousZone]?.get(position.beatOffset);
      const previousOperationSlot = state.zoneOperations[previousZone]?.get(position.beatOffset);
      // 前回値が undefined（前回区間に同じ拍オフセットのノーツが無い、または前回そこを操作していない）のとき、
      // computeDiversityCoefficient は 1.0 を返す。別途のガードは設けない。
      const rawDiversity = computeDiversityCoefficient(
        {
          currentJustSlot: position.correctSlot0,
          previousJustSlot,
          currentOperationSlot: event.operationSlot0,
          previousOperationSlot,
        },
        { reductionFactor: config.reductionFactor },
      );
      diversity = config.toggles.diversityReduction ? rawDiversity : 1.0;
    }
    // 区間内タップは、トグルの真偽に依らず操作履歴へ記録する（切替で履歴が変わらないようにする）。
    // 該当区間の写像だけを複製して更新し、他区間の写像と配列の同一性は保つ（破壊的更新をしない）。
    const updatedZoneMap = new Map(state.zoneOperations[position.zoneIndex]);
    updatedZoneMap.set(position.beatOffset, event.operationSlot0);
    zoneOperations = state.zoneOperations.map((map, index) =>
      index === position.zoneIndex ? updatedZoneMap : map,
    );
  }

  // 4. 投下倍率 M。まず半開区間で倍率を決め、その後で窓を過ぎた投下を消す（両者を混ぜない）。
  let multiplier = 1.0;
  let activeDeploy = state.activeDeploy;
  if (activeDeploy !== null) {
    if (
      config.toggles.deployment &&
      activeDeploy.startedAtMusicTimeMs <= event.musicTimeMs &&
      event.musicTimeMs < activeDeploy.endTimeMs
    ) {
      multiplier = activeDeploy.multiplier;
    }
    // 期限切れの消去はトグルの真偽に依らず行う。半開区間のため終了時刻ちょうどのタップは倍率1.0で、ここで消える。
    if (event.musicTimeMs >= activeDeploy.endTimeMs) {
      activeDeploy = null;
    }
  }

  // 5. ゲージ加算、6. 得点合成、7. 計上数。
  const gaugeValue = accumulateGauge(state.gaugeValue, event.judgment, config.gauge);
  const score = reduceScore(
    state.score,
    { a, diversity, multiplier, result: event.judgment },
    config.score,
  );

  return {
    score,
    gaugeValue,
    tapCount: state.tapCount + 1,
    zoneOperations,
    activeDeploy,
  };
}

/** 音楽時刻を含む見せ場を半開区間 [startTimeMs, endTimeMs) で探す。見せ場は重複しないため最初に一致したものを返す。 */
function showcaseAt(
  showcases: ReadonlyArray<ShowcaseWindow>,
  atMusicTimeMs: number,
): ShowcaseWindow | undefined {
  return showcases.find(
    (showcase) => showcase.startTimeMs <= atMusicTimeMs && atMusicTimeMs < showcase.endTimeMs,
  );
}

/**
 * 見せ場で投下した次状態を返す純粋関数。
 * 投下が無効、見せ場外、または倍率が1.0以下（空ゲージ・見せ場重み0）のときは状態を変えない。
 * 倍率が1より大きいときだけ適用中の投下を設定し（既存の適用中の投下があれば上書きして倍率・発動時刻・終了時刻を更新）、
 * ゲージを deploy の戻り値 remaining にする。
 */
export function applyDeploy(
  state: ObjectiveState,
  atMusicTimeMs: number,
  context: ObjectiveContext,
  config: ObjectiveConfig = DEFAULT_OBJECTIVE_CONFIG,
): ObjectiveState {
  if (!config.toggles.deployment) {
    return state;
  }
  const showcase = showcaseAt(context.showcases, atMusicTimeMs);
  if (showcase === undefined) {
    return state;
  }
  const result = deploy(state.gaugeValue, showcase.weight, config.gauge);
  if (result.multiplier <= 1) {
    // 得点に寄与しない投下は成立させない（ゲージも消費しない）。これにより適用中の投下は常に得点が上がる投下を意味する。
    return state;
  }
  return {
    ...state,
    gaugeValue: result.remaining,
    activeDeploy: {
      showcaseIndex: showcase.index,
      multiplier: result.multiplier,
      startedAtMusicTimeMs: atMusicTimeMs,
      endTimeMs: showcase.endTimeMs,
    },
  };
}

/**
 * プレイ終了時に総合得点・百分位・ランクへ要約する薄い窓口。
 * boundsInput（タップ総数上限 N などの曲固有値）は下流結線（#59）が曲プロファイルから渡す。
 */
export function summarizeObjective(
  state: ObjectiveState,
  boundsInput: ScoreBoundsInput,
  config: ObjectiveConfig = DEFAULT_OBJECTIVE_CONFIG,
): ScoreResult {
  return summarizeScore(state.score, boundsInput, config.score);
}
