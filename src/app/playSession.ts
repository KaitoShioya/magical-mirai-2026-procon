// プレイ進行の採点・判定・音・光の統合（Issue #59）。
// 1プレイ分の可変状態（目的関数の状態・直近に設定したスロット音高・操作音の発音回数）をここに閉じ、
// 副作用の出口（操作音・反応光点・フレーム時刻標本・較正値）を注入で受け取り、ブラウザを使わない node 環境で
// 決定的に単体検証できるようにする。
//
// 依存方針の理由を先に述べる。本モジュールは統括（src/app）配下のため曲プロファイル由来データを受け取れるが、
// 判定・採点エンジン（src/scoring）へは最小形へ変換して渡す。判定の slot0 は0始まり、曲プロファイルの
// Note.slotIndex は1始まりであり、判定用ノーツを作るときに note.slotIndex - 1 で変換する。多様性索引は
// buildDiversityIndex が1始まりの slotIndex を受け取り内部で0始まりへ変換するため、ノーツをそのまま渡す。

import type { SongProfile } from "../profiles/schema";
import type { Reaction } from "../input";
import type { CameraTrajectory } from "../utils/cameraTrajectory";
import {
  LANTERN_BUTTERFLY_FORWARD_OFFSET,
  LANTERN_SUNFLOWER_MIN_SPACING,
  LANTERN_SUNFLOWER_RADIUS_MAX,
  LANTERN_SUNFLOWER_RADIUS_MIN,
  LANTERN_SUNFLOWER_RING_COUNT,
} from "../config/tuning";
import { createSunflowerRingPlacement } from "../utils/sunflowerRingPlacement";
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

/** 持続配置の灯し（蝶＋ひまわり）を1組置く入力。描画基盤の placeLantern と構造一致（型結合を避け構造で受け渡す）。
 *  蝶の配置点（前方オフセット適用済みのワールド座標）、ひまわりの水平位置（ミク中心の放射状リング配置で算出した
 *  x・z。水面の高さは描画層が水面領域から与える）、反応強度、退化時の近距離フェード旗を渡す。 */
export interface PlaceLanternInput {
  butterflyPosition: { x: number; y: number; z: number };
  /** ひまわりの水平位置X（ミク中心の放射状リング配置で算出）。 */
  sunflowerX: number;
  /** ひまわりの水平位置Z（ミク中心の放射状リング配置で算出）。 */
  sunflowerZ: number;
  /** 蝶の向き（軌道＝カメラ進行方向）の水平成分X。0,0のときは向き無し（既定姿勢）。 */
  headingX: number;
  /** 蝶の向き（軌道＝カメラ進行方向）の水平成分Z。0,0のときは向き無し（既定姿勢）。 */
  headingZ: number;
  /** タイミング精度（0以上1以下）。大きさへ写す。 */
  sizeStrength: number;
  /** 音程精度（0以上1以下）。輝度へ写す。 */
  brightnessStrength: number;
  /** 近距離フェードの対象か（退化時の配置で真）。 */
  nearFade: boolean;
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
  /** 持続配置の灯し（蝶＋ひまわり、本タスク）を1組置く。得点が出たタップ（素点が0より大きいタップ）でのみ呼ぶ。 */
  placeLantern(input: PlaceLanternInput): void;
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
    placeLantern,
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

  // 持続配置のひまわりの放射状リング配置（本タスク）。中心は初音ミク（湖の中心＝原点。src/config/character.ts の
  // position が原点）。反応の正確さに応じて中心からの半径を決め、帯ごとの上限と外向きの送りで自然な疎密にする。
  const sunflowerRing = createSunflowerRingPlacement({
    centerX: 0,
    centerZ: 0,
    radiusMin: LANTERN_SUNFLOWER_RADIUS_MIN,
    radiusMax: LANTERN_SUNFLOWER_RADIUS_MAX,
    ringCount: LANTERN_SUNFLOWER_RING_COUNT,
    minSpacing: LANTERN_SUNFLOWER_MIN_SPACING,
  });

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

