import { describe, expect, it } from "vitest";
import { createCameraTrajectory, type CameraTrajectoryKeyframe } from "../../utils/cameraTrajectory";
import {
  placeNotesOnTrajectory,
  type TrajectoryNoteInput,
  type TrajectorySampler,
} from "./noteTrajectory";

// 合成軌跡で契約を固定する理由を先に述べる。本Issue（#40）の時点では実カメラキーフレームが存在しない
// （実カメラキーフレームの生成は #46、実データでの視認確認は #59）。よって *.takeover.test.ts は作らず、
// 時刻が厳密増加する合成キーフレームから createCameraTrajectory で軌跡補間器を作り、これを TrajectorySampler
// として渡して「補間器を正しく消費して保存形へ写す」ことのみを検査する。補間器そのものの補間精度は
// src/utils/cameraTrajectory.test.ts の責務とし、本テストでは再検査しない。

// 非一様な時刻間隔のキーフレーム（時刻から曲線パラメータへの写像を試すため間隔を変える）。
const keyframes: CameraTrajectoryKeyframe[] = [
  { timeMs: 0, position: { x: -30, y: 5, z: 30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 1000, position: { x: -10, y: 8, z: 10 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 5000, position: { x: 15, y: 4, z: 12 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 6000, position: { x: 25, y: 6, z: -20 }, target: { x: 0, y: 3, z: -2 } },
];

describe("placeNotesOnTrajectory（ノーツ軌跡上配置、Issue #40）", () => {
  it("各ノーツの算出位置が、その時刻の軌跡上位置 poseAt(timeMs).position と一致する（軌跡上に乗る）", () => {
    // 判定方法の採用理由を先に述べる。本関数は座標へ算術を行わず代入で写すだけであり、poseAt は同一入力に対し
    // 決定論で同一値を返すため、独立に算出した位置と保存値は同一の数値になる。よって近似一致ではなく深い等価で表明する。
    const trajectory = createCameraTrajectory(keyframes);
    const notes: TrajectoryNoteInput[] = [
      { id: "note-0000", timeMs: 0 },
      { id: "note-0001", timeMs: 750 },
      { id: "note-0002", timeMs: 3200 },
      { id: "note-0003", timeMs: 6000 },
    ];
    const placements = placeNotesOnTrajectory(notes, trajectory);
    for (let i = 0; i < notes.length; i += 1) {
      const expected = trajectory.poseAt(notes[i].timeMs).position;
      expect(placements[i].trajectoryPosition).toEqual({ x: expected.x, y: expected.y, z: expected.z });
    }
  });

  it("出力の識別子・件数・順序を入力どおり保つ", () => {
    const trajectory = createCameraTrajectory(keyframes);
    const notes: TrajectoryNoteInput[] = [
      { id: "note-0000", timeMs: 100 },
      { id: "note-0001", timeMs: 4000 },
      { id: "note-0002", timeMs: 5500 },
    ];
    const placements = placeNotesOnTrajectory(notes, trajectory);
    expect(placements.map((p) => p.id)).toEqual(["note-0000", "note-0001", "note-0002"]);
    expect(placements.length).toBe(3);
  });

  it("空配列入力は空配列を返す", () => {
    const trajectory = createCameraTrajectory(keyframes);
    expect(placeNotesOnTrajectory([], trajectory)).toEqual([]);
  });

  it("同一入力の2回呼び出しが深い等価で一致する（決定論）", () => {
    const trajectory = createCameraTrajectory(keyframes);
    const notes: TrajectoryNoteInput[] = [
      { id: "note-0000", timeMs: 250 },
      { id: "note-0001", timeMs: 5800 },
    ];
    expect(placeNotesOnTrajectory(notes, trajectory)).toEqual(placeNotesOnTrajectory(notes, trajectory));
  });

  describe("入力ノーツの異常を文脈付き例外で失敗させる", () => {
    const trajectory = createCameraTrajectory(keyframes);

    it("識別子が空文字のノーツで例外（メッセージに番号を含む）", () => {
      const notes: TrajectoryNoteInput[] = [{ id: "", timeMs: 100 }];
      expect(() => placeNotesOnTrajectory(notes, trajectory)).toThrow(/ノーツ\[0\].*id/);
    });

    it("時刻が NaN のノーツで例外", () => {
      const notes: TrajectoryNoteInput[] = [{ id: "note-0000", timeMs: Number.NaN }];
      expect(() => placeNotesOnTrajectory(notes, trajectory)).toThrow(/timeMs/);
    });

    it("時刻が Infinity のノーツで例外", () => {
      const notes: TrajectoryNoteInput[] = [{ id: "note-0000", timeMs: Number.POSITIVE_INFINITY }];
      expect(() => placeNotesOnTrajectory(notes, trajectory)).toThrow(/timeMs/);
    });

    it("時刻が startTimeMs 未満のノーツで例外（メッセージに範囲を含む）", () => {
      const notes: TrajectoryNoteInput[] = [{ id: "note-0000", timeMs: -1 }];
      expect(() => placeNotesOnTrajectory(notes, trajectory)).toThrow(/時刻範囲 \[0, 6000\]/);
    });

    it("時刻が endTimeMs 超過のノーツで例外", () => {
      const notes: TrajectoryNoteInput[] = [{ id: "note-0000", timeMs: 6001 }];
      expect(() => placeNotesOnTrajectory(notes, trajectory)).toThrow(/時刻範囲 \[0, 6000\]/);
    });

    it("時刻がちょうど startTimeMs・endTimeMs のノーツは成功する（両端を含む）", () => {
      const notes: TrajectoryNoteInput[] = [
        { id: "note-0000", timeMs: 0 },
        { id: "note-0001", timeMs: 6000 },
      ];
      expect(() => placeNotesOnTrajectory(notes, trajectory)).not.toThrow();
    });
  });

  describe("軌跡側の契約違反を文脈付き例外で失敗させる", () => {
    const finitePosition = { position: { x: 1, y: 2, z: 3 } };
    const note: TrajectoryNoteInput[] = [{ id: "note-0000", timeMs: 100 }];

    it("startTimeMs > endTimeMs の軌跡で例外", () => {
      const bad: TrajectorySampler = { startTimeMs: 1000, endTimeMs: 0, poseAt: () => finitePosition };
      expect(() => placeNotesOnTrajectory(note, bad)).toThrow(/時刻範囲は長さが正/);
    });

    it("startTimeMs === endTimeMs（時刻範囲が0）の軌跡で例外", () => {
      const bad: TrajectorySampler = { startTimeMs: 500, endTimeMs: 500, poseAt: () => finitePosition };
      expect(() => placeNotesOnTrajectory(note, bad)).toThrow(/時刻範囲は長さが正/);
    });

    it("startTimeMs が非有限の軌跡で例外", () => {
      const bad: TrajectorySampler = { startTimeMs: Number.NaN, endTimeMs: 6000, poseAt: () => finitePosition };
      expect(() => placeNotesOnTrajectory(note, bad)).toThrow(/startTimeMs/);
    });

    it("endTimeMs が非有限の軌跡で例外", () => {
      const bad: TrajectorySampler = {
        startTimeMs: 0,
        endTimeMs: Number.POSITIVE_INFINITY,
        poseAt: () => finitePosition,
      };
      expect(() => placeNotesOnTrajectory(note, bad)).toThrow(/endTimeMs/);
    });

    it("poseAt が非有限座標を返す軌跡で例外", () => {
      const bad: TrajectorySampler = {
        startTimeMs: 0,
        endTimeMs: 6000,
        poseAt: () => ({ position: { x: 1, y: Number.NaN, z: 3 } }),
      };
      expect(() => placeNotesOnTrajectory(note, bad)).toThrow(/軌跡上位置 y/);
    });
  });
});
