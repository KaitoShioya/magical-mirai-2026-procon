import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateOnsetNotes, type OnsetInput } from "./onsetNotes";
import {
  toOnsetInput,
  toDensityBeats,
  toChorusSegments,
  toLyricCharOnsetsMs,
  type RawSongmap,
} from "./songmapAdapters";
import { generateDensityPlan, countTargetNotes, type DensityInput } from "./density";
import { generateShowcases } from "./showcases";
import { DEFAULT_SHOWCASE_OPTIONS } from "./types";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない。
// songmap・密度プラン → オンセット入力への変換は共有アダプタと密度生成を使い、生成本体（buildProfile）と同じ結線でテストする。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

/** buildProfile と同じ手順で密度プランを作り、オンセット入力を組む。 */
function buildOnsetInput(): { input: OnsetInput; effectiveTarget: number } {
  const densityInput: DensityInput = {
    durationMs: songmap.song.duration,
    beats: toDensityBeats(songmap),
    chorusSegments: toChorusSegments(songmap),
    lyricCharOnsetsMs: toLyricCharOnsetsMs(songmap),
    showcases: generateShowcases(
      {
        durationMs: songmap.song.duration,
        amplitudeCurve: songmap.amplitudeCurve,
        amplitudeStepMs: songmap.amplitudeStep,
        lyricCharOnsetsMs: toLyricCharOnsetsMs(songmap),
        chorusSegments: toChorusSegments(songmap),
        beatsMs: songmap.beats.map((b) => b.startTime),
      },
      { climaxAnchorMs: DEFAULT_SHOWCASE_OPTIONS.climaxAnchorMs },
    ),
    climaxAnchorMs: DEFAULT_SHOWCASE_OPTIONS.climaxAnchorMs,
  };
  const plan = generateDensityPlan(densityInput);
  const targets = countTargetNotes(plan);
  const input = toOnsetInput(songmap, {
    regions: plan.regions.map((r) => ({ startMs: r.startMs, endMs: r.endMs, className: r.className })),
    regionTargets: targets.byRegion.map((r) => ({ regionIndex: r.regionIndex, targetNotes: r.targetNotes })),
    selectionSignal: plan.selectionSignal,
  });
  return { input, effectiveTarget: targets.effective };
}

