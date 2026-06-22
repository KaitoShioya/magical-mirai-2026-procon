// タイポ・コンポジション譜面（Issue #33）の検査の単体テスト。
// 任意項目であること、上書き種別、演出識別名の必須条件、文字範囲・表示領域の値域、フレーズ重複を固定する。

import { describe, it, expect } from "vitest";
import { validateProfile } from "./validateProfile";
import { minimalValidProfile } from "./fixtures/minimalValidProfile";
import type { TypographyChart } from "../../types/typography";

function withChart(chart: unknown): Record<string, unknown> {
  const p = structuredClone(minimalValidProfile) as unknown as Record<string, unknown>;
  p["typographyChart"] = chart;
  return p;
}

const validChart: TypographyChart = {
  effectOverrides: [
    { phraseIndex: 0, decision: "adoptDefault" },
    {
      phraseIndex: 1,
      decision: "addSongSpecific",
      effectId: "effect.charSmash",
      startCondition: { beatCadence: 2 },
      finalPriority: 10,
    },
    {
      phraseIndex: 2,
      decision: "disableDefault",
      effectId: "effect.depthFlight",
      range: { startWordIndex: 0, startCharIndex: 0, endWordIndex: 0, endCharIndex: 1 },
    },
  ],
  readingPlacements: [
    {
      phraseIndex: 0,
      unit: "phrase",
      targetPixelHeight: 24,
      region: { centerXRatio: 0.5, centerYRatio: 0.7, widthRatio: 0.8, heightRatio: 0.2 },
    },
  ],
};

describe("validateProfile タイポ譜面（任意項目）", () => {
  it("タイポ譜面を持たない最小プロファイルは合格する（任意項目）", () => {
    expect(validateProfile(minimalValidProfile).ok).toBe(true);
  });

  it("正しいタイポ譜面を付けても合格する", () => {
    expect(validateProfile(withChart(validChart)).ok).toBe(true);
  });
});

describe("validateProfile タイポ譜面の不正", () => {
  function expectInvalidPath(chart: unknown, pathFragment: string): void {
    const result = validateProfile(withChart(chart));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes(pathFragment))).toBe(true);
    }
  }

  it("上書き種別が3種以外なら不合格になる", () => {
    expectInvalidPath(
      { effectOverrides: [{ phraseIndex: 0, decision: "unknownKind" }], readingPlacements: [] },
      "effectOverrides[0].decision"
    );
  });

  it("disableDefault で演出識別名が無いと不合格になる", () => {
    expectInvalidPath(
      { effectOverrides: [{ phraseIndex: 0, decision: "disableDefault" }], readingPlacements: [] },
      "effectOverrides[0].effectId"
    );
  });

  it("addSongSpecific で演出識別名が無いと不合格になる", () => {
    expectInvalidPath(
      { effectOverrides: [{ phraseIndex: 0, decision: "addSongSpecific" }], readingPlacements: [] },
      "effectOverrides[0].effectId"
    );
  });

  it("adoptDefault は演出識別名が無くても合格する", () => {
    const result = validateProfile(
      withChart({ effectOverrides: [{ phraseIndex: 0, decision: "adoptDefault" }], readingPlacements: [] })
    );
    expect(result.ok).toBe(true);
  });

  it("文字範囲の終了が開始より前なら不合格になる", () => {
    expectInvalidPath(
      {
        effectOverrides: [
          {
            phraseIndex: 0,
            decision: "addSongSpecific",
            effectId: "effect.charSmash",
            range: { startWordIndex: 1, startCharIndex: 0, endWordIndex: 0, endCharIndex: 5 },
          },
        ],
        readingPlacements: [],
      },
      "effectOverrides[0].range"
    );
  });

  it("開始条件の拍間隔が正の整数でないと不合格になる", () => {
    expectInvalidPath(
      {
        effectOverrides: [
          { phraseIndex: 0, decision: "addSongSpecific", effectId: "effect.charSmash", startCondition: { beatCadence: 0 } },
        ],
        readingPlacements: [],
      },
      "effectOverrides[0].startCondition.beatCadence"
    );
  });

  it("読ませる役の表示単位が3種以外なら不合格になる", () => {
    expectInvalidPath(
      {
        effectOverrides: [],
        readingPlacements: [
          { phraseIndex: 0, unit: "line", targetPixelHeight: 24, region: { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.2 } },
        ],
      },
      "readingPlacements[0].unit"
    );
  });

  it("想定表示寸法が正でないと不合格になる", () => {
    expectInvalidPath(
      {
        effectOverrides: [],
        readingPlacements: [
          { phraseIndex: 0, unit: "phrase", targetPixelHeight: 0, region: { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.2 } },
        ],
      },
      "readingPlacements[0].targetPixelHeight"
    );
  });

  it("表示領域の割合が範囲外なら不合格になる", () => {
    expectInvalidPath(
      {
        effectOverrides: [],
        readingPlacements: [
          { phraseIndex: 0, unit: "phrase", targetPixelHeight: 24, region: { centerXRatio: 1.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.2 } },
        ],
      },
      "readingPlacements[0].region.centerXRatio"
    );
  });

  it("幅の割合が0以下なら不合格になる", () => {
    expectInvalidPath(
      {
        effectOverrides: [],
        readingPlacements: [
          { phraseIndex: 0, unit: "phrase", targetPixelHeight: 24, region: { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0, heightRatio: 0.2 } },
        ],
      },
      "readingPlacements[0].region.widthRatio"
    );
  });

  it("読ませる役の配置でフレーズ番号が重複すると不合格になる", () => {
    expectInvalidPath(
      {
        effectOverrides: [],
        readingPlacements: [
          { phraseIndex: 3, unit: "phrase", targetPixelHeight: 24, region: { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.2 } },
          { phraseIndex: 3, unit: "word", targetPixelHeight: 24, region: { centerXRatio: 0.5, centerYRatio: 0.5, widthRatio: 0.8, heightRatio: 0.2 } },
        ],
      },
      "readingPlacements[1].phraseIndex"
    );
  });
});
