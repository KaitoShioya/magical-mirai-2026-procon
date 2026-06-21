import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateOnsetNotes, type OnsetInput } from "./onsetNotes";
import { toOnsetInput, type RawSongmap } from "./songmapAdapters";
import { validateProfile } from "../schema/validateProfile";
import { minimalValidProfile } from "../schema/fixtures/minimalValidProfile";
import type { Note, SongProfile } from "../schema/profileSchema";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない
// （profiles から tools への依存禁止に抵触しない）。songmap → 各入力への変換は共有アダプタ songmapAdapters を使い、
// 生成本体（#45 の buildProfile）と同じ変換でテストする。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

describe("オンセット選択・ノーツ生成 実データ検証（Issue #38 受け入れ基準）", () => {
  const input = toOnsetInput(songmap);
  const notes = generateOnsetNotes(input);
  const chorusNotes = notes.filter((n) => n.sectionKind === "chorus");
  const nonChorusNotes = notes.filter((n) => n.sectionKind === "nonChorus");

  it("達成基準1: 総数434・サビ192・サビ以外242（厳密一致）", () => {
    // 出典 docs/research/07-feasibility-and-parameters.md §2.1。676拍に対しサビ3区間192拍を毎拍、
    // サビ以外484拍を2拍に1回で合計434（サビ192・サビ以外242）。
    expect(notes).toHaveLength(434);
    expect(chorusNotes).toHaveLength(192);
    expect(nonChorusNotes).toHaveLength(242);
  });

  it("達成基準2: サビ密度がサビ以外密度のおよそ2倍（比2の前後10パーセント以内）", () => {
    const chorusSegments = input.chorusSegments;

    // 密度を区間長から求める前に、サビ区間が互いに重複しないことを確認する。
    // 先に確認する理由を述べる。サビの総時間をサビ区間長の単純合計で求める計算は、区間が互いに重ならないことを
    // 前提とするため、前提が崩れていないことを先に検証して分母の二重計上を防ぐ。
    const sorted = [...chorusSegments].sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startMs).toBeGreaterThanOrEqual(sorted[i - 1].endMs);
    }

    const chorusDurationMs = chorusSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
    const nonChorusDurationMs = songmap.song.duration - chorusDurationMs;
    // 密度＝ノーツ数÷時間（秒）。比を取るので秒への換算係数は約分され、ミリ秒のまま比を計算しても等しい。
    const chorusDensity = chorusNotes.length / chorusDurationMs;
    const nonChorusDensity = nonChorusNotes.length / nonChorusDurationMs;
    const ratio = chorusDensity / nonChorusDensity;

    // 許容差10パーセントの理由を先に述べる。毎秒あたり密度は1拍あたり密度を拍の長さで割った値であり、
    // TAKEOVERの拍の長さは厳密には一定でなく（先頭拍376ミリ秒、以降約343ミリ秒）、サビ区間の端と拍の境界も
    // 完全には一致しないため、比はちょうど2から僅かに揺れる。この揺れを吸収する本検査専用の許容差を10パーセントとする。
    expect(ratio).toBeGreaterThanOrEqual(2 * 0.9);
    expect(ratio).toBeLessThanOrEqual(2 * 1.1);
  });

  it("達成基準2の補足: サビ内の隣接ノーツ間隔がサビ以外の約半分（局所的にサビとAメロが区別できる）", () => {
    // 受け入れ基準「サビとAメロが区別できる」を局所的に示す。
    // 隣接ノーツ間隔を使う理由を先に述べる。間隔は密度の逆数であり、サビ（毎拍）とAメロを含むサビ以外（2拍に1回）が
    // 隣り合って区別できることを、総量の比ではなく局所の値で直接示せるためである。
    // 同じ種別が連続する隣接ノーツ対のみの間隔を集める。種別境界をまたぐ対を除外する理由は、密度の出所が混ざり
    // 局所の代表値を歪めるためである。
    const chorusGaps: number[] = [];
    const nonChorusGaps: number[] = [];
    for (let i = 1; i < notes.length; i++) {
      const prev = notes[i - 1];
      const cur = notes[i];
      if (prev.sectionKind !== cur.sectionKind) continue;
      const gapMs = cur.timeMs - prev.timeMs;
      (cur.sectionKind === "chorus" ? chorusGaps : nonChorusGaps).push(gapMs);
    }

    // 中央値を使う理由を先に述べる。サビ区間の境界やテンポの微小変動による外れ値の影響を受けにくく、
    // 代表的な間隔を表すためである。
    const median = (xs: number[]): number => {
      const sorted = [...xs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const ratio = median(nonChorusGaps) / median(chorusGaps);

    // サビ以外の間隔はサビの約2倍（2拍に1回を毎拍で割った値）。許容差10パーセントの理由は達成基準2と同じで、
    // 拍の長さが厳密には一定でないことによる揺れを吸収するためである。
    expect(ratio).toBeGreaterThanOrEqual(2 * 0.9);
    expect(ratio).toBeLessThanOrEqual(2 * 1.1);
  });

  it("達成基準3: 全ノーツの時刻が曲の範囲内、拍索引が有効、識別子が一意（validateProfileのノーツ規則に対応）", () => {
    const ids = new Set<string>();
    for (const n of notes) {
      expect(n.timeMs).toBeGreaterThanOrEqual(0);
      expect(n.timeMs).toBeLessThanOrEqual(songmap.song.duration);
      expect(Number.isInteger(n.beatIndex)).toBe(true);
      expect(n.beatIndex).toBeGreaterThanOrEqual(0);
      expect(n.beatIndex).toBeLessThan(songmap.beats.length);
      expect(ids.has(n.id)).toBe(false);
      ids.add(n.id);
    }
  });
});

describe("オンセット選択・ノーツ生成 スキーマ適合（Issue #38）", () => {
  it("中間ノーツに後段の項目を補うと、validateProfile のノーツ検査を通る最終ノーツになる", () => {
    // 後段（#39・#40）が付与する項目を仮値で補い、最終 Note を作る。
    // 仮 slotIndex を1にする理由を先に述べる。スキーマがスロット索引を1以上スロット数以下と定めるため、
    // 有効範囲の下限である1を用いる。pattern は #39、trajectoryPosition は #40 が後段で確定する。
    const input: OnsetInput = {
      beats: minimalValidProfile.beats.map((b) => ({ index: b.index, startTimeMs: b.startTimeMs })),
      chorusSegments: minimalValidProfile.repetitiveSegments
        .filter((s) => s.isChorus)
        .map((s) => ({ startMs: s.startTimeMs, endMs: s.endTimeMs })),
    };
    const completed: Note[] = generateOnsetNotes(input).map((n) => ({
      id: n.id,
      timeMs: n.timeMs,
      beatIndex: n.beatIndex,
      slotIndex: 1,
      pattern: "single",
      trajectoryPosition: { x: 0, y: 0, z: 0 },
    }));
    expect(completed.length).toBeGreaterThan(0);

    const profile = structuredClone(minimalValidProfile) as SongProfile;
    profile.notes = completed;
    const result = validateProfile(profile);
    expect(result.ok).toBe(true);
  });
});
