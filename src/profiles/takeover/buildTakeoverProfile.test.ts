import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildTakeoverProfile, type TakeoverSongmap } from "./buildTakeoverProfile";
import { validateProfile } from "../schema/validateProfile";
import { buildSafeConsonanceIntervals } from "../generate/chordToneSlots";
import { parseChordSymbol, CHORD_PITCH_BASE_C_MIDI } from "../../utils/chordPitch";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。これは Issue #45 の生成スクリプトが行う
// 変換と同じ位置で、本テストは組み立て結果が検証器と各受け入れ基準を満たすことを固定する。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as TakeoverSongmap;

const profileJsonPath = fileURLToPath(new URL("./takeover.profile.json", import.meta.url));

const SEMITONES_PER_OCTAVE = 12;
const VALID_PATTERNS = new Set(["ascending", "descending", "sameTone"]);
const EXPECTED_RESOLVED_NC_NAMES = ["Fm", "Eb", "Fm", "Eb", "Fm", "Fm"];

const profile = buildTakeoverProfile(songmap);

describe("TAKEOVER曲プロファイル組み立て（Issue #46 受け入れ基準）", () => {
  it("達成基準1: validateProfile を例外なく通過する", () => {
    const result = validateProfile(profile);
    if (!result.ok) {
      throw new Error(`検証に失敗した:\n${result.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`);
    }
    expect(result.ok).toBe(true);
  });

  it("スロットは全210区間で和音区間と1対1・境界一致、無和音区間は解決名・非無和音区間は和音名", () => {
    expect(profile.slots).toHaveLength(profile.chords.length);
    expect(profile.slots).toHaveLength(210);
    const resolvedNcNames: string[] = [];
    for (let i = 0; i < profile.chords.length; i++) {
      const chord = profile.chords[i];
      const slot = profile.slots[i];
      expect(slot.startTimeMs).toBe(chord.startTimeMs);
      expect(slot.endTimeMs).toBe(chord.endTimeMs);
      if (chord.name === "N") {
        expect(slot.chordName).not.toBe("N");
        resolvedNcNames.push(slot.chordName);
      } else {
        expect(slot.chordName).toBe(chord.name);
      }
    }
    expect(resolvedNcNames).toEqual(EXPECTED_RESOLVED_NC_NAMES);
  });

  it("達成基準2の協和: 全210区間の全スロット音高が安全協和音高クラス集合に属する", () => {
    for (const region of profile.slots) {
      expect(region.pitches).toHaveLength(7);
      const parsed = parseChordSymbol(region.chordName);
      const safePitchClasses = new Set(
        buildSafeConsonanceIntervals(parsed.quality).map((iv) => iv % SEMITONES_PER_OCTAVE),
      );
      const rootMidi = CHORD_PITCH_BASE_C_MIDI + parsed.rootPitchClass;
      for (const pitch of region.pitches) {
        const relativePitchClass =
          (((pitch - rootMidi) % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
        expect(safePitchClasses.has(relativePitchClass)).toBe(true);
      }
    }
  });

  it("ノーツは434個で、各 slotIndex は1以上7以下・pattern は3種・id は一意・位置は有限", () => {
    expect(profile.notes).toHaveLength(434);
    const ids = new Set<string>();
    for (const note of profile.notes) {
      expect(note.slotIndex).toBeGreaterThanOrEqual(1);
      expect(note.slotIndex).toBeLessThanOrEqual(7);
      expect(VALID_PATTERNS.has(note.pattern)).toBe(true);
      expect(Number.isFinite(note.trajectoryPosition.x)).toBe(true);
      expect(Number.isFinite(note.trajectoryPosition.y)).toBe(true);
      expect(Number.isFinite(note.trajectoryPosition.z)).toBe(true);
      ids.add(note.id);
    }
    expect(ids.size).toBe(profile.notes.length);
  });

  it("見せ場は6個で、最終見せ場（isClimax）はちょうど1個・その重みが1.0", () => {
    expect(profile.showcases).toHaveLength(6);
    const climaxes = profile.showcases.filter((s) => s.isClimax);
    expect(climaxes).toHaveLength(1);
    expect(climaxes[0].weight).toBe(1.0);
  });

  it("達成基準2の手動逓減区間: diversityZones が3件・役割が主題変奏回帰の順・境界が3サビ区間に一致", () => {
    const chorus = profile.repetitiveSegments
      .filter((s) => s.isChorus)
      .slice()
      .sort((a, b) => a.startTimeMs - b.startTimeMs);
    expect(profile.repetitiveSegments.every((s) => s.isChorus)).toBe(true);
    expect(chorus).toHaveLength(3);
    expect(profile.diversityZones).toHaveLength(3);
    expect(profile.diversityZones.map((z) => z.role)).toEqual(["theme", "variation", "reprise"]);
    for (let i = 0; i < 3; i++) {
      expect(profile.diversityZones[i].startTimeMs).toBe(chorus[i].startTimeMs);
      expect(profile.diversityZones[i].endTimeMs).toBe(chorus[i].endTimeMs);
    }
  });

  it("タップ上限は母数434・上限260", () => {
    expect(profile.tapBudget).toEqual({ fullPossible: 434, limit: 260 });
  });

  it("達成基準3: カメラ軌跡上速度が全区間で正である", () => {
    // 採取時刻を軌跡の時刻範囲に収める理由を先に述べる。speedAt は前後1ミリ秒の差分を範囲端でクランプして
    // 算出し、範囲外の時刻を渡すと差分の幅が0になり軌跡上速度が偽の0になる。よって採取時刻を [startTimeMs, endTimeMs]
    // に収める。刻み16ミリ秒の理由を先に述べる。毎秒60フレームの1フレームが約16ミリ秒で、表示が見せうる最小間隔に
    // 合わせると停止区間を見逃さない。各キーフレーム時刻の直前直後1ミリ秒を加える理由を先に述べる。重心式スプラインは
    // 制御点の近くで速度が小さくなりやすく、一様格子だけでは制御点近傍の瞬間的な停止を踏み越える恐れがある。
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

  it("カメラ末尾時刻が曲長に一致し、かつノーツ最大時刻以上である（全ノーツが軌跡範囲内）", () => {
    const maxNoteTimeMs = Math.max(...profile.notes.map((n) => n.timeMs));
    const cameraEndMs = profile.camera[profile.camera.length - 1].timeMs;
    // 末尾時刻が曲長に一致することを固定する理由を先に述べる。カメラ軌跡は曲頭から曲末まで張るため、末尾
    // キーフレーム時刻は曲長に等しいのが正しい。これを固定すると、カメラ由来の曲長定数と曲プロファイルの曲長が
    // 将来乖離した場合に検出でき、全ノーツが軌跡の時刻範囲に収まることも併せて保証できる。
    expect(cameraEndMs).toBe(profile.song.durationMs);
    expect(cameraEndMs).toBeGreaterThanOrEqual(maxNoteTimeMs);
  });

  it("コミット済み takeover.profile.json が組み立て結果と一致する（存在する場合のみ）", () => {
    // 比較を存在検査で囲む理由を先に述べる。成果物JSONを書き出すのは生成テストだけで、まだ生成していない
    // クリーンな取得状態では成果物が存在しない。この状態でファイル読込により本テストが失敗するのを避け、
    // 生成後（コミット後）は同期の保証として機能させる。比較は同一の組み立て結果を直列化した文字列で行い、
    // 空白差を除き値と順序の食い違いだけを検出する。
    if (!existsSync(profileJsonPath)) {
      return;
    }
    const committed = JSON.stringify(JSON.parse(readFileSync(profileJsonPath, "utf8")));
    const built = JSON.stringify(profile);
    expect(built).toBe(committed);
  });
});
