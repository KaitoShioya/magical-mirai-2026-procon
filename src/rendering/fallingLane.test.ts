import { describe, expect, it } from "vitest";
import { createFallingLane } from "./fallingLane";
import type { LaneNote } from "../types/judgmentLane";

// 消滅エフェクト（burst＝弾けるエフェクト）の発火条件を、描画器に触れず node で検証する。InstancedMesh の活動数は
// CPU 側で数えられる。本タスクの要件「burst は得点が出たタップのときだけ出す」を、burstOnNoteArrival の切替と
// spawnTapRipple（得点が0でないタップでのみ統括が呼ぶ受け口）の挙動で固定する。

const notes: readonly LaneNote[] = [{ id: "n0", timeMs: 1000, slotIndex: 3 }];

function update(lane: ReturnType<typeof createFallingLane>, gameTimeMs: number): void {
  lane.update({ gameTimeMs, aspect: 1.78, viewportPixelHeight: 844 });
}

describe("createFallingLane の消滅エフェクト（burst）の発火条件", () => {
  it("既定（burstOnNoteArrival 既定 true）ではノーツの自動通過で burst を発火する", () => {
    const lane = createFallingLane({ notes });
    update(lane, 0); // 基準時刻を確定（この回は発火しない）。
    update(lane, 2000); // 1000 のノーツが判定線を通過 → 自動発火。
    expect(lane.burstActiveCount()).toBeGreaterThan(0);
    lane.dispose();
  });

  it("burstOnNoteArrival=false ではノーツの自動通過で burst を発火しない", () => {
    const lane = createFallingLane({ notes, burstOnNoteArrival: false });
    update(lane, 0);
    update(lane, 2000);
    expect(lane.burstActiveCount()).toBe(0);
    lane.dispose();
  });

  it("burstOnNoteArrival=false でも、得点が出たタップ（spawnTapRipple）で burst と波紋を発火する", () => {
    const lane = createFallingLane({ notes, burstOnNoteArrival: false });
    update(lane, 0);
    update(lane, 500); // 直近の芯半径・最大半径を確定させる。
    lane.spawnTapRipple(2);
    expect(lane.burstActiveCount()).toBeGreaterThan(0);
    expect(lane.rippleActiveCount()).toBeGreaterThan(0);
    lane.dispose();
  });
});
