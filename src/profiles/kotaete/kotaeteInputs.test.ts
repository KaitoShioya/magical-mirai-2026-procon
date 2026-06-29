import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { kotaeteCameraKeyframes, kotaeteInputs, KOTAETE_DURATION_MS } from "./kotaeteInputs";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { SONGS } from "../../config/songs";

// 実データ（「こたえて」の音楽地図ダンプ）を素のデータファイルとして読む。手設計のカメラ軌跡と曲別手動入力が、
// 受け入れ基準（カメラ軌跡上速度・多様性逓減区間・無和音区間の解決・曲長一致）を満たすことを固定する。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/kotaete.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap & {
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
};

const TIME_TOLERANCE_MS = 1;

const kotaeteSong = SONGS.find((s) => s.key === "kotaete");
if (kotaeteSong === undefined) {
  throw new Error("ロード設定 SONGS に kotaete が存在しない");
}
const source = { songKey: kotaeteSong.key, songUrl: kotaeteSong.songUrl, video: kotaeteSong.video };
const { profile, validation } = buildProfile({ songmap, manual: kotaeteInputs, source });

describe("こたえて 曲別手動入力（横展開 受け入れ基準）", () => {
  it("生成プロファイルが検証を通る", () => {
    if (!validation.ok) {
      throw new Error(`検証に失敗した:\n${validation.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`);
    }
    expect(validation.ok).toBe(true);
  });

  it("自動抽出された逓減区間: diversityZones がサビ区間数と一致し、役割が先頭=主題・末尾=回帰・中間=変奏で、境界がサビ区間に一致", () => {
    const chorus = songmap.segments
      .filter((s) => s.isChorus)
      .slice()
      .sort((a, b) => a.startTime - b.startTime);
    expect(profile.diversityZones).toHaveLength(chorus.length);
    // 役割は時刻順で先頭=theme・末尾=reprise・中間=variation。
    const expectedRoles = chorus.map((_, i) =>
      i === 0 ? "theme" : i === chorus.length - 1 ? "reprise" : "variation",
    );
    expect(profile.diversityZones.map((z) => z.role)).toEqual(expectedRoles);
    for (let i = 0; i < chorus.length; i++) {
      expect(Math.abs(profile.diversityZones[i].startTimeMs - chorus[i].startTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
      expect(Math.abs(profile.diversityZones[i].endTimeMs - chorus[i].endTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
    }
    // 曲固有のラベル上書きは設けていないため、各区間に空でない汎用ラベルが付く。
    for (const zone of profile.diversityZones) {
      expect(zone.label.length).toBeGreaterThan(0);
    }
  });

  it("無和音区間が解決される: 全スロットの和音名が無和音「N」でない", () => {
    // 無和音「N」区間は調（ト長調）の音階または直前和音へ解決されるため、スロットの和音名に「N」は残らない。
    // 上書きを設けず既定規則で解決することを、解決後のスロット和音名から確かめる。
    expect(profile.slots.length).toBeGreaterThan(0);
    for (const slot of profile.slots) {
      expect(slot.chordName).not.toBe("N");
    }
  });

  it("カメラ軌跡上速度が全区間で正である（手設計の停止区間が無い）", () => {
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
    const cameraEndMs = profile.camera[profile.camera.length - 1].timeMs;
    expect(cameraEndMs).toBe(profile.song.durationMs);
    expect(cameraEndMs).toBe(KOTAETE_DURATION_MS);
    expect(kotaeteCameraKeyframes).toHaveLength(6);
    // ノーツ非空を先に表明する理由を先に述べる。Math.max は空配列で -Infinity を返し、その場合 cameraEndMs との比較が
    // 恒真化してノーツ空への退行を見逃す。非空を固定して比較を意味あるものにする。
    expect(profile.notes.length).toBeGreaterThan(0);
    const maxNoteTimeMs = Math.max(...profile.notes.map((n) => n.timeMs));
    expect(cameraEndMs).toBeGreaterThanOrEqual(maxNoteTimeMs);
  });
});
