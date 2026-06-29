// 駆動部の内容の組み立て（Issue #33）。
//
// 役割: 音楽地図ソース（src/textalive/musicMap.ts）とタイポ譜面・演出登録から、駆動部が毎フレーム参照する内容
// （歌詞タイムライン・確定割付プラン・読ませる役の区間・配置解決）を一度だけ組み立てる。声量曲線の標本化など
// 表示粒度の型を要する処理をここに集約し、音楽地図ソース側を typography 非依存に保つ。
//
// 依存規則: profiles・tools を import しない。曲固有データの型は src/types から取り込む。

import { buildLyricsTimeline } from "../../textalive/lyricsTimeline";
import type { LyricsTimeline } from "../../textalive/lyricsTimeline";
import type { MusicMapSource } from "../../textalive/musicMap";
import type { GranularityInput, LoudnessCurveInput, SectionRange } from "./granularity";
import { buildGranularityPlan } from "./granularity";
import type { EffectRegistry } from "./effectElement";
import { buildAssignmentPlan, signalAvailabilityFrom, EFFECT_ID } from "./effectAssignment";
import { resolveTypographyChart } from "./typographyChartResolve";
import type { TypographyEffectOverride } from "../../types/typography";
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

/**
 * サビ（コーラス区間）で1文字スマッシュ（#23 charSmash）を必ず効かせるための、曲非依存の追加上書きを作る。
 *
 * 背景と理由を先に述べる。演出割付（effectAssignment.ts）はフレーズの発声特性（短音の高密度＝shortDense 等）から
 * 主演出を選ぶため、サビでも持続音や中間の発声（判定理由 middle・longDense・longSparse）が多いフレーズには
 * 既定でスマッシュ（smash）が割り付かない。実測（実装済み全曲の音楽地図ダンプ）でサビ時間の大半（曲により0〜26%
 * しか）にスマッシュが乗らなかった。本作の見せ場ではサビで打音感（1文字1拍スマッシュ）を必ず効かせたいので、
 * サビに重なるフレーズへ smash を addSongSpecific で追加して、全曲のサビでスマッシュが立ち上がるようにする。
 *
 * 二重付与は起きない。既定で既に smash が乗るフレーズ（shortDense 等）は typographyChartResolve の追加処理が
 * 既存の識別名を避けるため増えない。曲固有の譜面が同じフレーズへ smash の上書きを持つ場合も、ここで重複を除く。
 * コーラス区間が無い曲（音楽地図が区間を返さない）では空を返し、既定の割付をそのまま使う。
 */
export function chorusSmashOverrides(
  timeline: LyricsTimeline,
  chorusRanges: readonly SectionRange[],
  existingOverrides: readonly TypographyEffectOverride[] = []
): TypographyEffectOverride[] {
  if (chorusRanges.length === 0) {
    return [];
  }
  // 既に smash の上書きを持つフレーズ番号（曲固有譜面由来）。これらは重複を避けて飛ばす。
  const alreadySmashed = new Set<number>();
  for (const override of existingOverrides) {
    if (override.effectId === EFFECT_ID.smash) {
      alreadySmashed.add(override.phraseIndex);
    }
  }
  // フレーズの発声区間 [開始, 終了) がコーラス区間 [開始, 終了) と重なるか。
  const overlapsChorus = (startMs: number, endMs: number): boolean =>
    chorusRanges.some((range) => startMs < range.endTimeMs && endMs > range.startTimeMs);

  const overrides: TypographyEffectOverride[] = [];
  for (const phrase of timeline.phrases) {
    if (alreadySmashed.has(phrase.phraseIndex)) {
      continue;
    }
    if (overlapsChorus(phrase.startTimeMs, phrase.endTimeMs)) {
      overrides.push({
        phraseIndex: phrase.phraseIndex,
        decision: "addSongSpecific",
        effectId: EFFECT_ID.smash,
      });
    }
  }
  return overrides;
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
  // サビでスマッシュを必ず効かせる追加上書きを足した譜面で割付を確定する（曲固有の譜面上書きは保ったまま合流する）。
  // 配置（readingPlacements）には影響しないため、配置解決には元の chart を使う。
  const chorusSmash = chorusSmashOverrides(timeline, sectionBoundariesMs, chart?.effectOverrides ?? []);
  const effectiveChart: TypographyChart | undefined =
    chorusSmash.length === 0
      ? chart
      : {
          effectOverrides: [...(chart?.effectOverrides ?? []), ...chorusSmash],
          readingPlacements: chart?.readingPlacements ?? [],
        };
  const resolvedPlan = resolveTypographyChart(assignmentPlan, registry, effectiveChart);

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
