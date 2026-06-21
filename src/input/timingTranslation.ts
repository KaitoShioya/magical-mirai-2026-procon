// 軌跡上距離と時間の翻訳（曲非依存の純粋関数）。Issue #49。
//
// 役割を先に述べる。本作のタイミングは概念正典 docs/idea/concept-final.md §4 により「カメラ軌跡上の
// ノーツ点と、反応した瞬間の軌跡上の点との、軌跡に沿った距離」で定義される。一方で判定の真の基準は
// 楽曲再生位置（時間）であり（docs/research/04-ux-and-chart-design.md §1、docs/decisions/architecture.md §6）、
// 距離は利用者へ見せる視覚表現である。カメラは区間ごとに速い・遅いがあるため、時間で定めた判定窓を
// 各ノーツ地点で距離へ読み替えるには、その地点のカメラ軌跡上の速さを掛ける必要がある。本モジュールは
// この「時間の窓を距離の窓へ翻訳する」関数と、「ノーツ時刻と入力時刻の軌跡に沿った符号付き距離差」を提供する。
//
// 消費側の整理を先に述べる。本モジュールは #48（タップ判定エンジン、線形減衰）・#51（反応強度計算、
// 軌跡上距離が近いほど精度が高い）・#57（落下式レーンと空間内ノーツの視覚表現）が消費する翻訳基本関数である。
// src/profiles/schema/profileSchema.ts の Note 注釈は「判定の軌跡上距離と速さは camera と timeMs から #48 が
// 導出するため保存しない」と書くが、その実行時の導出に使う基本関数は本モジュール（#49）であり、#48 はこれを消費する。
// 距離から時刻への逆変換は #13 の評価器 src/utils/cameraTrajectory.ts の timeAtDistance が担うため本モジュールには持たない。
//
// 依存方針の理由を先に述べる。input 層は three.js・profiles・tools・rendering を import しない
// （src/input/index.ts、docs/decisions/architecture.md §5、静的検査 src/input/importBoundary.test.ts）。
// よって本モジュールは軌跡を自前で構築せず、必要なメソッドだけを持つ最小の構造型 TrajectoryTimingSource を
// 本ファイル内で定義し、構築済みの軌跡を引数で受け取る。src/utils/cameraTrajectory.ts の CameraTrajectory は
// この形を構造的に満たすため、呼び出し側は createCameraTrajectory(profile.camera) の戻り値をそのまま渡せる。
// これは #40 src/profiles/generate/noteTrajectory.ts が最小構造型を自前定義して評価器の戻り値を受け取る前例に倣う。

/** 本モジュールが必要とする軌跡の最小の構造。距離から時刻への逆変換は使わないため要求しない。 */
export interface TrajectoryTimingSource {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  /** ある時刻のカメラ軌跡上の速さ（軌跡上距離 ÷ ミリ秒）。 */
  speedAt(timeMs: number): number;
  /** 始点からその時刻までの軌跡上の累積距離。時刻が軌跡の時刻範囲の外のときは、時刻を端点へ寄せた
   *  （クランプした）累積距離を返す契約とする。src/utils/cameraTrajectory.ts の distanceAt はこの挙動である。
   *  trajectoryDistanceFromNote はこの契約に依拠して、範囲外の入力時刻を例外にせず端点の距離として扱う。 */
  distanceAt(timeMs: number): number;
}

/** 判定窓を時間（ミリ秒）で与える3種。値の出典は src/config/tuning.ts の JUDGE_PERFECT_WINDOW_MS ほか。 */
export interface JudgeWindowsMs {
  perfectMs: number;
  decayOuterMs: number;
  pointMs: number;
}

/** 判定窓を距離へ翻訳した3種。 */
export interface JudgeWindowsDistance {
  perfectDistance: number;
  decayOuterDistance: number;
  pointDistance: number;
}

