// 操作判定ゲート（Issue #103）。scoring（判定窓）と input（軌跡上距離と時間の換算）の統合の定義適合検査。
// 位置づけを先に述べる。本ファイルは docs/research/08-quality-assurance.md 3節の表の「操作判定」ゲートの実体であり、
// 検査の内容は「軌跡上距離と時間とミリ秒の換算式、判定窓の単体テスト」、合格閾値は「換算と判定窓が定義どおり」、
// 失敗時の扱いは「不合格（格下げ不可）」である。換算式（src/input/timingTranslation.ts、Issue #49）と判定窓
// （src/scoring/timingAccuracy.ts・pitchAccuracy.ts・tapJudgment.ts、Issue #48）は実装済みで各モジュールに単体テストがある。
// 本ゲートが新たに固定するのは、既存テストが押さえていない次の3点である。
//   (1) 判定窓の定数値そのもの（満点40・外端90・点推定60ミリ秒）の固定。既存テストは定数を窓として使うだけで値を固定しない。
//   (2) 換算が公開定数（src/config/tuning.ts）に束縛されていること。既存の換算テストは判定窓をリテラルで与え公開定数に束縛しない。
//   (3) 既定判定窓が公開定数から導出されている束縛。
// タイミング精度と音程精度の網羅的な振る舞いは既存モジュールテストに委ね、本ゲートは実プレイが使う既定窓での代表点に絞る。
//
// 配置の根拠を先に述べる。操作判定の主担当は判定エンジン（Issue #48）であり src/scoring/ が所有する。本ファイルは判定・換算・
// カメラ軌跡評価器・調整定数を横断して取り込むが、依存境界の静的検査（src/scoring/importBoundary.test.ts・
// src/input/importBoundary.test.ts）はいずれも検査対象から .test.ts を除外し、かつ禁止依存は profiles・rendering・tools・three 本体のみで
// input・utils・config は許可される。src/input/timingTranslation.test.ts が既に src/utils/cameraTrajectory.ts（three 本体に依存）を
// 取り込む前例があり、.test.ts が three へ間接依存することは許容済みである。

import { describe, expect, it } from "vitest";
import {
  JUDGE_DECAY_OUTER_WINDOW_MS,
  JUDGE_PERFECT_WINDOW_MS,
  JUDGE_POINT_ESTIMATE_WINDOW_MS,
} from "../config/tuning";
import {
  noteDistanceWindows,
  timeWindowToDistance,
  trajectoryDistanceFromNote,
  type JudgeWindowsMs,
  type TrajectoryTimingSource,
} from "../input/timingTranslation";
import { createCameraTrajectory, type CameraTrajectoryKeyframe } from "../utils/cameraTrajectory";
import { DEFAULT_JUDGMENT_WINDOWS } from "./defaultWindows";
import { isPitchJust, pitchAccuracy } from "./pitchAccuracy";
import { judgeTap } from "./tapJudgment";
import { tapMusicTimeMs } from "./tapMusicTime";
import { timingAccuracy } from "./timingAccuracy";
import type { FrameTimeSample, JudgmentNote, TapSample } from "./types";

// 期待する判定窓の定義値。採用理由を先に述べる。満点40・外端90・点推定60ミリ秒は
// docs/research/04-ux-and-chart-design.md 1節「判定窓」と docs/research/07-feasibility-and-parameters.md 2.4節が定める初期値であり、
// 本ゲートはこの値が静かに変わったときに必ず不合格になるよう、唯一の固定点としてここに置く。
const EXPECTED_PERFECT_MS = 40;
const EXPECTED_DECAY_OUTER_MS = 90;
const EXPECTED_POINT_ESTIMATE_MS = 60;

// 毎秒60フレームの1フレームの時間（ミリ秒）。採用理由を先に述べる。本作の性能目標は毎秒60フレームであり、
// 1フレームは 1000ミリ秒 ÷ 60 = 16.67ミリ秒である。1フレーム未満の時刻ズレは画面更新1回より細かく知覚されないため、
// 換算の時刻ズレの許容に用いる。インラインの数式でなく名前付き定数にして意図を残す。
const FRAME_60FPS_MS = 1000 / 60;

// 実評価器による換算の比例性を厳しく試すための、速い区間と遅い区間の速さ比の下限。採用理由を先に述べる。
// 実カメラ軌跡の速さ比の上界は資料に定まっていないため、特定の実カメラ設計に依存せず合成軌跡で確かめる。
// 4倍は両区間の差を十分大きく取るための下限の想定値であり、正典の値ではない（src/input/timingTranslation.test.ts に揃える）。
const SPEED_RATIO_STRESS = 4;

