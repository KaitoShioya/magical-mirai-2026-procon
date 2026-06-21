import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { takeoverCameraKeyframes, takeoverInputs, TAKEOVER_DURATION_MS } from "./takeoverInputs";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { SONGS } from "../../config/songs";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。Issue #46 が takeoverInputs に与えた実値が、
// 受け入れ基準（多様性逓減区間・カメラ軌跡上速度・無和音区間の埋め方）を満たすことを固定する。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap & {
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
};

const TIME_TOLERANCE_MS = 1;

const takeoverSong = SONGS.find((s) => s.key === "takeover");
if (takeoverSong === undefined) {
  throw new Error("ロード設定 SONGS に takeover が存在しない");
}
const source = { songKey: takeoverSong.key, songUrl: takeoverSong.songUrl, video: takeoverSong.video };
const { profile, validation } = buildProfile({ songmap, manual: takeoverInputs, source });

describe("TAKEOVER 曲別手動入力（Issue #46 受け入れ基準）", () => {
  it("生成プロファイルが検証を通る", () => {
    if (!validation.ok) {
      throw new Error(`検証に失敗した:\n${validation.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`);
    }
    expect(validation.ok).toBe(true);
  });

  it("達成基準2の手動逓減区間: diversityZones が3件・役割が主題変奏回帰の順・境界が3サビ区間に一致", () => {
    const chorus = songmap.segments
      .filter((s) => s.isChorus)
      .slice()
      .sort((a, b) => a.startTime - b.startTime);
    expect(chorus).toHaveLength(3);
    expect(profile.diversityZones).toHaveLength(3);
    expect(profile.diversityZones.map((z) => z.role)).toEqual(["theme", "variation", "reprise"]);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(profile.diversityZones[i].startTimeMs - chorus[i].startTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
      expect(Math.abs(profile.diversityZones[i].endTimeMs - chorus[i].endTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
    }
  });

  it("無和音区間の埋め方の上書き: 和音索引24の無和音区間が調の主和音 Fm に解決する", () => {
    // songmap の和音索引24は無和音「N」で、上書き { 24: \"scale\" } によりファ短調の主和音 Fm へ解決する。
    // 生成プロファイルのスロットは和音区間と1対1で対応するため、索引24のスロットの和音名が Fm であることを確かめる。
    expect(profile.chords[24].name).toBe("N");
    expect(profile.slots[24].chordName).toBe("Fm");
  });

  it("達成基準3: カメラ軌跡上速度が全区間で正である", () => {
    // 採取時刻を軌跡の時刻範囲に収める理由を先に述べる。speedAt は前後1ミリ秒の差分を範囲端でクランプして算出し、
    // 範囲外の時刻を渡すと差分の幅が0になり軌跡上速度が偽の0になる。よって採取時刻を [startTimeMs, endTimeMs] に収める。
    // 刻み16ミリ秒の理由を先に述べる。毎秒60フレームの1フレームが約16ミリ秒で、表示が見せうる最小間隔に合わせると
    // 停止区間を見逃さない。各キーフレーム時刻の直前直後1ミリ秒を加える理由を先に述べる。重心式スプラインは制御点の
    // 近くで速度が小さくなりやすく、一様格子だけでは制御点近傍の瞬間的な停止を踏み越える恐れがある。
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
    // 末尾時刻が曲長に一致することを固定する理由を先に述べる。カメラ軌跡は曲頭から曲末まで張るため、末尾キーフレーム
    // 時刻は曲長に等しいのが正しい。これを固定すると公開している曲長定数と生成プロファイルの曲長が将来乖離した場合に
    // 検出でき、全ノーツが軌跡の時刻範囲に収まることも併せて保証できる。
    const cameraEndMs = profile.camera[profile.camera.length - 1].timeMs;
    expect(cameraEndMs).toBe(profile.song.durationMs);
    expect(cameraEndMs).toBe(TAKEOVER_DURATION_MS);
    expect(takeoverCameraKeyframes).toHaveLength(6);
    const maxNoteTimeMs = Math.max(...profile.notes.map((n) => n.timeMs));
    expect(cameraEndMs).toBeGreaterThanOrEqual(maxNoteTimeMs);
  });
});
