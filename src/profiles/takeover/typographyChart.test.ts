// TAKEOVER タイポ譜面データ（Issue #33）の単体テスト。
// 譜面が曲プロファイル検査に合格すること、配置解決が既定と曲固有指定を正しく返すことを固定する。

import { describe, it, expect } from "vitest";
import {
  takeoverTypographyChart,
  TAKEOVER_DEFAULT_READING_REGION,
  TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
} from "./typographyChart";
import { validateProfile } from "../schema/validateProfile";
import { minimalValidProfile } from "../schema/fixtures/minimalValidProfile";
import { createPlacementResolver } from "../../typography/kineticText/readingLayout";
import type { TypographyChart } from "../../types/typography";

describe("TAKEOVER タイポ譜面データ", () => {
  it("既定の想定表示寸法は可読性の最小表示寸法（18）以上である", () => {
    expect(TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT).toBeGreaterThanOrEqual(18);
  });

  it("既定の表示領域の割合はすべて妥当な範囲にある", () => {
    const r = TAKEOVER_DEFAULT_READING_REGION;
    for (const v of [r.centerXRatio, r.centerYRatio]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(r.widthRatio).toBeGreaterThan(0);
    expect(r.widthRatio).toBeLessThanOrEqual(1);
    expect(r.heightRatio).toBeGreaterThan(0);
    expect(r.heightRatio).toBeLessThanOrEqual(1);
  });

  it("曲プロファイルへ付けても検査に合格する", () => {
    const p = structuredClone(minimalValidProfile) as unknown as Record<string, unknown>;
    p["typographyChart"] = takeoverTypographyChart;
    expect(validateProfile(p).ok).toBe(true);
  });
});

describe("createPlacementResolver 配置解決", () => {
  it("配置指定が無いフレーズは既定の配置を返す", () => {
    const resolve = createPlacementResolver(
      takeoverTypographyChart,
      "phrase",
      TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
      TAKEOVER_DEFAULT_READING_REGION
    );
    const placement = resolve(0);
    expect(placement.unit).toBe("phrase");
    expect(placement.targetPixelHeight).toBe(TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT);
    expect(placement.region).toEqual(TAKEOVER_DEFAULT_READING_REGION);
  });

  it("配置指定があるフレーズはその指定を返す", () => {
    const region = { centerXRatio: 0.5, centerYRatio: 0.4, widthRatio: 0.6, heightRatio: 0.2 };
    const chart: TypographyChart = {
      effectOverrides: [],
      readingPlacements: [{ phraseIndex: 5, unit: "word", targetPixelHeight: 30, region }],
    };
    const resolve = createPlacementResolver(chart, "phrase", TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT, TAKEOVER_DEFAULT_READING_REGION);
    const placement = resolve(5);
    expect(placement.unit).toBe("word");
    expect(placement.targetPixelHeight).toBe(30);
    expect(placement.region).toEqual(region);
    // 指定の無い別フレーズは既定。
    expect(resolve(6).unit).toBe("phrase");
  });
});
