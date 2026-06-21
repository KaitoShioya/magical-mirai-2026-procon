// 各ノーツを、その時刻のカメラ軌跡上の位置（カメラ位置そのもの）へ配置する曲非依存の純粋関数。Issue #40。
//
// 配置の意味を先に述べる。docs/idea/concept-final.md §4「時間の進行でカメラが移動し、空間内に軌跡を描く。
// 各ノーツポイントは軌跡上の固定位置に置かれる」、§7「ノーツ点の真下が、楽曲終了後のひまわりの配置位置になる」、
// docs/research/04-ux-and-chart-design.md §4「各ノーツを、その時刻のカメラの軌跡上の位置へ置く」より、
// ノーツの trajectoryPosition は、そのノーツの時刻におけるカメラ軌跡上のカメラ位置（poseAt(timeMs).position）である。
// 判定（#48・#49）が使うのと同一の軌跡補間器の戻り値を保存形へ写すことで、配置が判定と同じ軌跡上に乗ることを
// 構成上保証する。本関数の出力は最終 Note の trajectoryPosition 項目で、id・timeMs・beatIndex の引き継ぎと
// slotIndex・pattern（#39）の付与、曲プロファイルJSONへの書き込みは後段（#39・#45・#46）が行う。
//
// 依存方針の理由を先に述べる。軌跡補間器 src/utils/cameraTrajectory.ts は three.js（CatmullRomCurve3・Vector3）を
// 実行時に取り込み、その公開インターフェース CameraTrajectory は本Issueが使わない speedAt・distanceAt・timeAtDistance も
// 含む。生成層（profiles/generate）は three.js を実行時に取り込まない方針である（onsetNotes.ts の依存方針）。
// よって本関数が必要とする startTimeMs・endTimeMs・poseAt(timeMs).position の3つだけを持つ最小の構造型
// TrajectorySampler を本ファイル内で定義して受け取る。CameraTrajectory はこの形を構造的に満たすため、呼び出し側は
// createCameraTrajectory(profile.camera) の戻り値をそのまま渡せる。これにより本モジュールは cameraTrajectory.ts を
// 型としても取り込まず、three.js への依存も持たず、本Issueの責務に不要な軌跡補間器の他機能へ結合しない。
// Vec3 のみを ../schema/profileSchema から型として取り込む。

import type { Vec3 } from "../schema/profileSchema";

/** trajectoryPosition の付与に必要な最小項目だけを受ける入力。OnsetNote 全体には結合しない。 */
export interface TrajectoryNoteInput {
  /** プロファイル内で一意の識別子。OnsetNote.id をそのまま渡す。 */
  id: string;
  /** 演出に使う実時刻（ミリ秒）。OnsetNote.timeMs をそのまま渡す。 */
  timeMs: number;
}

/** 軌跡補間器に求める最小の構造。CameraTrajectory（src/utils/cameraTrajectory.ts）はこの形を構造的に満たすため、
 *  createCameraTrajectory の戻り値をそのまま渡せる。 */
export interface TrajectorySampler {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  poseAt(timeMs: number): { position: Vec3 };
}

/** ノーツ識別子と軌跡上位置の対（本関数の出力1要素）。組み立て（#45・#46）が id で #39 の出力と結合する。 */
export interface NoteTrajectoryPlacement {
  id: string;
  trajectoryPosition: Vec3;
}

/** 数値が有限であることを検査し、満たさなければ文脈付きの例外を投げる。
 *  発生源で止める理由を先に述べる。poseAt は範囲外の時刻を端点へクランプし、NaN は比較が偽になって安全に扱えない。
 *  非有限値を素通しすると曲外や不正な時刻のノーツが端点や不正座標へ潰れ、ノーツごとの固定位置（concept-final §4）を
 *  静かに壊す。呼び出し側は曲プロファイルJSONを生成する #45・#46 で、異常はJSON混入前に止める必要がある。 */
function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限数である必要があるが ${value} が渡された`);
  }
}

/**
 * 各ノーツを、その時刻のカメラ軌跡上の位置（カメラ位置）へ配置し、ノーツ識別子と位置の対を入力順に返す。
 *
 * 処理は次のとおり。
 * 第1に、軌跡側の契約を最初に1回だけ検査する。startTimeMs・endTimeMs が有限数であり、startTimeMs < endTimeMs
 *   （時刻範囲の長さが正）であること。厳密な「より小さい」を採る理由を先に述べる。現実に渡される軌跡は
 *   createCameraTrajectory の戻り値で、同関数は2つ以上かつ時刻が厳密増加するキーフレームを要求するため、戻り値の
 *   startTimeMs は必ず endTimeMs より小さい。時刻範囲が0の軌跡は全ノーツが同一の瞬間へ対応する縮退入力で、全ノーツが
 *   同一点へ潰れて固定位置（concept-final §4）を壊すため、実補間器の契約に揃えて拒否する。
 * 第2に、入力ノーツを入力順に走査し、各ノーツの識別子が空でない文字列であること、timeMs が有限数であること、
 *   timeMs が [startTimeMs, endTimeMs]（両端を含む）の内側であることを検査する。
 * 第3に、poseAt(timeMs).position を求め、座標 x・y・z が有限数であることを検査したうえで、{x, y, z} へ代入のみで写す
 *   （座標へ算術を行わない）。
 *
 * 出力は入力の順序を保つため、入力が時刻昇順であれば出力も時刻昇順になる。空配列入力は空配列を返す。
 */
export function placeNotesOnTrajectory(
  notes: readonly TrajectoryNoteInput[],
  trajectory: TrajectorySampler,
): NoteTrajectoryPlacement[] {
  assertFinite(trajectory.startTimeMs, "軌跡の startTimeMs");
  assertFinite(trajectory.endTimeMs, "軌跡の endTimeMs");
  if (!(trajectory.startTimeMs < trajectory.endTimeMs)) {
    throw new Error(
      `軌跡の時刻範囲は長さが正である必要があるが startTimeMs=${trajectory.startTimeMs} endTimeMs=${trajectory.endTimeMs} が渡された`,
    );
  }

  const placements: NoteTrajectoryPlacement[] = [];
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    if (typeof note.id !== "string" || note.id.length === 0) {
      throw new Error(`ノーツ[${index}] の id は空でない文字列である必要があるが ${JSON.stringify(note.id)} が渡された`);
    }
    if (!Number.isFinite(note.timeMs)) {
      throw new Error(`ノーツ id=${note.id}（[${index}]）の timeMs は有限数である必要があるが ${note.timeMs} が渡された`);
    }
    if (note.timeMs < trajectory.startTimeMs || note.timeMs > trajectory.endTimeMs) {
      throw new Error(
        `ノーツ id=${note.id}（[${index}]）の timeMs=${note.timeMs} は軌跡の時刻範囲 [${trajectory.startTimeMs}, ${trajectory.endTimeMs}] の内側である必要がある`,
      );
    }

    const { position } = trajectory.poseAt(note.timeMs);
    assertFinite(position.x, `ノーツ id=${note.id}（[${index}]）の軌跡上位置 x`);
    assertFinite(position.y, `ノーツ id=${note.id}（[${index}]）の軌跡上位置 y`);
    assertFinite(position.z, `ノーツ id=${note.id}（[${index}]）の軌跡上位置 z`);

    placements.push({
      id: note.id,
      trajectoryPosition: { x: position.x, y: position.y, z: position.z },
    });
  }

  return placements;
}