describe("オンセット選択・ノーツ生成 実データ検証（再設計：不満①③）", () => {
  const { input, effectiveTarget } = buildOnsetInput();
  const notes = generateOnsetNotes(input);
  const chorusNotes = notes.filter((n) => n.sectionKind === "chorus");

  it("総数は密度プランの実効目標数（291）と一致し、上限260を上回る（一回性の維持＝基準M）", () => {
    // 再設計後の総数は密度プランの区間別目標数の合計（=countTargetNotes.effective）に一致する。
    // サビ密度0.5・休符0・溜め0.25・基本0.5の累積で 291 になる（旧434から物量を抑え、実機確認で難易度を下げた）。
    expect(notes).toHaveLength(effectiveTarget);
    expect(notes).toHaveLength(291);
    expect(notes.length).toBeGreaterThan(260);
  });

  it("基準N: 同一 beatIndex のノーツが0件（拍の一意性）", () => {
    const seen = new Set<number>();
    let dup = 0;
    for (const n of notes) {
      if (seen.has(n.beatIndex)) dup++;
      seen.add(n.beatIndex);
    }
    expect(dup).toBe(0);
  });

  it("基準D: 休符区間のノーツ密度が基本区間より有意に低い（休符はほぼ0）", () => {
    // 休符区間（rest）と基本区間（base）で、区間内拍に対するノーツの割合を比べる。
    const restRegionIdx = new Set(
      input.regions.map((r, i) => (r.className === "rest" ? i : -1)).filter((i) => i >= 0),
    );
    const baseRegionIdx = new Set(
      input.regions.map((r, i) => (r.className === "base" ? i : -1)).filter((i) => i >= 0),
    );
    const noteBeats = new Set(notes.map((n) => n.beatIndex));
    let restBeats = 0;
    let restNotes = 0;
    let baseBeats = 0;
    let baseNotes = 0;
    for (const b of input.beats) {
      const ri = input.regions.findIndex((r) => b.startTimeMs >= r.startMs && b.startTimeMs < r.endMs);
      if (restRegionIdx.has(ri)) {
        restBeats++;
        if (noteBeats.has(b.index)) restNotes++;
      } else if (baseRegionIdx.has(ri)) {
        baseBeats++;
        if (noteBeats.has(b.index)) baseNotes++;
      }
    }
    const restDensity = restBeats > 0 ? restNotes / restBeats : 0;
    const baseDensity = baseBeats > 0 ? baseNotes / baseBeats : 0;
    expect(restDensity).toBe(0); // 休符は置かない。
    expect(baseDensity).toBeGreaterThan(0);
    expect(restDensity).toBeLessThan(baseDensity);
  });

  it("基準E: 非サビで小節内拍位置の選別パターンが2種以上・単一パターン80パーセント未満", () => {
    // 小節（position=1 で始まる4拍）ごとに、ノーツの立つ拍位置の集合をパターン文字列にして数える。
    const noteBeats = new Set(notes.map((n) => n.beatIndex));
    const chorusSegments = input.chorusSegments;
    const inChorus = (t: number): boolean => chorusSegments.some((s) => t >= s.startMs && t < s.endMs);
    // 小節を組む。
    const bars: { beats: typeof input.beats }[] = [];
    let cur: typeof input.beats = [];
    for (const b of input.beats) {
      if (b.position === 1 && cur.length > 0) {
        bars.push({ beats: cur });
        cur = [];
      }
      cur.push(b);
    }
    if (cur.length > 0) bars.push({ beats: cur });

    const patternCount = new Map<string, number>();
    let nonChorusBarsWithNotes = 0;
    for (const bar of bars) {
      if (bar.beats.length === 0 || inChorus(bar.beats[0].startTimeMs)) continue;
      const pat = bar.beats
        .filter((b) => noteBeats.has(b.index))
        .map((b) => b.position)
        .join(",");
      if (pat === "") continue;
      nonChorusBarsWithNotes++;
      patternCount.set(pat, (patternCount.get(pat) ?? 0) + 1);
    }
    expect(patternCount.size).toBeGreaterThanOrEqual(2);
    const maxShare = Math.max(...patternCount.values()) / nonChorusBarsWithNotes;
    expect(maxShare).toBeLessThan(0.8);
  });

  it("基準F補助: サビ区間内の局所密度が平準化され密のピークが無い（実機確認で密な連続を解消）", () => {
    // 各サビ区間を8拍窓に割り、窓ごとのノーツ数が均一で密のピークが無いことを確認する。
    // 旧実装は強調スコア上位採用でサビ前半に密が偏り約30ノーツの密な連続が生じ、特定区間が高頻度で難しかった
    // （実機目視で判明）。等間隔セグメント選択で局所密度を区間平均（拍あたり0.5＝8拍窓で約4）へ揃える。
    const noteBeats = new Set(notes.map((n) => n.beatIndex));
    for (const seg of input.chorusSegments) {
      const segBeats = input.beats.filter((b) => b.startTimeMs >= seg.startMs && b.startTimeMs < seg.endMs);
      const windows: number[] = [];
      for (let i = 0; i < segBeats.length; i += 8) {
        const w = segBeats.slice(i, i + 8).filter((b) => noteBeats.has(b.index)).length;
        windows.push(w);
      }
      // 密のピークが無い: どの8拍窓も5ノーツ以下（毎拍に近い密な連続が生じない）。
      expect(Math.max(...windows)).toBeLessThanOrEqual(5);
      // 平準化: 窓ごとのノーツ数の最大と最小の差が2以下（区間平均の周辺に揃う）。
      expect(Math.max(...windows) - Math.min(...windows)).toBeLessThanOrEqual(2);
    }
  });

  it("全ノーツの時刻が曲の範囲内、拍索引が有効、識別子が一意", () => {
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

  it("3つのサビ反復が同一の beatOffset 集合を持つ（基準G・多様性逓減の前提）", () => {
    const chorusSegments = [...input.chorusSegments].sort((a, b) => a.startMs - b.startMs);
    const offsetSets = chorusSegments.map((seg) => {
      const cNotes = chorusNotes
        .filter((n) => n.timeMs >= seg.startMs && n.timeMs < seg.endMs)
        .sort((a, b) => a.beatIndex - b.beatIndex);
      const anchor = cNotes[0].beatIndex;
      return cNotes.map((n) => n.beatIndex - anchor).sort((a, b) => a - b);
    });
    expect(offsetSets[1]).toEqual(offsetSets[0]);
    expect(offsetSets[2]).toEqual(offsetSets[0]);
  });
});