/** 軌跡の時刻範囲の契約を検査する。検査内容は、開始と終了が有限数であり、開始が終了より小さいこと。
 *  採用理由を先に述べる。createCameraTrajectory（#13）は2つ以上かつ時刻が厳密増加するキーフレームを要求し、
 *  戻り値の startTimeMs は必ず endTimeMs より小さい。しかし本モジュールは構造型で任意の軌跡を受け取れるため、
 *  この契約を満たさない軌跡（時刻範囲が非有限、または長さが0以下）を利用点で止める。これは #40 noteTrajectory.ts が
 *  軌跡範囲を同様に検査する方針に揃える。 */
function assertTrajectoryRange(trajectory: TrajectoryTimingSource): void {
  if (!Number.isFinite(trajectory.startTimeMs) || !Number.isFinite(trajectory.endTimeMs)) {
    throw new Error(
      `軌跡の時刻範囲は有限数でなければならないが 開始=${trajectory.startTimeMs} 終了=${trajectory.endTimeMs} が渡された`,
    );
  }
  if (!(trajectory.startTimeMs < trajectory.endTimeMs)) {
    throw new Error(
      `軌跡の時刻範囲は開始が終了より小さくなければならないが 開始=${trajectory.startTimeMs} 終了=${trajectory.endTimeMs} が渡された`,
    );
  }
}

/** ノーツ時刻が有限数かつ軌跡の時刻範囲の内側であることを検査する。範囲外は譜面または結線の誤りを意味するため
 *  例外で止める（#40 noteTrajectory.ts がノーツ時刻の範囲外を例外で拒否する方針に揃え、誤りを静かにクランプして隠さない）。 */
function assertNoteTimeInRange(trajectory: TrajectoryTimingSource, noteTimeMs: number): void {
  if (!Number.isFinite(noteTimeMs)) {
    throw new Error(`ノーツ時刻は有限数でなければならないが ${noteTimeMs} が渡された`);
  }
  if (noteTimeMs < trajectory.startTimeMs || noteTimeMs > trajectory.endTimeMs) {
    throw new Error(
      `ノーツ時刻 ${noteTimeMs} は軌跡の時刻範囲 [${trajectory.startTimeMs}, ${trajectory.endTimeMs}] の内側でなければならない`,
    );
  }
}

/**
 * 時間窓を、ノーツ地点のカメラ軌跡上の速さで距離窓へ翻訳する。戻り値は speedAt(noteTimeMs) × windowMs。
 *
 * 検査は次のとおり。軌跡の時刻範囲（assertTrajectoryRange）、ノーツ時刻が範囲内（assertNoteTimeInRange）、
 * windowMs が0以上の有限数であること（負の窓は意味を持たない）、speedAt(noteTimeMs) が0以上の有限数であること、
 * 戻り値が有限数であること。速さが0以上を要求する理由を先に述べる。概念正典 §4 はカメラが軌跡上を一方向に進むと
 * 定め、これは累積距離の単調増加と速さの非負に対応する（src/utils/cameraTrajectory.test.ts も速さが正であることを前提とする）。
 * 速さが負は軌跡の破綻を意味し、距離窓が負になって意味を失うため利用点で止める。
 */
export function timeWindowToDistance(
  trajectory: TrajectoryTimingSource,
  noteTimeMs: number,
  windowMs: number,
): number {
  assertTrajectoryRange(trajectory);
  assertNoteTimeInRange(trajectory, noteTimeMs);
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new Error(`判定窓は0以上の有限数でなければならないが ${windowMs} が渡された`);
  }
  const speed = trajectory.speedAt(noteTimeMs);
  if (!Number.isFinite(speed) || speed < 0) {
    throw new Error(`軌跡上の速さは0以上の有限数でなければならないが、ノーツ時刻 ${noteTimeMs} で ${speed} が得られた`);
  }
  const distanceWindow = speed * windowMs;
  if (!Number.isFinite(distanceWindow)) {
    throw new Error(`距離窓は有限数でなければならないが、ノーツ時刻 ${noteTimeMs}・判定窓 ${windowMs} で ${distanceWindow} になった`);
  }
  return distanceWindow;
}

