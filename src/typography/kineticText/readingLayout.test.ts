// 読ませる役のレイアウトと被覆判定（Issue #33）の単体テスト。
// 字幅推定（全角・半角）、収まり判定の安全余白、長フレーズの分割、被覆の構成保証を固定する。

import { describe, it, expect } from "vitest";
import {
  estimateTextPixelWidth,
  fitsWithinRegion,
  buildReadingSpansForPhrase,
  buildReadingSpansByPhrase,
  findReadingCoverageGaps,
  clampReadingPixelHeight,
  createPlacementResolver,
  type ReadingPlacementResolved,
} from "./readingLayout";
import type { TypographyChart } from "../../types/typography";
import { buildLyricsTimeline } from "../../textalive/lyricsTimeline";
import type { LyricSourceVideo } from "../../textalive/lyricsTimeline";
import type { LyricPhraseUnit } from "../../textalive/lyricsTimeline";

// 文字を1つずつ単語にした単純な構造を作る補助（時刻は等間隔）。
function makePhraseSource(text: string, startTime: number, perChar: number) {
  const chars = Array.from(text);
  const children = chars.map((ch, i) => ({
    startTime: startTime + i * perChar,
    endTime: startTime + (i + 1) * perChar,
    text: ch,
    pos: "N",
    children: [
      { startTime: startTime + i * perChar, endTime: startTime + (i + 1) * perChar, text: ch },
    ],
  }));
  return {
    startTime,
    endTime: startTime + chars.length * perChar,
    text,
    children,
  };
}

function makeTimeline(phrases: ReturnType<typeof makePhraseSource>[]) {
  return buildLyricsTimeline({ phrases } as unknown as LyricSourceVideo);
}

describe("estimateTextPixelWidth 字幅推定（一定送り量）", () => {
  it("各文字を想定表示寸法ぶんの一定送り量とみなして積む", () => {
    // 2文字、字高20 → 2×20 = 40。文字種別に依らず一定（文字エンジンの一定送り量に合わせる）。
    expect(estimateTextPixelWidth("あい", 20)).toBeCloseTo(40);
    expect(estimateTextPixelWidth("ab", 20)).toBeCloseTo(40);
  });

  it("文字数に比例する", () => {
    // 3文字、字高20 → 3×20 = 60。
    expect(estimateTextPixelWidth("あいう", 20)).toBeCloseTo(60);
  });
});

describe("fitsWithinRegion 収まり判定", () => {
  it("安全余白を引いた幅と比較する", () => {
    // 2文字=40px。領域幅42、余白5% → 使える幅39.9 → 収まらない。
    expect(fitsWithinRegion("あい", 20, 42)).toBe(false);
    // 領域幅50、余白5% → 使える幅47.5 → 収まる。
    expect(fitsWithinRegion("あい", 20, 50)).toBe(true);
  });
});

describe("buildReadingSpansForPhrase 分割と被覆の構成", () => {
  it("収まる短いフレーズは1区間でフレーズ全体を被覆する", () => {
    const timeline = makeTimeline([makePhraseSource("あい", 0, 100)]);
    const phrase = timeline.phrases[0];
    const spans = buildReadingSpansForPhrase(phrase, "phrase", 20, 1000);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("あい");
    expect(spans[0].displayStartMs).toBe(phrase.startTimeMs);
    expect(spans[0].displayEndMs).toBe(phrase.endTimeMs);
  });

  it("収まらない長いフレーズは複数区間へ分割し、各区間が収まる", () => {
    const timeline = makeTimeline([makePhraseSource("あいうえおかきくけこ", 0, 100)]);
    const phrase = timeline.phrases[0];
    // 字高20、領域幅60、余白5% → 使える幅57 → 1区間に2文字（40）まで、3文字（60）は不可。
    const spans = buildReadingSpansForPhrase(phrase, "phrase", 20, 60);
    expect(spans.length).toBeGreaterThan(1);
    for (const span of spans) {
      expect(fitsWithinRegion(span.text, 20, 60)).toBe(true);
    }
  });

  it("分割後の区間は隙間なくフレーズ全体を被覆する（時刻境界が連続する）", () => {
    const timeline = makeTimeline([makePhraseSource("あいうえおかきくけこ", 0, 100)]);
    const phrase = timeline.phrases[0];
    const spans = buildReadingSpansForPhrase(phrase, "phrase", 20, 60);
    expect(spans[0].displayStartMs).toBe(phrase.startTimeMs);
    expect(spans[spans.length - 1].displayEndMs).toBe(phrase.endTimeMs);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].displayStartMs).toBe(spans[i - 1].displayEndMs);
    }
  });
});

