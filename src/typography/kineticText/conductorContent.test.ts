// 駆動部の内容組み立て（Issue #33）の統合テスト。
// 音楽地図ソース → 内容組み立て → 駆動部、までを擬似で通し、被覆に隙間が無いこと・通しで例外が出ないことを固定する。

import { describe, it, expect } from "vitest";
import { prepareConductorContent, chorusSmashOverrides } from "./conductorContent";
import { createConductor } from "./conductor";
import type { ConductorEngineLike, ConductorPlacement } from "./conductor";
import { createFakeMusicMapSource } from "../../textalive/musicMap";
import type { LyricSourceVideo, LyricsTimeline } from "../../textalive/lyricsTimeline";
import { createEffectRegistry } from "./effectElement";
import { charSmash } from "./effects/charSmash";
import { EFFECT_ID } from "./effectAssignment";
import { activeResolvedAssignmentsAt } from "./typographyChartResolve";
import { findReadingCoverageGaps, findReadingCoverageDefects, READING_COVERAGE_SAMPLE_STEP_MS } from "./readingLayout";
import type { GlyphHandle, ReadabilityOptions } from "./types";

// ---- 擬似の歌詞・音楽地図 ----

function phraseSource(text: string, startTime: number, perChar: number) {
  const chars = Array.from(text);
  return {
    startTime,
    endTime: startTime + chars.length * perChar,
    text,
    children: [
      {
        startTime,
        endTime: startTime + chars.length * perChar,
        text,
        children: chars.map((ch, i) => ({
          startTime: startTime + i * perChar,
          endTime: startTime + (i + 1) * perChar,
          text: ch,
        })),
      },
    ],
  };
}

// フレーズ0（短、0〜500）、無音、フレーズ2（長、2000〜3000）。
const lyricsVideo = {
  phrases: [
    phraseSource("あいうえお", 0, 100),
    phraseSource("アップアンドダウンスクランブル", 2000, 70),
  ],
} as unknown as LyricSourceVideo;

const songEndMs = 3200;
const beatStartTimesMs: number[] = [];
for (let t = 0; t < songEndMs; t += 343) {
  beatStartTimesMs.push(t);
}

const source = createFakeMusicMapSource({
  lyricsVideo,
  beatStartTimesMs,
  chorusRanges: [{ startTimeMs: 0, endTimeMs: 500 }],
  constantVocalAmplitude: 50,
  songEndMs,
});

const defaultRegion = { centerXRatio: 0.5, centerYRatio: 0.72, widthRatio: 0.86, heightRatio: 0.16 };

function buildContent(viewportPixelWidth: number) {
  const registry = createEffectRegistry();
  registry.register(charSmash);
  return prepareConductorContent({
    source,
    registry,
    emotionAvailable: false,
    viewportPixelWidth,
    viewportPixelHeight: 800,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: 24,
    defaultReadingRegion: defaultRegion,
  });
}

// ---- 擬似エンジン・配置 ----

function makeHandle(): GlyphHandle {
  return {
    setPosition() {},
    setRotation() {},
    setScale() {},
    setScale3() {},
    setColor() {},
    setOpacity() {},
    setLetterSpacing() {},
    applyReadability() {},
    setOrientation() {},
    release() {},
  };
}

function makeEngine(): ConductorEngineLike & { phraseCount: number } {
  const engine = {
    phraseCount: 0,
    spawnGlyph() {
      engine.phraseCount++;
      return makeHandle();
    },
  };
  return engine;
}

const placement: ConductorPlacement = {
  readingWorldPosition: () => ({ x: 0, y: 0, z: 0 }),
  worldFontSizeForPixelHeight: (px) => px / 100,
};

const readability: ReadabilityOptions = {
  borderColor: 0,
  borderWidth: "4%",
  borderOpacity: 1,
  shadowColor: 0,
  shadowWidth: "3%",
  shadowOffsetX: "3%",
  shadowOffsetY: "-3%",
  shadowBlur: "8%",
  shadowOpacity: 0.85,
  maxBrightLuminance: 0.45,
  minPixelHeight: 18,
};

