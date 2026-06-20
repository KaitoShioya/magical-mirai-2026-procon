import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildLyricsTimeline } from "../../textalive/lyricsTimeline";
import type { LyricsTimeline } from "../../textalive/lyricsTimeline";
import {
  buildGranularityPlan,
  granularityAt,
  findGranularityPlanIssues,
} from "./granularity";
import type { Granularity, GranularityInput, GranularitySegment } from "./granularity";
import {
  longToneInput,
  middleInput,
  longSparseInput,
  twoPhraseWithGapInput,
  makeBeats,
} from "./fixtures/granularityInput";

// ---- 実データ（TAKEOVERの音楽地図ダンプ）の読み込みと GranularityInput への変換 ----
// 音楽地図ダンプは words・chars の項目名のため、構造型の children へ写してから構築する。

type DumpChar = { startTime: number; endTime: number; text: string };
type DumpWord = { startTime: number; endTime: number; text: string; chars: DumpChar[] };
type DumpPhrase = { startTime: number; endTime: number; text: string; words: DumpWord[] };
type DumpBeat = { startTime: number };
type DumpSegment = { startTime: number; endTime: number };
interface Dump {
  phrases: DumpPhrase[];
  beats: DumpBeat[];
  segments: DumpSegment[];
  amplitudeStep: number;
  amplitudeCurve: number[];
  maxVocalAmplitude: number;
  song: { duration: number };
}

const songmapPath = fileURLToPath(
  new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url)
);
const dump = JSON.parse(readFileSync(songmapPath, "utf8")) as Dump;

