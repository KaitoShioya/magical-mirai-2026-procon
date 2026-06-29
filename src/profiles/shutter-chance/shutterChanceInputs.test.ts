import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  shutterChanceCameraKeyframes,
  shutterChanceInputs,
  SHUTTER_CHANCE_DURATION_MS,
} from "./shutterChanceInputs";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";
import { buildProfile } from "../generate/buildProfile";
import { type RawSongmap } from "../generate/songmapAdapters";
import { SONGS } from "../../config/songs";

// 実データ（シャッターチャンスの音楽地図ダンプ）を素のデータファイルとして読む。shutterChanceInputs に与えた実値が、
// 受け入れ基準（多様性逓減区間・無和音解決・カメラ軌跡上速度・曲長一致）を満たすことを固定する（Issue #88）。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/shutter-chance.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap & {
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
};

// 1ミリ秒の許容で時刻一致を見る。理由を先に述べる。区間境界は songmap 由来の浮動小数点で、生成側も同じ値を写すため
// 厳密一致が期待できるが、浮動小数点の表現差を吸収する最小限の許容として1ミリ秒を採る。
const TIME_TOLERANCE_MS = 1;

const shutterChanceSong = SONGS.find((s) => s.key === "shutter-chance");
if (shutterChanceSong === undefined) {
  throw new Error("ロード設定 SONGS に shutter-chance が存在しない");
}
const source = {
  songKey: shutterChanceSong.key,
  songUrl: shutterChanceSong.songUrl,
  video: shutterChanceSong.video,
};
const { profile, validation } = buildProfile({ songmap, manual: shutterChanceInputs, source });

describe("シャッターチャンス 曲別手動入力（Issue #88 受け入れ基準）", () => {
  it("生成プロファイルが検証を通る", () => {
    if (!validation.ok) {
      throw new Error(`検証に失敗した:\n${validation.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`);
    }
    expect(validation.ok).toBe(true);
  });

  it("自動抽出された逓減区間: diversityZones が10件・役割が主題変奏回帰の順・境界が10サビ区間に一致", () => {
    const chorus = songmap.segments
      .filter((s) => s.isChorus)
      .slice()
      .sort((a, b) => a.startTime - b.startTime);
    expect(chorus).toHaveLength(10);
    expect(profile.diversityZones).toHaveLength(10);
    // 先頭=主題、末尾=回帰、中間8区間=変奏。
    const expectedRoles = ["theme", ...Array(8).fill("variation"), "reprise"];
    expect(profile.diversityZones.map((z) => z.role)).toEqual(expectedRoles);
    for (let i = 0; i < 10; i++) {
      expect(Math.abs(profile.diversityZones[i].startTimeMs - chorus[i].startTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
      expect(Math.abs(profile.diversityZones[i].endTimeMs - chorus[i].endTime)).toBeLessThanOrEqual(
        TIME_TOLERANCE_MS,
      );
    }
  });

  it("逓減区間のラベル: 曲別文言を与えないため汎用ラベルが付く", () => {
    // shutterChanceInputs は diversityZoneLabels を与えないため、生成側が「第N反復区間（役割）」を付ける。
    expect(profile.diversityZones.map((z) => z.label)).toEqual([
      "第1反復区間（主題）",
      "第2反復区間（変奏）",
      "第3反復区間（変奏）",
      "第4反復区間（変奏）",
      "第5反復区間（変奏）",
      "第6反復区間（変奏）",
      "第7反復区間（変奏）",
      "第8反復区間（変奏）",
      "第9反復区間（変奏）",
      "第10反復区間（回帰）",
    ]);
  });

  it("無和音区間の解決: 曲頭の無和音区間（和音索引0）が調の主和音 Gm へ解決する", () => {
    // songmap の和音索引0は無和音「N」で、既定規則（曲頭は調の音階）によりト短調の主和音 Gm へ解決する。
    // 生成プロファイルのスロットは和音区間と1対1で対応するため、索引0のスロットの和音名が Gm であることを確かめる。
    expect(profile.chords[0].name).toBe("N");
    expect(profile.slots[0].chordName).toBe("Gm");
  });

  it("拡張和音の対応: 減三和音 Edim と二度保留和音 Dsus2(b9) がスロットを持つ", () => {
    // 拡張和音（dim・sus2）はシャッターチャンスで初出。床の整合のため正式な品質として音高化される。
    const dimIndex = profile.chords.findIndex((c) => c.name === "Edim");
    const susIndex = profile.chords.findIndex((c) => c.name.startsWith("Dsus2"));
    expect(dimIndex).toBeGreaterThanOrEqual(0);
    expect(susIndex).toBeGreaterThanOrEqual(0);
    // スロット数は既定の7。MIDIノート番号は昇順。
    for (const idx of [dimIndex, susIndex]) {
      const pitches = profile.slots[idx].pitches;
      expect(pitches).toHaveLength(7);
      for (let k = 1; k < pitches.length; k++) {
        expect(pitches[k]).toBeGreaterThan(pitches[k - 1]);
      }
    }
  });

  it("カメラ軌跡上速度が全区間で正である", () => {
    // 採取時刻を軌跡の時刻範囲に収める理由を先に述べる。speedAt は前後1ミリ秒の差分を範囲端でクランプして算出し、
    // 範囲外の時刻を渡すと差分の幅が0になり軌跡上速度が偽の0になる。よって採取時刻を [startTimeMs, endTimeMs] に収める。
    // 刻み16ミリ秒の理由を先に述べる。毎秒60フレームの1フレームが約16ミリ秒で、表示が見せうる最小間隔に合わせると
    // 停止区間を見逃さない。各キーフレーム時刻の直前直後1ミリ秒も加え、制御点近傍の瞬間的な停止を捉える。
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
    expect(cameraEndMs).toBe(SHUTTER_CHANCE_DURATION_MS);
    expect(shutterChanceCameraKeyframes).toHaveLength(6);
    const maxNoteTimeMs = Math.max(...profile.notes.map((n) => n.timeMs));
    expect(cameraEndMs).toBeGreaterThanOrEqual(maxNoteTimeMs);
  });

  it("タップ総数上限が一回性の比率（母数の0.4以上0.8以下）に収まる", () => {
    // 一回性: 上限は母数未満で、ポートフォリオの戦略が成り立つ比率に収める（docs/decisions/app-overall-decisions.md §3.7）。
    const { fullPossible, limit } = profile.tapBudget;
    expect(limit).toBeLessThan(fullPossible);
    const ratio = limit / fullPossible;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.8);
  });
});
