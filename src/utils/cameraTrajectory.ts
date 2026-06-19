// カメラ軌跡評価器（曲非依存の純粋関数）。曲ごとのカメラキーフレーム列から、任意時刻の
// カメラ位置・注視点（poseAt）、軌跡上速度（speedAt）、軌跡上累積距離（distanceAt）、
// 距離から時刻への逆変換（timeAtDistance）を返す。描画（#40・M2）と判定（#48・#49・M4）が共有する。
//
// 依存方針の理由を先に述べる。入力型 CameraTrajectoryKeyframe は本ファイル内で独立に定義し、
// src/profiles/schema を取り込まない。判定層（scoring・input）が評価器経由で曲プロファイル型へ
// 間接依存するのを断ち、依存方向を一方向に保つためである（architecture.md §5）。profiles/schema の
// CameraKeyframe とは構造が一致するため、呼び出し側は profile.camera をそのまま渡せる。
//
// three.js への依存の許容理由を先に述べる。技術要件（Issue #13）が CatmullRomCurve3 を指定しており、
// 三次Catmull-Romスプラインの補間を自前で再実装するより検証済みの標準実装を使う方が安全である。
// 取り込みは必要部品のみを名前付きで行う（rendering/README.md の方針に合わせる）。
import { CatmullRomCurve3, Vector3 } from "three";

// 弧長表のサンプル時間刻み（ミリ秒）。採用理由を先に述べる。距離から時刻への変換は弧長表の線形補間で行い、
// 真の連続弧長との差は弦近似と補間によって生じる。刻みを4ミリ秒まで細かくすると、滑らかなカメラ軌跡では
// この差が時刻に直して受け入れ基準±16ミリ秒に対し十分小さく収まる（高密度参照との比較で検証する）。
const ARC_LENGTH_SAMPLE_STEP_MS = 4;

// 軌跡上速度の中心差分の半刻み（ミリ秒）。採用理由を先に述べる。速度は軌跡上距離の中心差分
// (distanceAt(t+h)-distanceAt(t-h))/(2h) で算出し、判定が使う軌跡上距離と定義を一致させる。
// 半刻み1ミリ秒は弧長表の刻み4ミリ秒より小さく局所の速度を捉え、かつ浮動小数の桁落ちが問題になる
// 微小量より十分大きいためこの値を採る。なお弧長表が4ミリ秒刻みのため、得られる速度は区間ごとに
// 区分的な近似値であり、真の連続な接線速度ではない。
const SPEED_DIFFERENCE_HALF_STEP_MS = 1;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface CameraTrajectoryKeyframe {
  timeMs: number;
  position: Vec3Like;
  target: Vec3Like;
}

export interface CameraPose {
  position: Vec3Like;
  target: Vec3Like;
}

export interface CameraTrajectory {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  poseAt(timeMs: number): CameraPose;
  speedAt(timeMs: number): number;
  distanceAt(timeMs: number): number;
  timeAtDistance(distance: number): number;
}