function takeoverTimeline(): LyricsTimeline {
  return buildLyricsTimeline({
    phrases: dump.phrases.map((p) => ({
      text: p.text,
      startTime: p.startTime,
      endTime: p.endTime,
      children: p.words.map((w) => ({
        text: w.text,
        startTime: w.startTime,
        endTime: w.endTime,
        children: w.chars.map((c) => ({
          text: c.text,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
      })),
    })),
  });
}

function takeoverInput(): GranularityInput {
  return {
    lyricsTimeline: takeoverTimeline(),
    beatStartTimesMs: dump.beats.map((b) => b.startTime),
    loudnessCurve: {
      stepMs: dump.amplitudeStep,
      values: dump.amplitudeCurve,
      maxAmplitude: dump.maxVocalAmplitude,
    },
    sectionBoundariesMs: dump.segments.map((s) => ({
      startTimeMs: s.startTime,
      endTimeMs: s.endTime,
    })),
    songEndMs: dump.song.duration,
  };
}

/** ある文字列のフレーズ番号を返す（最初の一致）。 */
function phraseIndexByText(timeline: LyricsTimeline, text: string): number {
  const phrase = timeline.phrases.find((p) => p.text === text);
  if (!phrase) {
    throw new Error(`テスト前提のフレーズが見つからない: ${text}`);
  }
  return phrase.phraseIndex;
}

function segmentsOfPhrase(plan: { segments: readonly GranularitySegment[] }, phraseIndex: number): GranularitySegment[] {
  return plan.segments.filter((s) => s.phraseIndex === phraseIndex);
}

describe("buildGranularityPlan: 実データTAKEOVERの構築と被覆", () => {
  it("整合検査が不整合を返さない", () => {
    const input = takeoverInput();
    const plan = buildGranularityPlan(input);
    expect(findGranularityPlanIssues(plan, input)).toEqual([]);
  });

  it("曲頭(0)から曲の終了時刻まで隙間も重複も無く被覆する", () => {
    const input = takeoverInput();
    const plan = buildGranularityPlan(input);
    expect(plan.segments.length).toBeGreaterThan(0);
    expect(plan.segments[0].startTimeMs).toBe(0);
    expect(plan.segments[plan.segments.length - 1].endTimeMs).toBe(input.songEndMs);
    for (let i = 1; i < plan.segments.length; i++) {
      expect(plan.segments[i].startTimeMs).toBe(plan.segments[i - 1].endTimeMs);
      expect(plan.segments[i].endTimeMs).toBeGreaterThan(plan.segments[i].startTimeMs);
    }
  });

  it("すべてのセグメントの粒度が4つの値のいずれかである", () => {
    const plan = buildGranularityPlan(takeoverInput());
    const allowed: ReadonlySet<Granularity> = new Set(["char", "word", "phrase", "fullscreen"]);
    for (const s of plan.segments) {
      expect(allowed.has(s.granularity)).toBe(true);
    }
  });
});

describe("受け入れ基準1: 数拍ごとの切替がビートに乗る", () => {
  it("粒度の切替が多数あり、各切替時刻がビート開始時刻に吸着している", () => {
    const input = takeoverInput();
    const plan = buildGranularityPlan(input);
    const beatSet = new Set(input.beatStartTimesMs);
    // 先頭以外の開始時刻はすべてビートに一致する。
    for (let i = 1; i < plan.segments.length; i++) {
      expect(beatSet.has(plan.segments[i].startTimeMs)).toBe(true);
    }
    // 隣接セグメントで粒度が変わる切替が多数ある（単調でない）。
    let changes = 0;
    for (let i = 1; i < plan.segments.length; i++) {
      if (plan.segments[i].granularity !== plan.segments[i - 1].granularity) {
        changes++;
      }
    }
    expect(changes).toBeGreaterThan(10);
  });
});

describe("受け入れ基準2: 短音間引きと最長ラップ流し込み", () => {
  it("短音優勢かつ高密度の文字粒度セグメントは発火間隔が2拍である", () => {
    const plan = buildGranularityPlan(takeoverInput());
    const shortDense = plan.segments.filter((s) => s.reason === "shortDense");
    expect(shortDense.length).toBeGreaterThan(0);
    for (const s of shortDense) {
      expect(s.granularity).toBe("char");
      expect(s.charCadenceBeats).toBe(2);
    }
  });

  it("短音優勢かつ低密度の文字粒度セグメントは発火間隔が1拍である", () => {
    const plan = buildGranularityPlan(takeoverInput());
    const shortSparse = plan.segments.filter((s) => s.reason === "shortSparse");
    for (const s of shortSparse) {
      expect(s.granularity).toBe("char");
      expect(s.charCadenceBeats).toBe(1);
    }
  });

  it("文字数最多フレーズ（33文字）はフレーズ粒度の流し込み（longDense）になる", () => {
    const input = takeoverInput();
    const plan = buildGranularityPlan(input);
    const idx = phraseIndexByText(
      input.lyricsTimeline,
      "アップ＆ダウンスクランブルランブル加速するエゴは永遠にグランブルー"
    );
    const segs = segmentsOfPhrase(plan, idx);
    expect(segs.length).toBe(1);
    expect(segs[0].granularity).toBe("phrase");
    expect(segs[0].reason).toBe("longDense");
  });
});

describe("継続時間最長フレーズの分類（長音主体ではない）", () => {
  it("「NaNaNaNa」は短音優勢かつ低密度の文字粒度（shortSparse）になる", () => {
    const input = takeoverInput();
    const plan = buildGranularityPlan(input);
    const idx = phraseIndexByText(input.lyricsTimeline, "NaNaNaNa");
    const segs = segmentsOfPhrase(plan, idx);
    expect(segs.length).toBe(1);
    expect(segs[0].granularity).toBe("char");
    expect(segs[0].reason).toBe("shortSparse");
    expect(segs[0].charCadenceBeats).toBe(1);
  });
});

describe("連発（近接反復）の判定", () => {
  it("近接反復するフレーズはフレーズ粒度の repeat になる", () => {
    const input = takeoverInput();
    const plan = buildGranularityPlan(input);
    for (const text of ["ClaptotheBeat", "Noise＆Hits"]) {
      const idx = phraseIndexByText(input.lyricsTimeline, text);
      const segs = segmentsOfPhrase(plan, idx);
      expect(segs.length).toBe(1);
      expect(segs[0].granularity).toBe("phrase");
      expect(segs[0].reason).toBe("repeat");
    }
  });

  it("遠く離れて再登場する重複フレーズは repeat にならない", () => {
    const input = takeoverInput();
    const plan = buildGranularityPlan(input);
    // 「光と影飲み込む鳴り止まぬシグナル」は前後に大きく離れて2回現れる。両出現とも repeat でない。
    const text = "光と影飲み込む鳴り止まぬシグナル";
    const indexes = input.lyricsTimeline.phrases
      .filter((p) => p.text === text)
      .map((p) => p.phraseIndex);
    expect(indexes.length).toBe(2);
    for (const idx of indexes) {
      for (const s of segmentsOfPhrase(plan, idx)) {
        expect(s.reason).not.toBe("repeat");
      }
    }
  });
});

describe("合成入力による各分岐", () => {
  it("長音主体のフレーズはフレーズ粒度の longTone になる", () => {
    const input = longToneInput();
    const plan = buildGranularityPlan(input);
    const segs = segmentsOfPhrase(plan, 0);
    expect(segs.some((s) => s.granularity === "phrase" && s.reason === "longTone")).toBe(true);
  });

  it("中間のフレーズは単語粒度の middle になる", () => {
    const input = middleInput();
    const plan = buildGranularityPlan(input);
    const segs = segmentsOfPhrase(plan, 0);
    expect(segs.length).toBe(1);
    expect(segs[0].granularity).toBe("word");
    expect(segs[0].reason).toBe("middle");
    for (const ref of segs[0].unitRefs) {
      expect(ref.wordIndex).not.toBeUndefined();
      expect(ref.charIndex).toBeUndefined();
    }
  });

  it("長尺かつ低密度のフレーズはフレーズ粒度のチャンク分割（longSparse）になり、チャンク番号が整合する", () => {
    const input = longSparseInput();
    const plan = buildGranularityPlan(input);
    const segs = segmentsOfPhrase(plan, 0);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) {
      expect(s.granularity).toBe("phrase");
      expect(s.reason).toBe("longSparse");
      expect(s.phraseChunk).not.toBeNull();
    }
    const count = segs[0].phraseChunk!.chunkCount;
    expect(segs.length).toBe(count);
    const indexes = segs.map((s) => s.phraseChunk!.chunkIndex).sort((a, b) => a - b);
    expect(indexes).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(findGranularityPlanIssues(plan, input)).toEqual([]);
  });
});

describe("声量集計の刻み幅非依存", () => {
  it("同じ声量を別の刻み幅で表しても長音主体の判定が一致する", () => {
    const base = longToneInput();
    const reasonAt = (input: GranularityInput): string =>
      buildGranularityPlan(input).segments.find((s) => s.phraseIndex === 0)!.reason;
    const coarse: GranularityInput = {
      ...base,
      loudnessCurve: { stepMs: 200, values: new Array(24).fill(100), maxAmplitude: 100 },
    };
    const fine: GranularityInput = {
      ...base,
      loudnessCurve: { stepMs: 50, values: new Array(96).fill(100), maxAmplitude: 100 },
    };
    expect(reasonAt(coarse)).toBe("longTone");
    expect(reasonAt(fine)).toBe("longTone");
  });
});

describe("granularityAt と無音・範囲外", () => {
  it("無音の切れ目では画面全体セグメントを返し、各フレーズ位置では単語粒度を返す", () => {
    const input = twoPhraseWithGapInput();
    const plan = buildGranularityPlan(input);
    // フレーズ間の無音（おおよそ750〜1500の中央）。
    const gap = granularityAt(plan, 1000);
    expect(gap).not.toBeNull();
    expect(gap!.granularity).toBe("fullscreen");
    // 第1フレーズの発声中。
    const first = granularityAt(plan, 200);
    expect(first).not.toBeNull();
    expect(first!.granularity).toBe("word");
  });

  it("曲の範囲外では null を返す", () => {
    const input = twoPhraseWithGapInput();
    const plan = buildGranularityPlan(input);
    expect(granularityAt(plan, -1)).toBeNull();
    expect(granularityAt(plan, input.songEndMs)).toBeNull();
    expect(granularityAt(plan, input.songEndMs + 100)).toBeNull();
  });
});

describe("正規化と決定性", () => {
  it("ビート吸着後に長さゼロ・隙間・重複が無い（合成入力）", () => {
    for (const input of [longToneInput(), middleInput(), longSparseInput(), twoPhraseWithGapInput()]) {
      const plan = buildGranularityPlan(input);
      expect(findGranularityPlanIssues(plan, input)).toEqual([]);
    }
  });

  it("同じ入力に対して同じ出力を返す", () => {
    const a = buildGranularityPlan(takeoverInput());
    const b = buildGranularityPlan(takeoverInput());
    expect(a).toEqual(b);
  });

  it("ビートが無くても makeBeats のビートに吸着する", () => {
    // makeBeats のビート間隔に切替が乗ることを確認する。
    const input = twoPhraseWithGapInput();
    const beatSet = new Set(input.beatStartTimesMs);
    const plan = buildGranularityPlan(input);
    for (let i = 1; i < plan.segments.length; i++) {
      expect(beatSet.has(plan.segments[i].startTimeMs)).toBe(true);
    }
    expect(makeBeats(250, 4)).toEqual([0, 250, 500, 750]);
  });
});

describe("ビート吸着の衝突時にセグメントを脱落させない", () => {
  it("近い2フレーズの開始が同じビートに丸まっても、後続フレーズは次のビートへ置き直して残る", () => {
    // ビートは1000ミリ秒間隔。フレーズ0(100〜250)とフレーズ1(300〜1500)はどちらも最近傍ビートが0で衝突する。
    // フォールバックでフレーズ1は0より後の最初のビート1000へ置き直され、両フレーズのセグメントが残る。
    const input: GranularityInput = {
      lyricsTimeline: buildLyricsTimeline({
        phrases: [
          {
            text: "あ",
            startTime: 100,
            endTime: 250,
            children: [{ text: "あ", startTime: 100, endTime: 250, children: [{ text: "あ", startTime: 100, endTime: 250 }] }],
          },
          {
            text: "いうえ",
            startTime: 300,
            endTime: 1500,
            children: [
              {
                text: "いうえ",
                startTime: 300,
                endTime: 1500,
                children: [
                  { text: "い", startTime: 300, endTime: 700 },
                  { text: "う", startTime: 700, endTime: 1100 },
                  { text: "え", startTime: 1100, endTime: 1500 },
                ],
              },
            ],
          },
        ],
      }),
      beatStartTimesMs: [0, 1000, 2000, 3000],
      loudnessCurve: { stepMs: 200, values: new Array(16).fill(10), maxAmplitude: 100 },
      sectionBoundariesMs: [],
      songEndMs: 2000,
    };
    const plan = buildGranularityPlan(input);
    const phraseIndexes = new Set(plan.segments.map((s) => s.phraseIndex));
    expect(phraseIndexes.has(0)).toBe(true);
    expect(phraseIndexes.has(1)).toBe(true);
    expect(findGranularityPlanIssues(plan, input)).toEqual([]);
  });
});

describe("最大声量が0のときの長音主体の判定", () => {
  it("長音だけのフレーズでも最大声量が0なら長音主体にしない", () => {
    const base = longToneInput();
    const input: GranularityInput = {
      ...base,
      loudnessCurve: { stepMs: 200, values: new Array(24).fill(0), maxAmplitude: 0 },
    };
    const plan = buildGranularityPlan(input);
    const seg = plan.segments.find((s) => s.phraseIndex === 0)!;
    expect(seg.reason).not.toBe("longTone");
    expect(seg.reason).toBe("middle");
    expect(seg.granularity).toBe("word");
  });
});

describe("文字を持たないフレーズの扱い", () => {
  it("文字0のフレーズはセグメントを作らず、プランは整合する", () => {
    const input: GranularityInput = {
      lyricsTimeline: buildLyricsTimeline({
        phrases: [
          {
            text: "あい",
            startTime: 0,
            endTime: 500,
            children: [
              {
                text: "あい",
                startTime: 0,
                endTime: 500,
                children: [
                  { text: "あ", startTime: 0, endTime: 250 },
                  { text: "い", startTime: 250, endTime: 500 },
                ],
              },
            ],
          },
          // 文字を持たないフレーズ（単語が空）。
          { text: "", startTime: 1500, endTime: 2000, children: [] },
        ],
      }),
      beatStartTimesMs: makeBeats(250, 16),
      loudnessCurve: { stepMs: 200, values: new Array(16).fill(10), maxAmplitude: 100 },
      sectionBoundariesMs: [],
      songEndMs: 2500,
    };
    const plan = buildGranularityPlan(input);
    const phraseIndexes = new Set(plan.segments.map((s) => s.phraseIndex));
    expect(phraseIndexes.has(1)).toBe(false);
    expect(findGranularityPlanIssues(plan, input)).toEqual([]);
  });
});

describe("ビート吸着フォールバックの境界", () => {
  // [文字, 開始, 終了] の単語1つから成るフレーズの動画を、フレーズの時間範囲付きで作る。
  function video(
    phrases: ReadonlyArray<{ start: number; end: number; chars: ReadonlyArray<readonly [string, number, number]> }>
  ) {
    return {
      phrases: phrases.map((p) => {
        const text = p.chars.map((c) => c[0]).join("");
        return {
          text,
          startTime: p.start,
          endTime: p.end,
          children: [
            {
              text,
              startTime: p.chars[0][1],
              endTime: p.chars[p.chars.length - 1][2],
              children: p.chars.map((c) => ({ text: c[0], startTime: c[1], endTime: c[2] })),
            },
          ],
        };
      }),
    };
  }
  const flat = (count: number) => ({ stepMs: 200, values: new Array(count).fill(10), maxAmplitude: 100 });

  it("置き直し先のビートがセグメント終了と同じ（より後でない）ときは除去し、ゼロ長を作らない", () => {
    // ビートは0と1000。フレーズ1(300〜1000)は最近傍ビート0でフレーズ0と衝突する。0より後の最初のビートは
    // 1000だが、これはフレーズ1の終了1000と同じで「より前」でないため置けず、フレーズ1は除去される。
    const input: GranularityInput = {
      lyricsTimeline: buildLyricsTimeline(
        video([
          { start: 100, end: 250, chars: [["あ", 100, 250]] },
          { start: 300, end: 1000, chars: [["さ", 300, 650], ["く", 650, 1000]] },
        ])
      ),
      beatStartTimesMs: [0, 1000],
      loudnessCurve: flat(16),
      sectionBoundariesMs: [],
      songEndMs: 2000,
    };
    const plan = buildGranularityPlan(input);
    const phraseIndexes = new Set(plan.segments.map((s) => s.phraseIndex));
    expect(phraseIndexes.has(0)).toBe(true);
    expect(phraseIndexes.has(1)).toBe(false);
    expect(findGranularityPlanIssues(plan, input)).toEqual([]);
  });

  it("ビートが1つも無い入力でも、曲全体を被覆し整合する", () => {
    const input: GranularityInput = {
      lyricsTimeline: buildLyricsTimeline(
        video([
          { start: 0, end: 500, chars: [["あ", 0, 250], ["い", 250, 500]] },
          { start: 1500, end: 2000, chars: [["う", 1500, 1750], ["え", 1750, 2000]] },
        ])
      ),
      beatStartTimesMs: [],
      loudnessCurve: flat(16),
      sectionBoundariesMs: [],
      songEndMs: 2500,
    };
    const plan = buildGranularityPlan(input);
    expect(plan.segments[0].startTimeMs).toBe(0);
    expect(plan.segments[plan.segments.length - 1].endTimeMs).toBe(2500);
    expect(findGranularityPlanIssues(plan, input)).toEqual([]);
  });

  it("最後のビート以降で衝突したセグメントは、後ろに置けるビートが無いため除去し、整合を保つ", () => {
    // ビートは0と1000。フレーズ1とフレーズ2はどちらも最後のビート1000へ吸着して衝突する。
    // 1000より後のビートが無いためフレーズ2は除去され、プランは整合する。
    const input: GranularityInput = {
      lyricsTimeline: buildLyricsTimeline(
        video([
          { start: 100, end: 250, chars: [["あ", 100, 250]] },
          { start: 1100, end: 1250, chars: [["い", 1100, 1250]] },
          { start: 1300, end: 1500, chars: [["う", 1300, 1500]] },
        ])
      ),
      beatStartTimesMs: [0, 1000],
      loudnessCurve: flat(16),
      sectionBoundariesMs: [],
      songEndMs: 2000,
    };
    const plan = buildGranularityPlan(input);
    const phraseIndexes = new Set(plan.segments.map((s) => s.phraseIndex));
    expect(phraseIndexes.has(2)).toBe(false);
    expect(findGranularityPlanIssues(plan, input)).toEqual([]);
  });
});

describe("依存規則の回帰", () => {
  it("取り込み（import）の行に禁止された依存先が現れない", () => {
    const modulePath = fileURLToPath(new URL("./granularity.ts", import.meta.url));
    const source = readFileSync(modulePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import"))
      .join("\n");
    expect(importLines.includes("textalive-app-api")).toBe(false);
    expect(importLines.includes('from "../../textalive"')).toBe(false);
    expect(importLines.includes("../../textalive/index")).toBe(false);
    expect(importLines.includes("profiles")).toBe(false);
    expect(importLines.includes("three")).toBe(false);
  });
});