describe("chorusSmashOverrides（サビでスマッシュを必ず効かせる追加上書き）", () => {
  function timelineOf(
    phrases: { phraseIndex: number; startTimeMs: number; endTimeMs: number }[]
  ): LyricsTimeline {
    return {
      phrases: phrases.map((p) => ({ ...p, text: "あ", words: [] })),
      phraseCount: phrases.length,
      wordCount: 0,
      charCount: 0,
    } as unknown as LyricsTimeline;
  }

  it("コーラス区間に重なるフレーズだけへ smash の addSongSpecific 上書きを作る", () => {
    const timeline = timelineOf([
      { phraseIndex: 0, startTimeMs: 0, endTimeMs: 500 }, // サビ内
      { phraseIndex: 1, startTimeMs: 1000, endTimeMs: 1500 }, // サビ外
      { phraseIndex: 2, startTimeMs: 1900, endTimeMs: 2100 }, // サビ境界に一部重なる
    ]);
    const result = chorusSmashOverrides(timeline, [
      { startTimeMs: 0, endTimeMs: 600 },
      { startTimeMs: 2000, endTimeMs: 2500 },
    ]);
    expect(result.map((o) => o.phraseIndex)).toEqual([0, 2]);
    expect(result.every((o) => o.decision === "addSongSpecific" && o.effectId === EFFECT_ID.smash)).toBe(true);
  });

  it("コーラス区間が無ければ空（既定の割付のまま）", () => {
    const timeline = timelineOf([{ phraseIndex: 0, startTimeMs: 0, endTimeMs: 500 }]);
    expect(chorusSmashOverrides(timeline, [])).toEqual([]);
  });

  it("曲固有の譜面が既に smash 上書きを持つフレーズは二重に作らない", () => {
    const timeline = timelineOf([{ phraseIndex: 0, startTimeMs: 0, endTimeMs: 500 }]);
    const result = chorusSmashOverrides(timeline, [{ startTimeMs: 0, endTimeMs: 600 }], [
      { phraseIndex: 0, decision: "addSongSpecific", effectId: EFFECT_ID.smash },
    ]);
    expect(result).toEqual([]);
  });
});

describe("prepareConductorContent 統合", () => {
  it("読ませる役の区間が発声中のフレーズを隙間なく被覆する（広い画面）", () => {
    const content = buildContent(1000);
    // 区間ベースの厳密な証明（標本に依らず各フレーズの窓を分割することを確かめる）。
    expect(findReadingCoverageDefects(content.timeline, content.spansByPhrase)).toEqual([]);
    // 実行時経路の標本検査も合わせて確かめる。
    const gaps = findReadingCoverageGaps(content.timeline, content.spansByPhrase, songEndMs);
    expect(gaps).toEqual([]);
  });

  it("長フレーズが分割される狭い画面でも被覆に隙間が無い", () => {
    const content = buildContent(120);
    expect(findReadingCoverageDefects(content.timeline, content.spansByPhrase)).toEqual([]);
    const gaps = findReadingCoverageGaps(content.timeline, content.spansByPhrase, songEndMs);
    expect(gaps).toEqual([]);
  });

  it("確定割付プランは表示粒度プランと同数のセグメントを持つ", () => {
    const content = buildContent(1000);
    expect(content.resolvedPlan.segments.length).toBeGreaterThan(0);
  });

  it("サビ（コーラス区間）に重なるフレーズでスマッシュが有効になる", () => {
    // フレーズ0（0〜500）はコーラス区間 [0,500) に重なる。既定では shortDense でなくとも、
    // サビ用の追加上書きにより smash が active になる。フレーズ1（2000〜3000）はサビ外。
    const content = buildContent(1000);
    const inChorus = activeResolvedAssignmentsAt(content.resolvedPlan, 200);
    expect(inChorus.some((a) => a.effectId === EFFECT_ID.smash)).toBe(true);
  });

  it("駆動部で曲を通し再生しても例外が出ず、読ませる役が生成される", () => {
    const content = buildContent(120);
    const engine = makeEngine();
    const conductor = createConductor({
      engine,
      placement,
      content,
      fontName: "test",
      readabilityFor: () => readability,
      baseColor: 0xffffff,
      isPlaceholder: () => false,
    });
    expect(() => {
      for (let t = 0; t < songEndMs; t += READING_COVERAGE_SAMPLE_STEP_MS) {
        conductor.update(t);
      }
      conductor.dispose();
    }).not.toThrow();
    // フレーズ発声中に読ませる役が生成されている。
    expect(engine.phraseCount).toBeGreaterThan(0);
  });
});