export function createCameraTrajectory(
  keyframes: readonly CameraTrajectoryKeyframe[]
): CameraTrajectory {
  if (keyframes.length < 2) {
    throw new Error("カメラ軌跡には2つ以上のキーフレームが必要です");
  }
  for (let i = 1; i < keyframes.length; i += 1) {
    if (!(keyframes[i].timeMs > keyframes[i - 1].timeMs)) {
      throw new Error("カメラ軌跡のキーフレームは時刻が厳密に増加していなければなりません");
    }
  }

  const times = keyframes.map((keyframe) => keyframe.timeMs);
  const startTimeMs = times[0];
  const endTimeMs = times[times.length - 1];
  const lastIndex = keyframes.length - 1;

  // 位置・注視点をそれぞれCatmull-Romスプラインで補間する（注視点もキーフレームごとに持つ）。
  // curveType を centripetal（重心式）にする理由を先に述べる。一様式はキーフレーム間隔が不均一なとき
  // 行き過ぎ（オーバーシュート）やループを生じやすくカメラが破綻して見える。重心式はこれを避け滑らかに保つ。
  const positionCurve = new CatmullRomCurve3(
    keyframes.map((k) => new Vector3(k.position.x, k.position.y, k.position.z)),
    false,
    "centripetal"
  );
  const targetCurve = new CatmullRomCurve3(
    keyframes.map((k) => new Vector3(k.target.x, k.target.y, k.target.z)),
    false,
    "centripetal"
  );

  // 時刻を曲線パラメータ u（0〜1）へ写す。CatmullRomCurve3.getPoint(u) は制御点 i を
  // u = i/(制御点数-1) に等間隔で置くため（開曲線では curveType に依らず成立する）、時刻区間
  // [t_i, t_{i+1}] の内分比 f を u = (i + f)/(制御点数-1) に対応させると、各キーフレームを
  // その時刻ちょうどに通過する。なお getPoint は u をそのままセグメント選択に使う関数であり、
  // 弧長で等間隔化する getPointAt とは異なる（本写像は getPoint にのみ妥当）。
  function timeToParameter(timeMs: number): number {
    const clamped = Math.min(Math.max(timeMs, startTimeMs), endTimeMs);
    // times[i] <= clamped を満たす最大の i（0 <= i <= lastIndex-1）を二分探索で求める。
    let low = 0;
    let high = lastIndex - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (times[mid] <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    const i = low;
    const segmentStart = times[i];
    const segmentEnd = times[i + 1];
    const f = segmentEnd > segmentStart ? (clamped - segmentStart) / (segmentEnd - segmentStart) : 0;
    return (i + f) / lastIndex;
  }

  const positionScratch = new Vector3();
  const targetScratch = new Vector3();

  function poseAt(timeMs: number): CameraPose {
    const u = timeToParameter(timeMs);
    positionCurve.getPoint(u, positionScratch);
    targetCurve.getPoint(u, targetScratch);
    return {
      position: { x: positionScratch.x, y: positionScratch.y, z: positionScratch.z },
      target: { x: targetScratch.x, y: targetScratch.y, z: targetScratch.z },
    };
  }

  function distanceBetween(a: Vec3Like, b: Vec3Like): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // 弧長表: 始点から各サンプル時刻までの累積距離。サンプルは始点から ARC_LENGTH_SAMPLE_STEP_MS 刻みで取り、
  // 終点を必ず含める。位置関数は連続なので隣接サンプルの弦長を足し上げると軌跡上距離をよく近似する。
  const sampleTimes: number[] = [startTimeMs];
  const cumulativeDistances: number[] = [0];
  {
    let previous = poseAt(startTimeMs).position;
    let accumulated = 0;
    for (let t = startTimeMs + ARC_LENGTH_SAMPLE_STEP_MS; t < endTimeMs; t += ARC_LENGTH_SAMPLE_STEP_MS) {
      const current = poseAt(t).position;
      accumulated += distanceBetween(previous, current);
      sampleTimes.push(t);
      cumulativeDistances.push(accumulated);
      previous = current;
    }
    const endPosition = poseAt(endTimeMs).position;
    accumulated += distanceBetween(previous, endPosition);
    sampleTimes.push(endTimeMs);
    cumulativeDistances.push(accumulated);
  }
  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];

  function distanceAt(timeMs: number): number {
    const clamped = Math.min(Math.max(timeMs, startTimeMs), endTimeMs);
    // sampleTimes[i] <= clamped を満たす最大の i を二分探索し、距離を線形補間する。
    let low = 0;
    let high = sampleTimes.length - 2;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (sampleTimes[mid] <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    const i = low;
    const spanMs = sampleTimes[i + 1] - sampleTimes[i];
    const f = spanMs > 0 ? (clamped - sampleTimes[i]) / spanMs : 0;
    return cumulativeDistances[i] + (cumulativeDistances[i + 1] - cumulativeDistances[i]) * f;
  }

  function timeAtDistance(distance: number): number {
    const clamped = Math.min(Math.max(distance, 0), totalDistance);
    // cumulativeDistances[i] <= clamped を満たす最大の i を二分探索し、時刻を線形補間する。
    // 累積距離は単調増加（カメラが一方向に進む。concept-final.md §4）なので逆変換は一意。
    let low = 0;
    let high = cumulativeDistances.length - 2;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (cumulativeDistances[mid] <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    const i = low;
    const spanDistance = cumulativeDistances[i + 1] - cumulativeDistances[i];
    const f = spanDistance > 0 ? (clamped - cumulativeDistances[i]) / spanDistance : 0;
    return sampleTimes[i] + (sampleTimes[i + 1] - sampleTimes[i]) * f;
  }

  function speedAt(timeMs: number): number {
    // 速度は軌跡上距離の中心差分で算出する（判定が使う軌跡上距離と定義を一致させるため）。
    // 弧長表が4ミリ秒刻みのため区間ごとに区分的な近似値となる（真の連続な接線速度ではない）。
    const before = Math.max(timeMs - SPEED_DIFFERENCE_HALF_STEP_MS, startTimeMs);
    const after = Math.min(timeMs + SPEED_DIFFERENCE_HALF_STEP_MS, endTimeMs);
    const spanMs = after - before;
    if (spanMs <= 0) {
      return 0;
    }
    return (distanceAt(after) - distanceAt(before)) / spanMs;
  }

  return { startTimeMs, endTimeMs, poseAt, speedAt, distanceAt, timeAtDistance };
}
