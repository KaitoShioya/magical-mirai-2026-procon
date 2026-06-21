// 駆動部の内容の組み立て（Issue #33）。
//
// 役割: 音楽地図ソース（src/textalive/musicMap.ts）とタイポ譜面・演出登録から、駆動部が毎フレーム参照する内容
// （歌詞タイムライン・確定割付プラン・読ませる役の区間・配置解決）を一度だけ組み立てる。声量曲線の標本化など
// 表示粒度の型を要する処理をここに集約し、音楽地図ソース側を typography 非依存に保つ。
//
// 依存規則: profiles・tools を import しない。曲固有データの型は src/types から取り込む。

import { buildLyricsTimeline } from "../../textalive/lyricsTimeline";
import type { MusicMapSource } from "../../textalive/musicMap";
import type { GranularityInput, LoudnessCurveInput, SectionRange } from "./granularity";
import { buildGranularityPlan } from "./granularity";
import type { EffectRegistry } from "./effectElement";
import { buildAssignmentPlan, signalAvailabilityFrom } from "./effectAssignment";
import { resolveTypographyChart } from "./typographyChartResolve";
import {
  buildReadingSpansByPhrase,
  createPlacementResolver,
} from "./readingLayout";
import { DEFAULT_READABILITY_OPTIONS } from "./readability";
import type { ReadingDisplayUnit } from "../../types/typography";
import type { TypographyChart, TypographyDisplayRegion } from "../../types/typography";
import type { ConductorContent } from "./conductor";

/** 声量曲線の標本間隔（採用理由を先に述べる）。解析資料（takeover.songmap.json）の声量曲線の標本間隔が
 * 200ミリ秒であり、実行時に同じ間隔で標本化すれば解析時と同じ時間解像度になり、粒度判定の挙動が資料と一致する。 */
export const LOUDNESS_SAMPLE_STEP_MS = 200;

/** 駆動部の内容を組み立てる設定。 */
export interface PrepareConductorContentParams {
  readonly source: MusicMapSource;
  readonly registry: EffectRegistry;
  /** タイポ譜面（曲固有上書きと配置）。省略時は既定のみ。 */
  readonly chart?: TypographyChart;
  /** 感情値が供給可能か（signalAvailabilityFrom へ渡す）。 */
  readonly emotionAvailable: boolean;
  /** 画面の横デバイス画素数（読ませる役の幅の収まり判定に使う）。 */
  readonly viewportPixelWidth: number;
  /** 画面の縦デバイス画素数（読ませる役の高さの収まり判定に使う）。 */
  readonly viewportPixelHeight: number;
  /** 可読性の最小表示寸法（デバイス画素）。省略時は可読性の既定値。縦の収まりで下回らせない下限。 */
  readonly readingMinPixelHeight?: number;
  /** 配置指定の無いフレーズの既定の表示単位。 */
  readonly defaultReadingUnit: ReadingDisplayUnit;
  /** 配置指定の無いフレーズの既定の想定表示寸法（デバイス画素）。 */
  readonly defaultReadingPixelHeight: number;
  /** 配置指定の無いフレーズの既定の表示領域。 */
  readonly defaultReadingRegion: TypographyDisplayRegion;
  /** 声量曲線の標本間隔。省略時 LOUDNESS_SAMPLE_STEP_MS。 */
  readonly loudnessStepMs?: number;
}

/** 音楽地図ソースから声量曲線を標本化する。 */
function sampleLoudnessCurve(source: MusicMapSource, stepMs: number): LoudnessCurveInput {
  const songEndMs = source.songEndMs();
  const values: number[] = [];
  let maxAmplitude = 0;
  for (let t = 0; t < songEndMs; t += stepMs) {
    const value = source.vocalAmplitudeAt(t);
    values.push(value);
    if (value > maxAmplitude) {
      maxAmplitude = value;
    }
  }
  return { stepMs, values, maxAmplitude };
}

/**
 * 駆動部の内容を一度だけ組み立てる。音楽地図ソースが準備完了でないときは呼ばない（呼び出し側が isReady を確認する）。
 * 流れ: 歌詞タイムライン → 表示粒度プラン → 割付プラン → タイポ譜面適用（確定割付プラン）と、読ませる役の区間。
 */
export function prepareConductorContent(params: PrepareConductorContentParams): ConductorContent {
  const { source, registry, chart } = params;
  const stepMs = params.loudnessStepMs ?? LOUDNESS_SAMPLE_STEP_MS;

  const timeline = buildLyricsTimeline(source.lyricsVideo());
  const loudnessCurve = sampleLoudnessCurve(source, stepMs);
  const sectionBoundariesMs: readonly SectionRange[] = source
    .chorusRanges()
    .map((range) => ({ startTimeMs: range.startTimeMs, endTimeMs: range.endTimeMs }));

  const input: GranularityInput = {
    lyricsTimeline: timeline,
    beatStartTimesMs: source.beatStartTimesMs(),
    loudnessCurve,
    sectionBoundariesMs,
    songEndMs: source.songEndMs(),
  };

  const granularityPlan = buildGranularityPlan(input);
  const signals = signalAvailabilityFrom(input, params.emotionAvailable);
  const assignmentPlan = buildAssignmentPlan({ granularityPlan, registry, signals });
  const resolvedPlan = resolveTypographyChart(assignmentPlan, registry, chart);

  const placementFor = createPlacementResolver(
    chart,
    params.defaultReadingUnit,
    params.defaultReadingPixelHeight,
    params.defaultReadingRegion,
    {
      viewportPixelHeight: params.viewportPixelHeight,
      minPixelHeight: params.readingMinPixelHeight ?? DEFAULT_READABILITY_OPTIONS.minPixelHeight,
    }
  );
  const spansByPhrase = buildReadingSpansByPhrase(timeline, placementFor, {
    viewportPixelWidth: params.viewportPixelWidth,
    defaultTargetPixelHeight: params.defaultReadingPixelHeight,
    defaultRegion: params.defaultReadingRegion,
  });

  return { timeline, resolvedPlan, spansByPhrase, placementFor };
}