/**
 * 判定窓3種（満点・減衰外端・点推定）をまとめて距離窓へ翻訳する。3項目それぞれに timeWindowToDistance を適用する。
 *
 * 窓の値の順序（満点 ≦ 点推定 ≦ 減衰外端）は検査も強制もしない。理由を先に述べる。本モジュールは与えられた窓を
 * 翻訳する汎用の関数であり、窓の値の妥当性と順序は窓を定義する側（src/config/tuning.ts と消費側の #48）の責務である。
 * 速さは0以上で乗算は順序を保つため、入力の窓が昇順であれば出力の距離窓も昇順に保たれる。
 */
export function noteDistanceWindows(
  trajectory: TrajectoryTimingSource,
  noteTimeMs: number,
  windows: JudgeWindowsMs,
): JudgeWindowsDistance {
  return {
    perfectDistance: timeWindowToDistance(trajectory, noteTimeMs, windows.perfectMs),
    decayOuterDistance: timeWindowToDistance(trajectory, noteTimeMs, windows.decayOuterMs),
    pointDistance: timeWindowToDistance(trajectory, noteTimeMs, windows.pointMs),
  };
}

/**
 * ノーツ時刻と入力時刻の、軌跡に沿った符号付き距離差を返す。戻り値は distanceAt(inputTimeMs) − distanceAt(noteTimeMs)。
 * 符号の約束は、入力がノーツより後（軌跡上で先へ進んだ＝遅れ）のとき正、前のとき負とする。
 *
 * 検査は次のとおり。軌跡の時刻範囲、ノーツ時刻が範囲内、入力時刻が有限数であること（範囲外は許す）。
 * 入力時刻の範囲外を許す理由を先に述べる。入力時刻は毎フレームの利用者の入力であり、楽曲の開始前や終了後に
 * わずかに範囲外となっても判定が落ちてはならないため、例外を投げず軌跡側の端点クランプ（distanceAt の既存挙動）に委ねる。
 * さらに distanceAt(noteTimeMs) と distanceAt(inputTimeMs) を別の文言で個別に有限性検査する。個別に検査する理由を
 * 先に述べる。差を取ってから一括で検査すると、どちらの距離が壊れたかが分からず原因の切り分けが遅れる。ノーツ側と
 * 入力側を別の文言で止めることで、軌跡が壊れている場合にどちらの時刻の評価が原因かを利用点で特定できる。
 */
export function trajectoryDistanceFromNote(
  trajectory: TrajectoryTimingSource,
  noteTimeMs: number,
  inputTimeMs: number,
): number {
  assertTrajectoryRange(trajectory);
  assertNoteTimeInRange(trajectory, noteTimeMs);
  if (!Number.isFinite(inputTimeMs)) {
    throw new Error(`入力時刻は有限数でなければならないが ${inputTimeMs} が渡された`);
  }
  const noteDistance = trajectory.distanceAt(noteTimeMs);
  if (!Number.isFinite(noteDistance)) {
    throw new Error(`ノーツ時刻 ${noteTimeMs} の軌跡上距離が有限数でない（${noteDistance}）`);
  }
  const inputDistance = trajectory.distanceAt(inputTimeMs);
  if (!Number.isFinite(inputDistance)) {
    throw new Error(`入力時刻 ${inputTimeMs} の軌跡上距離が有限数でない（${inputDistance}）`);
  }
  // 最後に差そのものの有限性も検査する。理由を先に述べる。ノーツ側と入力側の距離が各々有限でも、
  // 両者が浮動小数の表現範囲の両端に近い極端な値のとき、差が表現範囲を超えて非有限になりうる。
  // 非有限の距離差を返すと反応強度や判定の下流計算を壊すため、利用点で止める。
  const signedDistance = inputDistance - noteDistance;
  if (!Number.isFinite(signedDistance)) {
    throw new Error(
      `軌跡に沿った距離差は有限数でなければならないが、入力時刻 ${inputTimeMs} の距離 ${inputDistance} とノーツ時刻 ${noteTimeMs} の距離 ${noteDistance} の差が ${signedDistance} になった`,
    );
  }
  return signedDistance;
}
