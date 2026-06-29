import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  afterTheCurtainCameraKeyframes,
  afterTheCurtainInputs,
  AFTER_THE_CURTAIN_DURATION_MS,
} from "./afterTheCurtainInputs";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { SONGS } from "../../config/songs";

// 実データ（アフター・ザ・カーテンの音楽地図ダンプ）を素のデータファイルとして読む。曲別手動入力に与えた実値が、
// 受け入れ基準（調の解決・多様性逓減区間・カメラ軌跡上速度・末尾時刻）を満たすことを固定する。
const songmapPath = fileURLToPath(
  new URL("../../../docs/analysis/after-the-curtain.songmap.json", import.meta.url),
);
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap & {
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
};

const song = SONGS.find((s) => s.key === "after-the-curtain");
if (song === undefined) {
  throw new Error("ロード設定 SONGS に after-the-curtain が存在しない");
}
const source = { songKey: song.key, songUrl: song.songUrl, video: song.video };
const { profile, validation } = buildProfile({ songmap, manual: afterTheCurtainInputs, source });

describe("アフター・ザ・カーテン 曲別手動入力", () => {
  it("生成プロファイルが検証を通る", () => {
    if (!validation.ok) {
      throw new Error(`検証に失敗した:\n${validation.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`);
    }
    expect(validation.ok).toBe(true);
  });

  it("調の解決: 曲頭の無和音区間（直前和音が無い索引0）が D 短調の主和音 Dm へ解決する", () => {
    // 曲頭の無和音区間は既定規則で「調の音階」へ倒れ、musicalKey（D短調、主音クラス2）の主和音 Dm に解決する。
    // 生成プロファイルのスロットは和音区間と1対1で対応するため、索引0のスロットの和音名が Dm であることで調の反映を確かめる。
    expect(profile.chords[0].name).toBe("N");
    expect(profile.slots[0].chordName).toBe("Dm");
  });

  it("自動抽出された多様性逓減区間: diversityZones の件数がサビ区間数に一致し、climax がちょうど1つの見せ場と整合する", () => {
    const chorusCount = songmap.segments.filter((s) => s.isChorus).length;
    expect(profile.diversityZones).toHaveLength(chorusCount);
    expect(profile.showcases.filter((s) => s.isClimax)).toHaveLength(1);
  });

  it("カメラ軌跡上速度が全区間で正である", () => {
    // 採取時刻を軌跡の時刻範囲に収める理由と、刻み16ミリ秒・各キーフレーム直前直後1ミリ秒を加える理由は
    // takeoverInputs.test.ts と同じ（重心式スプラインの制御点近傍の瞬間的な停止を見逃さないため）。
    const trajectory = createCameraTrajectory(profile.camera);
    const { startTimeMs, endTimeMs } = trajectory;
    const sampleTimes = new Set<number>();
    for (let t = startTimeMs; t <= endTimeMs; t += 16) {
      sampleTimes.add(t);
    }
    sampleTimes.add(endTimeMs);
    for (const keyframe of profile.camera) {
      sampleTimes.add(Math.max(keyframe.timeMs - 1, startTimeMs));
      sampleTimes.add(keyframe.timeMs);
      sampleTimes.add(Math.min(keyframe.timeMs + 1, endTimeMs));
    }
    let minSpeed = Number.POSITIVE_INFINITY;
    for (const t of sampleTimes) {
      minSpeed = Math.min(minSpeed, trajectory.speedAt(t));
    }
    expect(minSpeed).toBeGreaterThan(0);
  });

  it("カメラ末尾時刻が曲長に一致し、全ノーツが軌跡の時刻範囲に収まる", () => {
    const cameraEndMs = profile.camera[profile.camera.length - 1].timeMs;
    expect(cameraEndMs).toBe(profile.song.durationMs);
    expect(cameraEndMs).toBe(AFTER_THE_CURTAIN_DURATION_MS);
    expect(afterTheCurtainCameraKeyframes).toHaveLength(6);
    const maxNoteTimeMs = Math.max(...profile.notes.map((n) => n.timeMs));
    expect(cameraEndMs).toBeGreaterThanOrEqual(maxNoteTimeMs);
  });
});
