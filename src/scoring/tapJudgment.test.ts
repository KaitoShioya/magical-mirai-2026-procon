import { describe, expect, it } from "vitest";
import { DEFAULT_JUDGMENT_WINDOWS } from "./defaultWindows";
import { judgeTap } from "./tapJudgment";
import type { JudgmentNote, TapSample } from "./types";

const options = { windows: DEFAULT_JUDGMENT_WINDOWS };

function tap(musicTimeMs: number, slot0: number, reliableMusicTime = true): TapSample {
  return { musicTimeMs, slot0, reliableMusicTime };
}

describe("judgeTap 対応付けと床保証（受け入れ基準2・§8）", () => {
  it("窓内の1ノーツへ対応し精度とJUSTを返す", () => {
    const notes: JudgmentNote[] = [{ id: "n1", timeMs: 1000, slot0: 2 }];
    const r = judgeTap(tap(1000, 2), notes, options);
    expect(r.boundNoteId).toBe("n1");
    expect(r.isFloor).toBe(false);
    expect(r.centeredDiffMs).toBe(0);
    expect(r.timingAccuracy).toBe(1);
    expect(r.pitchAccuracy).toBe(1);
    expect(r.timingJust).toBe(true);
    expect(r.pitchJust).toBe(true);
  });

  it("同時押し（同一時刻の複数スロット）でスロット一致のノーツが選ばれる", () => {
    // 第2基準スロット一致は時間差が等しいときだけ機能するため、timeMs を厳密に同一にする。
    const notes: JudgmentNote[] = [
      { id: "n-a", timeMs: 1000, slot0: 1 },
      { id: "n-b", timeMs: 1000, slot0: 4 },
      { id: "n-c", timeMs: 1000, slot0: 6 },
    ];
    const r = judgeTap(tap(1000, 4), notes, options);
    expect(r.boundNoteId).toBe("n-b");
    expect(r.pitchJust).toBe(true);
  });

  it("第1基準は時間差（スロット一致より時間が近い方を選ぶ）", () => {
    const notes: JudgmentNote[] = [
      { id: "near-wrong", timeMs: 1005, slot0: 5 },
      { id: "far-right", timeMs: 1080, slot0: 2 },
    ];
    const r = judgeTap(tap(1000, 2), notes, options);
    expect(r.boundNoteId).toBe("near-wrong");
    expect(r.pitchJust).toBe(false);
    expect(r.pitchAccuracy).toBeCloseTo(0.2, 10);
  });

  it("窓外しかなければ床のタップ（結果は返る）", () => {
    const notes: JudgmentNote[] = [{ id: "far", timeMs: 1000, slot0: 2 }];
    const r = judgeTap(tap(1200, 2), notes, options);
    expect(r.boundNoteId).toBeNull();
    expect(r.isFloor).toBe(true);
    expect(r.timingAccuracy).toBe(0);
    expect(r.pitchAccuracy).toBe(0);
  });

  it("空ノーツ列でも床のタップを返す", () => {
    const r = judgeTap(tap(1000, 2), [], options);
    expect(r.isFloor).toBe(true);
    expect(r.boundNoteId).toBeNull();
  });

  it("同一時間差・同一スロット一致状態では id 昇順で決定論", () => {
    const notes: JudgmentNote[] = [
      { id: "n-2", timeMs: 1000, slot0: 3 },
      { id: "n-1", timeMs: 1000, slot0: 3 },
    ];
    const r = judgeTap(tap(1000, 3), notes, options);
    expect(r.boundNoteId).toBe("n-1");
  });

  it("信頼できないフレームのタップは窓内にノーツがあっても床", () => {
    const notes: JudgmentNote[] = [{ id: "n1", timeMs: 1000, slot0: 2 }];
    const r = judgeTap(tap(1000, 2, false), notes, options);
    expect(r.isFloor).toBe(true);
    expect(r.boundNoteId).toBeNull();
  });

  it("非有限の時刻を持つノーツは対応付けの候補から除く", () => {
    const notes: JudgmentNote[] = [
      { id: "bad", timeMs: Number.NaN, slot0: 2 },
      { id: "good", timeMs: 1010, slot0: 2 },
    ];
    const r = judgeTap(tap(1000, 2), notes, options);
    expect(r.boundNoteId).toBe("good");
  });

  it("補正値で対応付けの中心が移動する", () => {
    const notes: JudgmentNote[] = [{ id: "n1", timeMs: 1000, slot0: 2 }];
    // 生差+20だが補正値+20で中心化0となり満点。
    const r = judgeTap(tap(1020, 2), notes, { windows: DEFAULT_JUDGMENT_WINDOWS, calibrationOffsetMs: 20 });
    expect(r.timingJust).toBe(true);
    expect(r.timingAccuracy).toBe(1);
  });

  it("補正値が対応付け窓を平行移動させ、生差が窓内でも補正後に窓外なら床（第3レビュー反映）", () => {
    // 較正は判定窓の中心を平行移動させる。窓は中心化済み時間差で定義するため、生差が外端±90ミリ秒以内でも
    // 補正後に外端を超えれば対応付けから外れて床になる。これは「窓中心が動く」仕様の正しい帰結である。
    const notes: JudgmentNote[] = [{ id: "n1", timeMs: 1000, slot0: 2 }];
    // 生差+85（窓内）だが補正値-10で中心化95（外端90超）→ 床。
    const r = judgeTap(tap(1085, 2), notes, { windows: DEFAULT_JUDGMENT_WINDOWS, calibrationOffsetMs: -10 });
    expect(r.isFloor).toBe(true);
    expect(r.boundNoteId).toBeNull();
  });

  it("補正値が対応付け窓を平行移動させ、生差が窓外でも補正後に窓内なら対応する（第3レビュー反映）", () => {
    const notes: JudgmentNote[] = [{ id: "n1", timeMs: 1000, slot0: 2 }];
    // 生差+95（窓外）だが補正値+10で中心化85（外端90以内）→ 対応。
    const r = judgeTap(tap(1095, 2), notes, { windows: DEFAULT_JUDGMENT_WINDOWS, calibrationOffsetMs: 10 });
    expect(r.boundNoteId).toBe("n1");
    expect(r.isFloor).toBe(false);
    expect(r.centeredDiffMs).toBeCloseTo(85, 10);
  });
});
