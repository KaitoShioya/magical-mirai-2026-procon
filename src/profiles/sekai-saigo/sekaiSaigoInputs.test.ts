import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  sekaiSaigoCameraKeyframes,
  sekaiSaigoInputs,
  SEKAI_SAIGO_DURATION_MS,
} from "./sekaiSaigoInputs";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { SONGS } from "../../config/songs";

// 実データ（世界最後の音楽隊の音楽地図ダンプ）を素のデータファイルとして読む。曲別手動入力に与えた実値が、
// 生成の検証・カメラ軌跡上速度・多様性逓減区間の自動抽出・無和音区間の解決を満たすことを固定する
//（TAKEOVER の takeoverInputs.test.ts、トリツクロジーの toritsukuLogyInputs.test.ts と同形）。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/sekai-saigo.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap & {
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
};

const TIME_TOLERANCE_MS = 1;

const sekaiSaigoSong = SONGS.find((s) => s.key === "sekai-saigo");
if (sekaiSaigoSong === undefined) {
  throw new Error("ロード設定 SONGS に sekai-saigo が存在しない");
}
const source = {
  songKey: sekaiSaigoSong.key,
  songUrl: sekaiSaigoSong.songUrl,
  video: sekaiSaigoSong.video,
};
const { profile, validation } = buildProfile({ songmap, manual: sekaiSaigoInputs, source });

describe("世界最後の音楽隊 曲別手動入力（横展開 Issue #89）", () => {
  it("生成プロファイルが検証を通る", () => {
    if (!validation.ok) {
      throw new Error(`検証に失敗した:\n${validation.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`);
    }
    expect(validation.ok).toBe(true);
  });

  it("musicalKey が ト長調（主音7・長調）である", () => {
    expect(profile.musicalKey).toEqual({ tonicPitchClass: 7, mode: "major" });
  });

  it("自動抽出された逓減区間: diversityZones が2件・役割が主題回帰の順・境界が2サビ区間に一致", () => {
    const chorus = songmap.segments
      .filter((s) => s.isChorus)
      .slice()
      .sort((a, b) => a.startTime - b.startTime);
    expect(chorus).toHaveLength(2);
    expect(profile.diversityZones).toHaveLength(2);
    // サビが2区間のため、役割は先頭=主題・末尾=回帰になる（中間の変奏は無い）。
    expect(profile.diversityZones.map((z) => z.role)).toEqual(["theme", "reprise"]);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(profile.diversityZones[i].startTimeMs - chorus[i].startTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
      expect(Math.abs(profile.diversityZones[i].endTimeMs - chorus[i].endTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
    }
  });

  it("ラベル未指定のため diversityZones に汎用ラベルが付く", () => {
    expect(profile.diversityZones.map((z) => z.label)).toEqual([
      "第1反復区間（主題）",
      "第2反復区間（回帰）",
    ]);
  });

  it("無和音区間は既定規則で解決する: 曲頭の1区間だけが調の音階・残りは直前和音を保持", () => {
    // 根拠を先に述べる。musicalKey は無和音区間を音階で埋めるときだけ使われる。本曲は無和音区間が8個あり、曲頭の
    // 索引0（直前和音が無い）だけが「調の音階（ト長調）」へ倒れ、残り7区間は直前に実在和音が隣接するため「直前和音を
    // 保持」に倒れる。これを固定することで、単一の musicalKey を ト長調にしても後半の ヘ長調転調と矛盾しないことを保証する。
    const scale = profile.ncRanges.filter((r) => r.treatment === "scale");
    const previous = profile.ncRanges.filter((r) => r.treatment === "previous");
    expect(profile.ncRanges).toHaveLength(8);
    expect(scale).toHaveLength(1);
    expect(previous).toHaveLength(7);
    // 調の音階で埋めるのは曲頭の区間（開始時刻0）だけである。
    expect(scale[0].startTimeMs).toBe(0);
  });

  it("カメラ軌跡上速度が全区間で正である", () => {
    // 採取時刻を軌跡の時刻範囲に収める。範囲外は差分の幅が0になり軌跡上速度が偽の0になるため。刻み16ミリ秒は
    // 毎秒60フレームの1フレーム相当で、停止区間を見逃さない最小間隔。各キーフレーム時刻の直前直後1ミリ秒も採取し、
    // 重心式スプラインが制御点近傍で速度を落とす瞬間的な停止を踏み越えないようにする（takeoverInputs.test.ts と同手順）。
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
    expect(cameraEndMs).toBe(SEKAI_SAIGO_DURATION_MS);
    expect(sekaiSaigoCameraKeyframes).toHaveLength(6);
    const maxNoteTimeMs = Math.max(...profile.notes.map((n) => n.timeMs));
    expect(cameraEndMs).toBeGreaterThanOrEqual(maxNoteTimeMs);
  });
});