  // 持続灯しの蝶の配置点と近距離フェード旗を求める。蝶はカメラ位置（カメラワークの軌道上の通過点）から視線方向
  // （カメラ位置→注視点の単位ベクトル）へ前方オフセットだけずらした点に置く。前方へずらすのは、カメラ位置そのものへ
  // 置くと配置の瞬間にカメラ近傍（近接面0.1の内側）でクリップ・過大表示になるためである。視線方向が定まらない退化時
  // （カメラ位置と注視点が一致して長さ0）はオフセットを足さずカメラ位置に置き、近距離フェードの対象（nearFade=true）に
  // して、カメラが離れるにつれ現す。
  function lanternButterflyPlacement(musicTimeMs: number): {
    butterflyPosition: { x: number; y: number; z: number };
    nearFade: boolean;
    headingX: number;
    headingZ: number;
  } {
    const pose = cameraTrajectory.poseAt(musicTimeMs);
    // 蝶の向き（軌道＝カメラの進行方向）の水平成分。前後の微小時刻のカメラ位置の差から接線を求め、x・z へ射影して
    // 正規化する。微小時刻は約1フレーム（16ミリ秒）とし、軌跡の範囲内へ収める。接線の水平成分がほぼ0（停止・真上下移動）
    // のときは向き無し（0,0）として、描画層は既定の姿勢のままにする。
    const tangentHalfStepMs = 16;
    const beforeMs = Math.max(cameraTrajectory.startTimeMs, musicTimeMs - tangentHalfStepMs);
    const afterMs = Math.min(cameraTrajectory.endTimeMs, musicTimeMs + tangentHalfStepMs);
    const beforePos = cameraTrajectory.poseAt(beforeMs).position;
    const afterPos = cameraTrajectory.poseAt(afterMs).position;
    let headingX = afterPos.x - beforePos.x;
    let headingZ = afterPos.z - beforePos.z;
    const headingLength = Math.sqrt(headingX * headingX + headingZ * headingZ);
    if (headingLength > 0) {
      headingX /= headingLength;
      headingZ /= headingLength;
    } else {
      headingX = 0;
      headingZ = 0;
    }

    const vx = pose.target.x - pose.position.x;
    const vy = pose.target.y - pose.position.y;
    const vz = pose.target.z - pose.position.z;
    const length = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (length > 0) {
      const k = LANTERN_BUTTERFLY_FORWARD_OFFSET / length;
      return {
        butterflyPosition: {
          x: pose.position.x + vx * k,
          y: pose.position.y + vy * k,
          z: pose.position.z + vz * k,
        },
        nearFade: false,
        headingX,
        headingZ,
      };
    }
    return {
      butterflyPosition: { x: pose.position.x, y: pose.position.y, z: pose.position.z },
      nearFade: true,
      headingX,
      headingZ,
    };
  }

  return {
    reset(): void {
      objectiveState = createObjectiveState(context);
      calibrationOffsetMs = getCalibrationOffsetMs();
      playSlotCallCount = 0;
      // 持続配置のひまわりのリング配置状態を初期化する（リトライで前回の疎密を持ち越さない）。
      sunflowerRing.reset();
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
      // 反応強度（精度→大きさ・輝度）。世界座標・大きさ・輝度への写像は描画層が担う。
      const strength = reactionStrength(judgment);
      // 画面全体の水面の波紋と、持続配置の灯し（蝶＋ひまわり）は、得点が0でないタップ（ノーツに当たって素点を得た
      // タップ）のみ行う。空打ち（対応ノーツ無し）は timingAccuracy も pitchAccuracy も0で素点が0になるため、いずれも
      // 行わない。タップ位置の手応えは画面全体の水面の波紋（spawnTapRipple）が担う（本タスク以前の挙動。要望により
      // タップ箇所の一過性蝶は波紋と重複するため設けない）。
      if (tapBaseScore(judgment, TAP_SCORE_WEIGHTS) > 0) {
        spawnTapRipple?.(reaction.slotIndex);
        const { butterflyPosition, nearFade, headingX, headingZ } = lanternButterflyPlacement(musicTimeMs);
        // ひまわりは蝶（カメラ通過点）とは独立に、ミク中心の放射状リングへ配置する。反応の正確さは、タイミング精度
        // （大きさ強度）と音程精度（輝度強度）の平均で表し、正確なほど中心に近い半径へ置く。
        const accuracy = (strength.size + strength.brightness) / 2;
        const sunflower = sunflowerRing.place(accuracy);
        if (
          Number.isFinite(butterflyPosition.x) &&
          Number.isFinite(butterflyPosition.y) &&
          Number.isFinite(butterflyPosition.z) &&
          Number.isFinite(sunflower.x) &&
          Number.isFinite(sunflower.z)
        ) {
          placeLantern({
            butterflyPosition,
            sunflowerX: sunflower.x,
            sunflowerZ: sunflower.z,
            headingX,
            headingZ,
            sizeStrength: strength.size,
            brightnessStrength: strength.brightness,
            nearFade,
          });
        }
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
