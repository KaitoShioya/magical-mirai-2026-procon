// プレイ進行の採点・判定・音・光の統合（Issue #59）。
// 1プレイ分の可変状態（目的関数の状態・直近に設定したスロット音高・操作音の発音回数）をここに閉じ、
// 副作用の出口（操作音・反応光点・フレーム時刻標本・較正値）を注入で受け取り、ブラウザを使わない node 環境で
// 決定的に単体検証できるようにする。
//
// 依存方針の理由を先に述べる。本モジュールは統括（src/app）配下のため曲プロファイル由来データを受け取れるが、
// 判定・採点エンジン（src/scoring）へは最小形へ変換して渡す。判定の slot0 は0始まり、曲プロファイルの
// Note.slotIndex は1始まりであり、判定用ノーツを作るときに note.slotIndex - 1 で変換する。多様性索引は
// buildDiversityIndex が1始まりの slotIndex を受け取り内部で0始まりへ変換するため、ノーツをそのまま渡す。

import type { SongProfile, Note } from "../profiles/schema";
import type { Reaction } from "../input";
import type { CameraTrajectory } from "../utils/cameraTrajectory";
import {
  judgeTap,
  DEFAULT_JUDGMENT_WINDOWS,
  tapMusicTimeMs,
  buildDiversityIndex,
  createObjectiveState,
  applyTap,
  applyDeploy,
  summarizeObjective,
  reactionStrength,
  tapBaseScore,
  TAP_SCORE_WEIGHTS,
  rankOrdinal,
  DEFAULT_OBJECTIVE_CONFIG,
  type ObjectiveConfig,
  type ObjectiveContext,
  type ObjectiveState,
  type ShowcaseWindow,
  type JudgmentNote,
  type FrameTimeSample,
  type ScoreResult,
  type ScoreBoundsInput,
} from "../scoring";

/** 一過性の蝶（演奏中の光点）の寿命秒。採用理由を先に述べる。ハメた瞬間に舞って消える短い余韻として、
 *  拍の数倍に収まり残像が散らからない約1.2秒とする。★実機調整で確定する暫定値。 */
export const REACTION_BUTTERFLY_LIFE_SECONDS = 1.2;

/** 床タップ（対応ノーツ無し）の光点を、カメラ注視点の周りへ散らす世界座標の幅。採用理由を先に述べる。
 *  カメラ注視点の近傍に収まり、密集時も重なりにくい控えめな幅として世界座標2単位とする。
 *  ★実機調整で確定する暫定値。 */
const REACTION_FLOOR_SCATTER = 2;

/** 反応光点（蝶）を1個出す入力。描画基盤の spawnReactionButterfly と構造一致（型結合を避け構造で受け渡す）。 */
export interface ReactionLightInput {
  position: { x: number; y: number; z: number };
  /** タイミング精度（0以上1以下）。大きさへ写す。 */
  sizeStrength: number;
  /** 音程精度（0以上1以下）。輝度へ写す。 */
  brightnessStrength: number;
  /** 寿命秒。 */
  lifeSeconds: number;
}

/** ランクゲージの現在入力（百分位とランク添字）。screens/types.ts の RankGaugeInput と構造一致。 */
export interface PlayRankGaugeState {
  percentile: number;
  rankIndex: number;
}

/** 通しスモークが読む読み取り専用の診断状態。 */
export interface PlaySessionDiagnostics {
  tapCount: number;
  gaugeValue: number;
  percentile: number;
  rankIndex: number;
  deployActive: boolean;
  playSlotCallCount: number;
}

/** 操作音のうち本セッションが使う最小の口（注入で擬似実装に差し替え可能にする）。 */
export interface PlaySessionOperationSound {
  playSlot(slotIndex: number): void;
  setDeployTimbre(active: boolean): void;
}