describe("findReadingCoverageGaps 被覆判定", () => {
  const region = { centerXRatio: 0.5, centerYRatio: 0.7, widthRatio: 0.8, heightRatio: 0.2 };
  // フレーズ0（0〜200）、無音（200〜1000）、フレーズ1（1000〜1500）。
  const timeline = makeTimeline([
    makePhraseSource("あい", 0, 100),
    makePhraseSource("うえおかき", 1000, 100),
  ]);
  const songEndMs = 1500;

  function placementFor(_phraseIndex: number): ReadingPlacementResolved {
    return { unit: "phrase", targetPixelHeight: 20, region };
  }

  it("各フレーズに区間を作れば被覆に隙間が無い", () => {
    const spans = buildReadingSpansByPhrase(timeline, placementFor, {
      viewportPixelWidth: 1000,
      defaultTargetPixelHeight: 20,
      defaultRegion: region,
    });
    const gaps = findReadingCoverageGaps(timeline, spans, songEndMs);
    expect(gaps).toEqual([]);
  });

  it("長フレーズで分割が必要でも被覆に隙間が無い", () => {
    const spans = buildReadingSpansByPhrase(timeline, placementFor, {
      // 横画素を小さくして領域幅を狭め、フレーズ1の分割を強制する。
      viewportPixelWidth: 75,
      defaultTargetPixelHeight: 20,
      defaultRegion: region,
    });
    const gaps = findReadingCoverageGaps(timeline, spans, songEndMs);
    expect(gaps).toEqual([]);
  });

  it("区間が無いフレーズは発声中に被覆の隙間が検出される", () => {
    const empty = new Map<number, never[]>();
    const gaps = findReadingCoverageGaps(timeline, empty, songEndMs);
    expect(gaps.length).toBeGreaterThan(0);
    // 隙間はフレーズの発声時間内にだけ現れる（無音区間には現れない）。
    for (const t of gaps) {
      const inPhrase0 = t >= 0 && t < 200;
      const inPhrase1 = t >= 1000 && t < 1500;
      expect(inPhrase0 || inPhrase1).toBe(true);
    }
  });
});

describe("clampReadingPixelHeight 縦方向の収まり", () => {
  it("表示領域の高さに収まるなら要求値をそのまま返す", () => {
    // 要求24、領域高さ割合0.16、画面縦800、余白5% → 使える高さ 0.16×800×0.95=121.6 → 24は収まる。
    expect(clampReadingPixelHeight(24, 0.16, 800, 18)).toBe(24);
  });

  it("表示領域の高さを超える要求は領域の高さへ抑える", () => {
    // 要求200は使える高さ121.6を超える → 121.6へ抑える。
    expect(clampReadingPixelHeight(200, 0.16, 800, 18)).toBeCloseTo(121.6);
  });

  it("領域が最小表示寸法すら入らないほど低いときは最小表示寸法を採る（可読性優先）", () => {
    // 使える高さ 0.01×800×0.95=7.6 < 18 → 最小18を採り、わずかにはみ出すことを許す。
    expect(clampReadingPixelHeight(24, 0.01, 800, 18)).toBe(18);
  });
});

describe("createPlacementResolver 縦クランプ", () => {
  const region = { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.05 };
  const chart: TypographyChart = { effectOverrides: [], readingPlacements: [] };

  it("clamp を渡すと既定配置の想定表示寸法が領域の高さへ抑えられる", () => {
    // 領域高さ割合0.05、画面縦800、余白5% → 使える高さ 0.05×800×0.95=38。要求100 → 38へ抑える。
    const resolve = createPlacementResolver(chart, "phrase", 100, region, {
      viewportPixelHeight: 800,
      minPixelHeight: 18,
    });
    expect(resolve(0).targetPixelHeight).toBeCloseTo(38);
  });

  it("clamp を渡さなければ要求値のまま返す", () => {
    const resolve = createPlacementResolver(chart, "phrase", 100, region);
    expect(resolve(0).targetPixelHeight).toBe(100);
  });
});
