// 表示同期ゲート（Issue #99）の判定ロジックの単体テスト。
// 系統1（evaluateDisplaySync）は記録源を知らずに時刻列だけで判定する契約を、手で組んだ記録だけで検証する
// （既定の記録源アダプタ buildDefaultDisplaySyncInput を一切呼ばない＝分離の担保）。
// 系統2（buildDefaultDisplaySyncInput）は実 TAKEOVER データで統合確認する。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  evaluateDisplaySync,
  buildDefaultDisplaySyncInput,
  runDefaultDisplaySyncGate,
  applySourceIssues,
  extractLoudnessPeaksMs,
  DEFAULT_THRESHOLDS,
} from "./displaySyncGate";
import type { MusicalAnchors, DisplaySyncRecord, SongmapLike } from "./displaySyncGate";

/** 一定間隔のビート時刻列を作る。 */
function makeBeats(intervalMs: number, count: number): number[] {
  const beats: number[] = [];
  for (let i = 0; i < count; i += 1) {
    beats.push(i * intervalMs);
  }
  return beats;
}

/** 0以上1未満の決定的な擬似乱数（小数部を取り出す）。 */
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

// 共通の合成アンカー。ビートは100ミリ秒間隔、曲長10000ミリ秒。
const BEATS = makeBeats(100, 101); // 0,100,...,10000
const SONG_END = 10000;
const ANCHORS: MusicalAnchors = {
  beatsMs: BEATS,
  structureBoundariesMs: [0, 2000, 4000, 6000, 8000, 10000],
  loudnessPeaksMs: [2000, 5000, 8000],
  vocalOnsetsMs: [1000, 3000, 5000, 7000, 9000],
};

/** 2拍ごと（200ミリ秒ごと）の発火時刻列。曲全体を覆う。 */
function everyTwoBeatFires(): number[] {
  const fires: number[] = [];
  for (let t = 0; t <= 10000; t += 200) {
    fires.push(t);
  }
  return fires;
}