/** createPlaySession の注入依存。副作用の出口をすべて差し替え可能にする。 */
export interface PlaySessionDeps {
  profile: SongProfile;
  cameraTrajectory: CameraTrajectory;
  operationSound: PlaySessionOperationSound;
  spawnReactionLight(input: ReactionLightInput): void;
  /**
   * 画面全体の水面の波紋を、得点が0でないタップ（ノーツに当たって素点を得たタップ）のレーンから立てる（Issue #202）。
   * 任意の出口とし、未注入なら波紋を立てない（波紋を必要としない検証では省略できる）。
   */
  spawnTapRipple?(slotIndex0: number): void;
  /** 統括が毎フレーム更新する直近のフレーム時刻標本を読む。 */
  getFrameSample(): FrameTimeSample;
  /** プレイ開始時に読み直す較正値（ミリ秒）。 */
  getCalibrationOffsetMs(): number;
  /** 目的関数の設定。既定は DEFAULT_OBJECTIVE_CONFIG。検証で投下の自動発動などを小さな容量で確かめるため注入可能にする。 */
  config?: ObjectiveConfig;
}

/** プレイ進行セッションの外部契約。 */
export interface PlaySession {
  /** プレイ進入時に状態を初期化する。 */
  reset(): void;
  /** タップ1回を反映する（判定→水滴音の発音→一過性の蝶→採点→投下の自動発動）。 */
  onReaction(reaction: Reaction): void;
  /** プレイフレームごとに呼ぶ。音楽時刻は clock.gameTimeMs。投下期限解消・自動発動・投下音色を進める。 */
  updateFrame(musicTimeMs: number): void;
  /** ランクゲージの現在入力（百分位とランク添字）を返す。 */
  rankGaugeState(): PlayRankGaugeState;
  /** プレイ終了時の最終スコアを要約して返す。 */
  finalResult(): ScoreResult;
  /** 通しスモークが読む読み取り専用の診断状態を返す。 */
  diagnostics(): PlaySessionDiagnostics;
}

/**
 * プレイ進行セッションを生成する。生成時に曲非依存の派生データ（判定用ノーツ・目的関数の文脈・得点上限）を一度だけ作る。
 * 判定基準時刻は拍格子時刻 beats[note.beatIndex].startTimeMs（演出実時刻 note.timeMs ではない）。
 * beatIndex が beats の範囲外のプロファイルは結線の誤りを意味するため、生成時に明示エラーで止める。
 */