// なお、TAKEOVER の1拍342.9ミリ秒（毎分175拍）に対する判定窓の比率（満点が約12パーセント・外端が約26パーセント・
// 点推定が約17パーセント）は、判定窓の値を選んだ採用理由の参考情報である。1拍342.9ミリ秒は TAKEOVER に固有の楽曲依存値であり、
// docs/research/08-quality-assurance.md 2節「品質の指標は楽曲・舞台に依存しない指標とする」に従い、ゲートのコアに焼き込まず
// 合否条件にもしない。比率の参考記述は docs/runbooks/quality-harness.md の操作判定ゲートの節に置く。

/** 合成スタブの軌跡上距離を端点へ寄せる（クランプする）。実評価器 distanceAt の範囲外挙動に揃える。 */
function clampTime(timeMs: number, startTimeMs: number, endTimeMs: number): number {
  return Math.min(Math.max(timeMs, startTimeMs), endTimeMs);
}

describe("操作判定ゲート（scoring と input の統合: 判定窓と軌跡換算の定義適合）", () => {
  describe("判定窓の定義固定（楽曲非依存・格下げ不可の核）", () => {
    it("満点・外端・点推定の各定数が定義値に一致する", () => {
      // ここが判定窓の数値の唯一の固定点である。既存テストは定数を窓として使うだけで値を固定しないため、
      // この検査がなければ値が変わってもゲートが落ちない。
      expect(JUDGE_PERFECT_WINDOW_MS).toBe(EXPECTED_PERFECT_MS);
      expect(JUDGE_DECAY_OUTER_WINDOW_MS).toBe(EXPECTED_DECAY_OUTER_MS);
      expect(JUDGE_POINT_ESTIMATE_WINDOW_MS).toBe(EXPECTED_POINT_ESTIMATE_MS);
    });

    it("判定窓の順序が 0 < 満点 < 点推定 < 外端 である", () => {
      // 順序の根拠を先に述べる。満点窓は最も狭く、点推定は満点窓と外端の間の代表値、外端は線形減衰の終端かつ
      // 対応付けの窓であり、この大小関係が崩れると減衰曲線と対応付けが定義どおりに働かない。
      expect(0).toBeLessThan(JUDGE_PERFECT_WINDOW_MS);
      expect(JUDGE_PERFECT_WINDOW_MS).toBeLessThan(JUDGE_POINT_ESTIMATE_WINDOW_MS);
      expect(JUDGE_POINT_ESTIMATE_WINDOW_MS).toBeLessThan(JUDGE_DECAY_OUTER_WINDOW_MS);
    });
  });

  describe("既定判定窓の束縛（数値の固定ではなく導出の固定）", () => {
    it("既定判定窓が公開定数から導出されている", () => {
      // 採用理由を先に述べる。判定窓の数値は上の群が唯一の固定点として押さえるため、本群では数値リテラルと
      // 重ねて比較せず、既定窓が公開定数から導出されている束縛のみを検査する。これにより値の正典が
      // src/config/tuning.ts の定数に一意化され、将来 tuning.ts の定数だけを変えたときに既定窓がそれに追従していることを確認できる。
      expect(DEFAULT_JUDGMENT_WINDOWS.perfectMs).toBe(JUDGE_PERFECT_WINDOW_MS);
      expect(DEFAULT_JUDGMENT_WINDOWS.outerMs).toBe(JUDGE_DECAY_OUTER_WINDOW_MS);
    });
  });

  describe("タイミング精度が既定窓で定義どおり（代表点に限定・網羅は timingAccuracy.test.ts に委譲）", () => {
    it("満点窓端で1.0・外端で0.0・点推定で0.6を返す", () => {
      // 採用理由を先に述べる。実プレイが使う既定窓で、換算の前提となる判定の定義（満点窓内1.0・外端0.0・その間は線形）が
      // 成り立つことを1箇所で固定する。満点窓端と外端は連続曲線の確定値のため厳密一致でよい。点推定60は
      // 線形上の代表値 (90-60)/(90-40)=0.6 であり丸めに備えて近接比較する。負側は満点窓端と外端で対称性を確かめ、
      // 負側の点推定は既存テストが網羅するため重ねない（二重化最小化）。
      expect(timingAccuracy(JUDGE_PERFECT_WINDOW_MS, DEFAULT_JUDGMENT_WINDOWS)).toBe(1);
      expect(timingAccuracy(-JUDGE_PERFECT_WINDOW_MS, DEFAULT_JUDGMENT_WINDOWS)).toBe(1);
      expect(timingAccuracy(JUDGE_DECAY_OUTER_WINDOW_MS, DEFAULT_JUDGMENT_WINDOWS)).toBe(0);
      expect(timingAccuracy(-JUDGE_DECAY_OUTER_WINDOW_MS, DEFAULT_JUDGMENT_WINDOWS)).toBe(0);
      expect(timingAccuracy(JUDGE_POINT_ESTIMATE_WINDOW_MS, DEFAULT_JUDGMENT_WINDOWS)).toBeCloseTo(0.6, 10);
    });
  });

  describe("失敗のない床の成立要件（音程・構造のみ固定・床の大きさは固定しない）", () => {
    it("完全一致で1.0、不一致で0より大きく1未満（失敗のない床かつ完全一致が厳密に高い）", () => {
      // 採用理由を先に述べる。docs/idea/concept-final.md 4節・6節は「外れ音は存在しない」「失敗が存在しない床。
      // どのタップも必ず協和音が鳴る。差はスコアと光の豊かさのみ」と定めるが、床の具体的な数値は明記しない。
      // 床の大きさ（src/scoring/pitchAccuracy.ts の PITCH_MISS_FLOOR）は★暫定でプレイ検証で調整する値であり、
      // docs/research/07-feasibility-and-parameters.md 2節「すべての値は見積もりを初期値とし、実装後のプレイ検証で調整する」の対象で、
      // 仕様上の数値アンカーがなく、かつ Issue #103 の範囲「換算式と判定窓」の外である。よって大きさを固定せず、
      // 完全一致が満点で、不一致でも正の床が立ち（失敗のない床）、完全一致が不一致より厳密に高い、という成立要件の構造のみ固定する。
      expect(pitchAccuracy(3, 3)).toBe(1);
      const mismatch = pitchAccuracy(2, 5);
      expect(mismatch).toBeGreaterThan(0);
      expect(mismatch).toBeLessThan(1);
    });

    it("音程JUSTは整数の完全一致のときだけ真", () => {
      expect(isPitchJust(4, 4)).toBe(true);
      expect(isPitchJust(4, 5)).toBe(false);
    });
  });

  describe("換算が公開定数で定義どおり・時間窓から距離窓へ（定速スタブ・厳密算術）", () => {
    it("距離窓は速さと公開定数由来の時間窓の積に厳密一致する", () => {
      // 採用理由を先に述べる。既存の換算テストは判定窓をリテラルで与えるため、換算が公開定数に束縛されている保証がない。
      // 本検査は判定窓を src/config/tuning.ts の公開定数から組み、定速の合成スタブで距離窓が速さと時間窓の積に
      // 厳密一致することを確かめ、換算と判定が同じ公開定数を使う束縛を固定する。
      // 速さ0.5を選ぶ理由を先に述べる。0.5は2進法で正確に表せ、窓40・90・60との積（20・45・30）も正確になるため厳密一致で検査できる。
      const startTimeMs = 0;
      const endTimeMs = 1000;
      const speed = 0.5;
      const stub: TrajectoryTimingSource = {
        startTimeMs,
        endTimeMs,
        speedAt: () => speed,
        distanceAt: (timeMs) => speed * clampTime(timeMs, startTimeMs, endTimeMs),
      };
      const windowsMs: JudgeWindowsMs = {
        perfectMs: JUDGE_PERFECT_WINDOW_MS,
        decayOuterMs: JUDGE_DECAY_OUTER_WINDOW_MS,
        pointMs: JUDGE_POINT_ESTIMATE_WINDOW_MS,
      };
      expect(timeWindowToDistance(stub, 500, JUDGE_PERFECT_WINDOW_MS)).toBe(20);

      const distances = noteDistanceWindows(stub, 500, windowsMs);
      expect(distances.perfectDistance).toBe(20);
      expect(distances.decayOuterDistance).toBe(45);
      expect(distances.pointDistance).toBe(30);
    });
  });

  describe("換算の比例性と時刻ズレが1フレーム以内（実評価器・許容誤差）", () => {
    // 速い区間と遅い区間を持つ合成軌跡。採用理由を先に述べる。createCameraTrajectory は CatmullRom スプラインと弧長表に依る
    // 近似評価であり、純粋な数式でなくサンプリング誤差を含むため、厳密一致でなく近接比較と明示した許容で判定する。
    // 構成は src/input/timingTranslation.test.ts の fastSlowKeyframes と同種で、x軸上を区間ごとに等間隔の制御点で動かし、
    // 各窓（最大90ミリ秒）の前後で速さがほぼ一定に保たれるようにする。遅い区間は2000ミリ秒あたり2単位、
    // 速い区間は2000ミリ秒あたり20単位で速さの比は約10倍である。
    const fastSlowKeyframes: CameraTrajectoryKeyframe[] = [
      { timeMs: 0, position: { x: 0, y: 2, z: 0 }, target: { x: 0, y: 2, z: -10 } },
      { timeMs: 2000, position: { x: 2, y: 2, z: 0 }, target: { x: 2, y: 2, z: -10 } },
      { timeMs: 4000, position: { x: 4, y: 2, z: 0 }, target: { x: 4, y: 2, z: -10 } },
      { timeMs: 6000, position: { x: 6, y: 2, z: 0 }, target: { x: 6, y: 2, z: -10 } },
      { timeMs: 8000, position: { x: 26, y: 2, z: 0 }, target: { x: 26, y: 2, z: -10 } },
      { timeMs: 10000, position: { x: 46, y: 2, z: 0 }, target: { x: 46, y: 2, z: -10 } },
      { timeMs: 12000, position: { x: 66, y: 2, z: 0 }, target: { x: 66, y: 2, z: -10 } },
      { timeMs: 14000, position: { x: 86, y: 2, z: 0 }, target: { x: 86, y: 2, z: -10 } },
    ];
    const trajectory = createCameraTrajectory(fastSlowKeyframes);
    // 遅い区間の内側のノーツ（前後90ミリ秒の余白が区間内に収まる）と、速い区間の内側のノーツ。
    const slowNoteTimeMs = 3000;
    const fastNoteTimeMs = 11000;

    it("速い地点と遅い地点の距離窓の比が、その2地点の速さの比に一致する", () => {
      const windowMs = JUDGE_DECAY_OUTER_WINDOW_MS;
      const slowDistance = timeWindowToDistance(trajectory, slowNoteTimeMs, windowMs);
      const fastDistance = timeWindowToDistance(trajectory, fastNoteTimeMs, windowMs);
      const speedRatio = trajectory.speedAt(fastNoteTimeMs) / trajectory.speedAt(slowNoteTimeMs);
      expect(speedRatio).toBeGreaterThanOrEqual(SPEED_RATIO_STRESS);
      expect(fastDistance / slowDistance).toBeCloseTo(speedRatio, 9);
    });

    it("公開定数由来の各距離窓の時刻ズレが前後両方向とも1フレーム以内", () => {
      const windowsMs = [
        JUDGE_PERFECT_WINDOW_MS,
        JUDGE_DECAY_OUTER_WINDOW_MS,
        JUDGE_POINT_ESTIMATE_WINDOW_MS,
      ];
      for (const noteTimeMs of [slowNoteTimeMs, fastNoteTimeMs]) {
        const baseDistance = trajectory.distanceAt(noteTimeMs);
        for (const windowMs of windowsMs) {
          const distanceWindow = timeWindowToDistance(trajectory, noteTimeMs, windowMs);
          const forwardTime = trajectory.timeAtDistance(baseDistance + distanceWindow) - noteTimeMs;
          const backwardTime = trajectory.timeAtDistance(baseDistance - distanceWindow) - noteTimeMs;
          expect(Math.abs(forwardTime - windowMs)).toBeLessThanOrEqual(FRAME_60FPS_MS);
          expect(Math.abs(backwardTime - -windowMs)).toBeLessThanOrEqual(FRAME_60FPS_MS);
        }
      }
    });
  });

  describe("軌跡に沿った符号付き距離差の規約（ゲート内の代表点）", () => {
    it("入力がノーツより後で正、前で負、同時刻で0", () => {
      // 採用理由を先に述べる。Issue #103 本文の成立要件「軌跡上距離」をゲートファイル内でも直接担保するために、
      // 符号の約束（入力がノーツより後＝軌跡上で先へ進んだ＝遅れのとき正、前のとき負）を代表点で固定する。
      const startTimeMs = 0;
      const endTimeMs = 1000;
      const stub: TrajectoryTimingSource = {
        startTimeMs,
        endTimeMs,
        speedAt: () => 1,
        distanceAt: (timeMs) => clampTime(timeMs, startTimeMs, endTimeMs),
      };
      expect(trajectoryDistanceFromNote(stub, 200, 260)).toBe(60);
      expect(trajectoryDistanceFromNote(stub, 200, 140)).toBe(-60);
      expect(trajectoryDistanceFromNote(stub, 200, 200)).toBe(0);
    });
  });

  describe("統合の床保証と境界（入力時刻から音楽時刻への変換を経た判定）", () => {
    const note: JudgmentNote = { id: "note-1", timeMs: 1000, slot0: 3 };

    it("音楽時刻が信頼できないフレームでは床のタップになる", () => {
      // 採用理由を先に述べる。失敗のない床の方針により、音楽時刻の復元が信頼できないフレーム（再生外・再同期フレームなど）でも
      // 判定を止めず床のタップとして返す。tapMusicTimeMs と judgeTap を結合し、信頼性が偽のとき床になることを確かめる。
      const frame: FrameTimeSample = {
        musicPositionMs: 1000,
        frameWallTimeMs: 5000,
        reliableMusicTime: false,
      };
      const musicTimeMs = tapMusicTimeMs(5000, frame);
      const tap: TapSample = { musicTimeMs, slot0: 3, reliableMusicTime: frame.reliableMusicTime };
      const result = judgeTap(tap, [note], { windows: DEFAULT_JUDGMENT_WINDOWS });
      expect(result.isFloor).toBe(true);
      expect(result.boundNoteId).toBe(null);
      expect(result.timingAccuracy).toBe(0);
      expect(result.pitchAccuracy).toBe(0);
    });

    it("ノーツ時刻に一致する信頼できるタップは満点・音程一致で満点", () => {
      const frame: FrameTimeSample = {
        musicPositionMs: 1000,
        frameWallTimeMs: 5000,
        reliableMusicTime: true,
      };
      // 入力イベント時刻をフレーム実時計と同じにすると、フレーム内補正は0でタップの音楽時刻はノーツ時刻に一致する。
      const musicTimeMs = tapMusicTimeMs(5000, frame);
      const tap: TapSample = { musicTimeMs, slot0: 3, reliableMusicTime: true };
      const result = judgeTap(tap, [note], { windows: DEFAULT_JUDGMENT_WINDOWS });
      expect(result.isFloor).toBe(false);
      expect(result.boundNoteId).toBe("note-1");
      expect(result.timingJust).toBe(true);
      expect(result.timingAccuracy).toBe(1);
      expect(result.pitchAccuracy).toBe(1);
      expect(result.pitchJust).toBe(true);
    });

    it("中心化差が外端ちょうどのとき対応はするがタイミング精度は0（境界）", () => {
      // 採用理由を先に述べる。judgeTap は中心化差の絶対値が外端を超えるノーツを対応の候補から外すが、外端ちょうど（90ミリ秒）は
      // 超えていないため対応する。一方で timingAccuracy は外端で0になる。対応はするが精度0という境界の挙動を固定する。
      const frame: FrameTimeSample = {
        musicPositionMs: 1000 + JUDGE_DECAY_OUTER_WINDOW_MS,
        frameWallTimeMs: 5000,
        reliableMusicTime: true,
      };
      const musicTimeMs = tapMusicTimeMs(5000, frame);
      const tap: TapSample = { musicTimeMs, slot0: 3, reliableMusicTime: true };
      const result = judgeTap(tap, [note], { windows: DEFAULT_JUDGMENT_WINDOWS });
      expect(result.isFloor).toBe(false);
      expect(result.boundNoteId).toBe("note-1");
      expect(result.centeredDiffMs).toBe(JUDGE_DECAY_OUTER_WINDOW_MS);
      expect(result.timingAccuracy).toBe(0);
    });

    it("入力イベント時刻をフレーム実時計からずらすと、タップの音楽時刻が同量動く", () => {
      // 採用理由を先に述べる。フレーム内補正 musicPositionMs + (eventTimeMs - frameWallTimeMs) により、入力イベントが
      // フレームのどこで起きたかが判定の音楽時刻に反映される。同一フレームで入力イベント時刻を20ミリ秒ずらすと、
      // タップの音楽時刻が20ミリ秒動き、ひいては中心化差が同量動くことを固定する。
      const frame: FrameTimeSample = {
        musicPositionMs: 1000,
        frameWallTimeMs: 5000,
        reliableMusicTime: true,
      };
      const atFrameTime = tapMusicTimeMs(5000, frame);
      const later = tapMusicTimeMs(5020, frame);
      expect(later - atFrameTime).toBe(20);
    });
  });
});
