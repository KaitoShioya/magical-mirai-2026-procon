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

  // 軌跡上距離・速度・逆変換はタスク2で実装する。型を満たす仮実装を置く。
  function distanceAt(): number {
    return 0;
  }
  function timeAtDistance(): number {
    return startTimeMs;
  }
  function speedAt(): number {
    return 0;
  }

  return { startTimeMs, endTimeMs, poseAt, speedAt, distanceAt, timeAtDistance };
}