describe("evaluateDisplaySync（記録源を知らずに時刻列だけで判定する）", () => {
  it("正常な記録は合格し、ビート一致率と接地率が高い", () => {
    const record: DisplaySyncRecord = {
      switchTimesMs: [2000, 4000, 6000, 8000],
      fireTimesMs: everyTwoBeatFires(),
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    expect(verdict.acceptable).toBe(true);
    expect(verdict.reasons).toEqual([]);
    expect(verdict.ratios.fireBeatSync).toBeCloseTo(1, 5);
    expect(verdict.ratios.switchGroundedRatio).toBeCloseTo(1, 5);
    expect(verdict.ratios.fireGroundedRatio).toBeCloseTo(1, 5);
    expect(verdict.ratios.granularityStructureSync).toBeCloseTo(1, 5);
  });

  it("曲の範囲外の時刻があると合格しない（明らかな不正）", () => {
    const record: DisplaySyncRecord = {
      switchTimesMs: [2000, 4000],
      fireTimesMs: [0, 200, SONG_END + 1],
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    expect(verdict.acceptable).toBe(false);
    expect(verdict.cues.fireValidity).toBe(false);
  });

  it("有限でない時刻があると合格しない（明らかな不正）", () => {
    const record: DisplaySyncRecord = {
      switchTimesMs: [2000, 4000],
      fireTimesMs: [0, Number.NaN, 400],
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    expect(verdict.acceptable).toBe(false);
    expect(verdict.cues.fireValidity).toBe(false);
  });

  it("逆順（非単調）の時刻があると合格しない（明らかな不正）", () => {
    const record: DisplaySyncRecord = {
      switchTimesMs: [2000, 4000],
      fireTimesMs: [0, 200, 100],
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    expect(verdict.acceptable).toBe(false);
    expect(verdict.cues.fireValidity).toBe(false);
  });

  it("発火が空だと合格せず、接地率は0になる（無動作を合格にしない）", () => {
    const record: DisplaySyncRecord = {
      switchTimesMs: [2000, 4000],
      fireTimesMs: [],
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    expect(verdict.acceptable).toBe(false);
    expect(verdict.cues.fireNonEmpty).toBe(false);
    expect(verdict.ratios.fireGroundedRatio).toBe(0);
  });

  it("秒とミリ秒の取り違え（曲頭への全圧縮）は時間尺度の被覆で落ちる", () => {
    // 全時刻を約1000分の1へ縮めた記録。最大10ミリ秒は曲長の0.1パーセントで、被覆下限10パーセント未満。
    const record: DisplaySyncRecord = {
      switchTimesMs: [2, 4],
      fireTimesMs: [0, 2, 4, 6, 8, 10],
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    expect(verdict.acceptable).toBe(false);
    expect(verdict.cues.fireCoverage).toBe(false);
    expect(verdict.cues.switchCoverage).toBe(false);
  });

  it("整列済みで曲内の無関係なランダム時刻は合格するが、ビート一致率が下がる（受容済みの限界）", () => {
    const random: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      random.push(Math.round(pseudoRandom(i + 1) * SONG_END));
    }
    random.sort((a, b) => a - b);
    const record: DisplaySyncRecord = {
      switchTimesMs: [2000, 4000, 6000, 8000],
      fireTimesMs: random,
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    // ビートが100ミリ秒間隔・接地許容半拍（50ミリ秒）のため曲内の任意時刻は接地し、合否は通過する。
    expect(verdict.acceptable).toBe(true);
    // 中程度許容（4分の1拍＝25ミリ秒）では裏拍寄りの時刻が外れ、ビート一致率は明確に1未満になる。
    expect(verdict.ratios.fireBeatSync).toBeLessThan(0.85);
    expect(verdict.distances.fireToBeatOrPeak.p95Beats).not.toBeNull();
  });

  it("半拍未満の一定オフセットは合格するが、ビート一致率が著しく下がる（情報で可視化）", () => {
    // ビートに40ミリ秒（0.4拍）の一定オフセット。接地許容（50ミリ秒）内で合格するが中程度許容（25ミリ秒）を超える。
    const record: DisplaySyncRecord = {
      switchTimesMs: [2000, 4000, 6000, 8000],
      fireTimesMs: everyTwoBeatFires().map((t) => t + 40).filter((t) => t <= SONG_END),
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    expect(verdict.acceptable).toBe(true);
    expect(verdict.ratios.fireBeatSync).toBeCloseTo(0, 5);
    expect(verdict.distances.fireToBeatOrPeak.p95Beats ?? 0).toBeGreaterThan(0.25);
  });

  it("件数が極端に少ないと合否は変えずに警告を出す", () => {
    const record: DisplaySyncRecord = {
      switchTimesMs: [5000],
      fireTimesMs: [5000],
    };
    const verdict = evaluateDisplaySync(record, ANCHORS, SONG_END);
    // 1件でも、曲内・単調・被覆・接地を満たせば合否は成立する。件数は警告として出す。
    expect(verdict.acceptable).toBe(true);
    expect(verdict.warnings.some((w) => w.includes("極端に少な"))).toBe(true);
  });
});

describe("extractLoudnessPeaksMs（声量の山）", () => {
  it("曲最大声量の0.5倍以上の局所最大だけをピーク時刻にする", () => {
    // 刻み100ミリ秒。索引2(値10)と索引5(値9)が局所最大。最大声量10の0.5倍=5以上。
    const curve = [0, 4, 10, 3, 2, 9, 1];
    const peaks = extractLoudnessPeaksMs(curve, 100, 10);
    expect(peaks).toEqual([200, 500]);
  });

  it("0.5倍未満の小さな山は除く", () => {
    const curve = [0, 4, 0, 0]; // 索引1(値4)は局所最大だが最大声量10の0.5倍未満。
    const peaks = extractLoudnessPeaksMs(curve, 100, 10);
    expect(peaks).toEqual([]);
  });

  it("連続して等しい頂（プラトー）を1つの山として中央で代表する", () => {
    // 索引2と索引3が値8で連続（直前0・直後0より大、最大声量10の0.5倍=5以上）。中央索引=floor((2+3)/2)=2 → 200ミリ秒。
    const curve = [0, 1, 8, 8, 0, 0];
    const peaks = extractLoudnessPeaksMs(curve, 100, 10);
    expect(peaks).toEqual([200]);
  });
});

describe("applySourceIssues（記録源の出所固有検査を合否へ反映する）", () => {
  const acceptableVerdict = evaluateDisplaySync(
    { switchTimesMs: [2000, 4000, 6000, 8000], fireTimesMs: everyTwoBeatFires() },
    ANCHORS,
    SONG_END
  );

  it("不整合が無ければ合否を変えない", () => {
    expect(acceptableVerdict.acceptable).toBe(true);
    const diagnostic = applySourceIssues(acceptableVerdict, []);
    expect(diagnostic.acceptable).toBe(true);
    expect(diagnostic.sourceIssues).toEqual([]);
  });

  it("不整合があれば合否を不成立にし、理由を加える", () => {
    const diagnostic = applySourceIssues(acceptableVerdict, ["歌詞タイムライン phrases[0]: 何らかの不整合"]);
    expect(diagnostic.acceptable).toBe(false);
    expect(diagnostic.reasons.some((r) => r.includes("既定記録源の整合検査"))).toBe(true);
    expect(diagnostic.sourceIssues.length).toBe(1);
  });
});

describe("buildDefaultDisplaySyncInput（既定の記録源アダプタ・実 TAKEOVER データ）", () => {
  const path = fileURLToPath(
    new URL("../../../../docs/analysis/takeover.songmap.json", import.meta.url)
  );
  const songmap = JSON.parse(readFileSync(path, "utf8")) as SongmapLike;

  it("歌詞・粒度・割付の整合検査を通り、90フレーズ・1157字を取り込む", () => {
    const input = buildDefaultDisplaySyncInput(songmap);
    expect(input.sourceIssues).toEqual([]);
    expect(input.anchors.vocalOnsetsMs.length).toBe(1157);
    expect(input.anchors.beatsMs.length).toBe(songmap.beats.length);
    expect(input.record.switchTimesMs.length).toBeGreaterThan(0);
    expect(input.record.fireTimesMs.length).toBeGreaterThan(0);
  });

  it("既定の記録は合格し、発火のビート一致率が高い", () => {
    const input = buildDefaultDisplaySyncInput(songmap);
    const verdict = evaluateDisplaySync(input.record, input.anchors, input.songEndMs);
    expect(verdict.acceptable).toBe(true);
    // 既定の記録源は発火をビート格子上に展開するため、ビート一致率は高い（既定生成規則の確認）。
    expect(verdict.ratios.fireBeatSync).toBeGreaterThan(0.9);
  });

  it("DEFAULT_THRESHOLDS の被覆下限は曲長の10パーセントである", () => {
    expect(DEFAULT_THRESHOLDS.coverageMinFraction).toBe(0.1);
  });

  it("runDefaultDisplaySyncGate は出所固有の不整合が無く合格する", () => {
    const diagnostic = runDefaultDisplaySyncGate(songmap);
    expect(diagnostic.sourceIssues).toEqual([]);
    expect(diagnostic.acceptable).toBe(true);
  });
});