export function createPlaySession(deps: PlaySessionDeps): PlaySession {
  const {
    profile,
    cameraTrajectory,
    operationSound,
    spawnReactionLight,
    spawnTapRipple,
    getFrameSample,
    getCalibrationOffsetMs,
  } = deps;
  const config = deps.config ?? DEFAULT_OBJECTIVE_CONFIG;

  const judgmentNotes: JudgmentNote[] = profile.notes.map((note) => {
    const beat = profile.beats[note.beatIndex];
    if (beat === undefined) {
      throw new Error(
        `ノーツ ${note.id} の beatIndex ${note.beatIndex} が beats（要素数 ${profile.beats.length}）の範囲外です`,
      );
    }
    return { id: note.id, timeMs: beat.startTimeMs, slot0: note.slotIndex - 1 };
  });

  const noteById = new Map<string, Note>(profile.notes.map((note) => [note.id, note]));

  const showcases: ShowcaseWindow[] = profile.showcases.map((showcase) => ({
    index: showcase.index,
    startTimeMs: showcase.startTimeMs,
    endTimeMs: showcase.endTimeMs,
    weight: showcase.weight,
  }));
  const context: ObjectiveContext = {
    diversityIndex: buildDiversityIndex(profile.notes, profile.diversityZones),
    showcases,
    tapBudget: profile.tapBudget.limit,
  };
  const scoreBounds: ScoreBoundsInput = { tapBudget: profile.tapBudget.limit };

  let objectiveState: ObjectiveState = createObjectiveState(context);
  let calibrationOffsetMs = getCalibrationOffsetMs();
  let playSlotCallCount = 0;

  // ゲージ満タンかつ適用中の投下が無いとき、見せ場区間内で自動発動する。区間外・倍率1以下では状態不変。
  function tryAutoDeploy(state: ObjectiveState, atMusicTimeMs: number): ObjectiveState {
    if (state.activeDeploy !== null) {
      return state;
    }
    if (state.gaugeValue < config.gauge.fullCapacity) {
      return state;
    }
    return applyDeploy(state, atMusicTimeMs, context, config);
  }

  // 適用中の投下が現在時刻の半開区間 [startedAtMusicTimeMs, endTimeMs) 内か。
  function isDeployActiveAt(state: ObjectiveState, musicTimeMs: number): boolean {
    const deploy = state.activeDeploy;
    return (
      deploy !== null &&
      deploy.startedAtMusicTimeMs <= musicTimeMs &&
      musicTimeMs < deploy.endTimeMs
    );
  }

  // 反応光点の位置。対応ノーツがあればその軌跡位置、床タップはカメラ注視点にタップ画面位置由来の小さな散らしを足す。
  function reactionLightPosition(
    reaction: Reaction,
    boundNoteId: string | null,
    musicTimeMs: number,
  ): { x: number; y: number; z: number } {
    if (boundNoteId !== null) {
      const note = noteById.get(boundNoteId);
      if (note !== undefined) {
        return note.trajectoryPosition;
      }
    }
    const target = cameraTrajectory.poseAt(musicTimeMs).target;
    return {
      x: target.x + (reaction.normalizedX - 0.5) * REACTION_FLOOR_SCATTER,
      y: target.y + (0.5 - reaction.normalizedY) * REACTION_FLOOR_SCATTER,
      z: target.z,
    };
  }

  return {
    reset(): void {
      objectiveState = createObjectiveState(context);
      calibrationOffsetMs = getCalibrationOffsetMs();
      playSlotCallCount = 0;
    },

    onReaction(reaction: Reaction): void {
      const frame = getFrameSample();
      const musicTimeMs = tapMusicTimeMs(reaction.eventTimeMs, frame);
      const judgment = judgeTap(
        { musicTimeMs, slot0: reaction.slotIndex, reliableMusicTime: frame.reliableMusicTime },
        judgmentNotes,
        { windows: DEFAULT_JUDGMENT_WINDOWS, calibrationOffsetMs },
      );
      // 心地よい水滴音。どのタップも必ず発音する（床でも鳴らす。音はどのレーンでも同じ）。
      operationSound.playSlot(reaction.slotIndex);
      playSlotCallCount += 1;
      // 一過性の蝶（光点）。精度→大きさ・輝度の強度を渡す（世界座標への写像は描画層が担う）。
      const strength = reactionStrength(judgment);
      const position = reactionLightPosition(reaction, judgment.boundNoteId, musicTimeMs);
      if (
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        Number.isFinite(position.z)
      ) {
        spawnReactionLight({
          position,
          sizeStrength: strength.size,
          brightnessStrength: strength.brightness,
          lifeSeconds: REACTION_BUTTERFLY_LIFE_SECONDS,
        });
      }
      // 画面全体の水面の波紋は、得点が0でないタップ（ノーツに当たって素点を得たタップ）のレーンからのみ立てる。
      // 空打ち（対応ノーツ無し）は timingAccuracy も pitchAccuracy も0で素点が0になるため、波紋を立てない。
      if (tapBaseScore(judgment, TAP_SCORE_WEIGHTS) > 0) {
        spawnTapRipple?.(reaction.slotIndex);
      }

      // 採点と投下の自動発動。
      objectiveState = applyTap(
        objectiveState,
        { judgment, operationSlot0: reaction.slotIndex, musicTimeMs },
        context,
        config,
      );
      objectiveState = tryAutoDeploy(objectiveState, musicTimeMs);
    },

    updateFrame(musicTimeMs: number): void {
      // 期限切れ投下の解消（タップが無いまま見せ場を抜ける場合に備える）。
      const deploy = objectiveState.activeDeploy;
      if (deploy !== null && musicTimeMs >= deploy.endTimeMs) {
        objectiveState = { ...objectiveState, activeDeploy: null };
      }
      objectiveState = tryAutoDeploy(objectiveState, musicTimeMs);
      operationSound.setDeployTimbre(isDeployActiveAt(objectiveState, musicTimeMs));
    },

    rankGaugeState(): PlayRankGaugeState {
      const result = summarizeObjective(objectiveState, scoreBounds, config);
      return { percentile: result.percentile, rankIndex: rankOrdinal(result.rank) };
    },

    finalResult(): ScoreResult {
      return summarizeObjective(objectiveState, scoreBounds, config);
    },

    diagnostics(): PlaySessionDiagnostics {
      const result = summarizeObjective(objectiveState, scoreBounds, config);
      return {
        tapCount: objectiveState.tapCount,
        gaugeValue: objectiveState.gaugeValue,
        percentile: result.percentile,
        rankIndex: rankOrdinal(result.rank),
        deployActive: objectiveState.activeDeploy !== null,
        playSlotCallCount,
      };
    },
  };
}
