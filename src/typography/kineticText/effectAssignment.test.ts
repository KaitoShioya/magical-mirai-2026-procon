import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildLyricsTimeline } from "../../textalive/lyricsTimeline";
import type { LyricsTimeline } from "../../textalive/lyricsTimeline";
import { buildGranularityPlan } from "./granularity";
import type { GranularityInput, GranularityReason, GranularitySegment } from "./granularity";
import {
  longToneInput,
  middleInput,
  longSparseInput,
  twoPhraseWithGapInput,
} from "./fixtures/granularityInput";
import { createEffectRegistry } from "./effectElement";
import type { EffectElement, EffectRegistry } from "./effectElement";
import { charSmash } from "./effects/charSmash";
import {
  charSmashSample,
  letterSpacingSpreadSample,
  circularMultiplySample,
  verticalStretchSwirlSample,
  afterimageTrailSample,
  fadeBlackoutSample,
  emotionLoudnessSample,
  depthFlightSample,
} from "./fixtures/sampleEffects";
import {
  buildAssignmentPlan,
  assignmentAt,
  activeAssignmentsAt,
  resolveSegmentAssignments,
  defaultRulesFor,
  signalAvailabilityFrom,
  findAssignmentPlanIssues,
  EFFECT_ID,
  EFFECT_PRIORITY_SHORT_DENSE_RUSH_ADJUST,
} from "./effectAssignment";
import type {
  AssignmentPlan,
  AssignmentPlanInput,
  SegmentAssignment,
  SignalAvailability,
} from "./effectAssignment";

// ---- 実データ（TAKEOVERの音楽地図ダンプ）の読み込み（granularity.test.ts と同じ経路） ----

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

// ---- レジストリと信号在不在 ----

const ALL_SIGNALS: SignalAvailability = { loudness: true, emotion: true, sectionBoundary: true };
const NO_SIGNALS: SignalAvailability = { loudness: false, emotion: false, sectionBoundary: false };

/** 実演出 charSmash のみを登録した実レジストリ（最小成立の現実）。 */
function realRegistry(): EffectRegistry {
  const registry = createEffectRegistry();
  registry.register(charSmash);
  return registry;
}

/**
 * 検査用擬似演出8件を、識別名のみ EFFECT_ID の値へ差し替えて登録した充足レジストリ。
 * 識別名のみを変えた複製は validateEffectElement を通る（対象単位と費用宣言を変えないため検査結果が変わらない）。
 */
function fullRegistry(): EffectRegistry {
  const registry = createEffectRegistry();
  const remap: ReadonlyArray<readonly [EffectElement, string]> = [
    [charSmashSample, EFFECT_ID.smash],
    [letterSpacingSpreadSample, EFFECT_ID.letterSpacingSpread],
    [circularMultiplySample, EFFECT_ID.circularMultiply],
    [verticalStretchSwirlSample, EFFECT_ID.verticalStretchSwirl],
    [afterimageTrailSample, EFFECT_ID.afterimageTrail],
    [fadeBlackoutSample, EFFECT_ID.fadeBlackout],
    [emotionLoudnessSample, EFFECT_ID.emotionLoudness],
    [depthFlightSample, EFFECT_ID.depthFlight],
  ];
  for (const [sample, id] of remap) {
    registry.register({ ...sample, id });
  }
  return registry;
}

// ---- セグメント探索の補助 ----

/** ある判定理由の最初のセグメントを粒度プランから取り、割付プランへ通して割付セグメントを返す。 */
function assignmentSegmentByReason(
  input: GranularityInput,
  registry: EffectRegistry,
  signals: SignalAvailability,
  reason: GranularityReason
): SegmentAssignment {
  const granularityPlan = buildGranularityPlan(input);
  const source = granularityPlan.segments.find((s) => s.reason === reason);
  if (source === undefined) {
    throw new Error(`テスト前提の判定理由のセグメントが見つからない: ${reason}`);
  }
  const plan = buildAssignmentPlan({ granularityPlan, registry, signals });
  const found = plan.segments.find(
    (s) => s.startTimeMs === source.startTimeMs && s.reason === reason
  );
  if (found === undefined) {
    throw new Error(`割付セグメントが見つからない: ${reason}`);
  }
  return found;
}

function effectIds(segment: SegmentAssignment): string[] {
  return segment.assignments.map((a) => a.effectId);
}

function assignmentOf(segment: SegmentAssignment, effectId: string) {
  const found = segment.assignments.find((a) => a.effectId === effectId);
  if (found === undefined) {
    throw new Error(`割付が見つからない: ${effectId}`);
  }
  return found;
}

// 短音優勢の判定理由を実データで起こすための合成入力（shortDense と shortSparse）。
// 文字継続時間を短音上限150ミリ秒以下に、密度を1拍あたり1文字超（高密度）か未満（低密度）に設計する。

/** 短音優勢かつ高密度（shortDense）を起こす合成入力。各文字100ミリ秒で1拍250ミリ秒に文字を詰める。 */
function shortDenseInput(): GranularityInput {
  const chars: Array<{ text: string; startTime: number; endTime: number }> = [];
  // 8文字を1拍250ミリ秒あたり1文字超になるよう125ミリ秒間隔で置く（各100ミリ秒の短音）。
  for (let i = 0; i < 8; i++) {
    const start = i * 125;
    chars.push({ text: "あ", startTime: start, endTime: start + 100 });
  }
  const timeline = buildLyricsTimeline({
    phrases: [
      {
        text: "あ".repeat(8),
        startTime: 0,
        endTime: chars[chars.length - 1].endTime,
        children: [
          {
            text: "あ".repeat(8),
            startTime: 0,
            endTime: chars[chars.length - 1].endTime,
            children: chars,
          },
        ],
      },
    ],
  });
  const beats: number[] = [];
  for (let i = 0; i < 12; i++) beats.push(i * 250);
  return {
    lyricsTimeline: timeline,
    beatStartTimesMs: beats,
    loudnessCurve: { stepMs: 200, values: new Array(16).fill(10), maxAmplitude: 100 },
    sectionBoundariesMs: [],
    songEndMs: 3000,
  };
}

// ============================================================
// 受け入れ基準1: 単位と条件から既定の演出群を返す
// ============================================================

describe("受け入れ基準1: 単位と条件から既定の演出群を返す", () => {
  it("defaultRulesFor は全8判定理由で例外なく配列を返し、middle のみ空配列で他7理由は主演出を1件持つ", () => {
    const reasons: GranularityReason[] = [
      "boundary",
      "longTone",
      "repeat",
      "longDense",
      "longSparse",
      "shortDense",
      "shortSparse",
      "middle",
    ];
    for (const reason of reasons) {
      expect(Array.isArray(defaultRulesFor(reason))).toBe(true);
    }
    expect(defaultRulesFor("middle")).toEqual([]);
    for (const reason of reasons.filter((r) => r !== "middle")) {
      expect(defaultRulesFor(reason).length).toBe(1);
    }
  });

  it("充足レジストリと全信号供給ありで、shortSparse の文字セグメントに smash が active で割り付く", () => {
    const segment = assignmentSegmentByReason(takeoverInput(), fullRegistry(), ALL_SIGNALS, "shortSparse");
    const smash = assignmentOf(segment, EFFECT_ID.smash);
    expect(smash.status).toBe("active");
    expect(segment.granularity).toBe("char");
  });

  it("実レジストリ（charSmash のみ）でも shortSparse の文字セグメントに charSmash が active で割り付く", () => {
    const segment = assignmentSegmentByReason(takeoverInput(), realRegistry(), ALL_SIGNALS, "shortSparse");
    const smash = assignmentOf(segment, EFFECT_ID.smash);
    expect(smash.status).toBe("active");
  });

  it("longTone のフレーズセグメントに verticalStretchSwirl が active で割り付き、宣言対象単位（文字）と適用粒度（フレーズ）の不一致を併存する", () => {
    const segment = assignmentSegmentByReason(longToneInput(), fullRegistry(), ALL_SIGNALS, "longTone");
    const swirl = assignmentOf(segment, EFFECT_ID.verticalStretchSwirl);
    expect(swirl.status).toBe("active");
    expect(swirl.declaredTargetUnit).toBe("char"); // 登録実体の targetUnit
    expect(swirl.applyGranularity).toBe("phrase"); // 規則の既定適用粒度
    expect(segment.granularity).toBe("phrase");
  });

  it("各判定理由に第9節の主演出が割り付く（repeat→円状回転増殖、longDense/longSparse→字間拡大、boundary→暗転）", () => {
    const repeat = assignmentSegmentByReason(takeoverInput(), fullRegistry(), ALL_SIGNALS, "repeat");
    expect(effectIds(repeat)).toContain(EFFECT_ID.circularMultiply);

    const longDense = assignmentSegmentByReason(takeoverInput(), fullRegistry(), ALL_SIGNALS, "longDense");
    expect(effectIds(longDense)).toContain(EFFECT_ID.letterSpacingSpread);

    const longSparse = assignmentSegmentByReason(longSparseInput(), fullRegistry(), ALL_SIGNALS, "longSparse");
    expect(effectIds(longSparse)).toContain(EFFECT_ID.letterSpacingSpread);

    const boundary = assignmentSegmentByReason(twoPhraseWithGapInput(), fullRegistry(), ALL_SIGNALS, "boundary");
    expect(effectIds(boundary)).toContain(EFFECT_ID.fadeBlackout);
  });

  it("画面全体以外のセグメントには常時重ね層3件が重なり、画面全体には重ならず主演出 fadeBlackout のみである", () => {
    const overlayIds = [EFFECT_ID.emotionLoudness, EFFECT_ID.afterimageTrail, EFFECT_ID.depthFlight];

    const middle = assignmentSegmentByReason(middleInput(), fullRegistry(), ALL_SIGNALS, "middle");
    for (const id of overlayIds) {
      expect(effectIds(middle)).toContain(id);
    }

    const boundary = assignmentSegmentByReason(twoPhraseWithGapInput(), fullRegistry(), ALL_SIGNALS, "boundary");
    expect(boundary.granularity).toBe("fullscreen");
    expect(effectIds(boundary)).toEqual([EFFECT_ID.fadeBlackout]);
  });

  it("granularityOverrides を指定すると対象文法の適用粒度が規則の既定値から上書き値へ差し替わる", () => {
    const input = shortDenseInput();
    const granularityPlan = buildGranularityPlan(input);
    const plan = buildAssignmentPlan({
      granularityPlan,
      registry: fullRegistry(),
      signals: ALL_SIGNALS,
      granularityOverrides: { smash: "phrase" },
    });
    const segment = plan.segments.find((s) => s.reason === "shortDense");
    expect(segment).toBeDefined();
    const smash = assignmentOf(segment as SegmentAssignment, EFFECT_ID.smash);
    // 既定は文字。上書きでフレーズへ差し替わる。
    expect(smash.applyGranularity).toBe("phrase");
  });
});

// ============================================================
// 受け入れ基準2: 数拍ごとの切替で疾走感を作る
// ============================================================

describe("受け入れ基準2: 数拍ごとの切替で疾走感を作る", () => {
  it("shortSparse＋実レジストリで charSmash が active かつ segmentCharCadenceBeats=1 かつ effectBeatCadenceBeats=2（分離保持が潰れない）", () => {
    const segment = assignmentSegmentByReason(takeoverInput(), realRegistry(), ALL_SIGNALS, "shortSparse");
    const smash = assignmentOf(segment, EFFECT_ID.smash);
    expect(smash.status).toBe("active");
    expect(smash.segmentCharCadenceBeats).toBe(1); // セグメント由来（毎拍）
    expect(smash.effectBeatCadenceBeats).toBe(2); // 演出宣言由来（2拍に1回の間引き）
  });

  it("shortDense の segmentCharCadenceBeats は2で、shortSparse（1）と差が出る", () => {
    const dense = assignmentSegmentByReason(takeoverInput(), realRegistry(), ALL_SIGNALS, "shortDense");
    const sparse = assignmentSegmentByReason(takeoverInput(), realRegistry(), ALL_SIGNALS, "shortSparse");
    expect(assignmentOf(dense, EFFECT_ID.smash).segmentCharCadenceBeats).toBe(2);
    expect(assignmentOf(sparse, EFFECT_ID.smash).segmentCharCadenceBeats).toBe(1);
  });

  it("shortDense では smash の優先度補正に疾走補正が乗り、並べ替えの先頭が smash である", () => {
    const segment = assignmentSegmentByReason(takeoverInput(), fullRegistry(), ALL_SIGNALS, "shortDense");
    const smash = assignmentOf(segment, EFFECT_ID.smash);
    expect(smash.priorityAdjustment).toBe(EFFECT_PRIORITY_SHORT_DENSE_RUSH_ADJUST);
    const overlay = assignmentOf(segment, EFFECT_ID.emotionLoudness);
    expect(smash.priorityAdjustment).toBeGreaterThan(overlay.priorityAdjustment);
    expect(segment.assignments[0].grammar).toBe("smash");
  });

  it("shortSparse では smash と常時重ね層が同補正値でも、安定化により並べ替えの先頭が smash である", () => {
    const segment = assignmentSegmentByReason(takeoverInput(), fullRegistry(), ALL_SIGNALS, "shortSparse");
    expect(assignmentOf(segment, EFFECT_ID.smash).priorityAdjustment).toBe(0);
    expect(assignmentOf(segment, EFFECT_ID.emotionLoudness).priorityAdjustment).toBe(0);
    expect(segment.assignments[0].grammar).toBe("smash");
  });

  it("assignmentAt が文字セグメント内で segmentCharCadenceBeats を引ける", () => {
    const input = takeoverInput();
    const granularityPlan = buildGranularityPlan(input);
    const source = granularityPlan.segments.find((s) => s.reason === "shortDense");
    expect(source).toBeDefined();
    const plan = buildAssignmentPlan({ granularityPlan, registry: realRegistry(), signals: ALL_SIGNALS });
    const mid = ((source as GranularitySegment).startTimeMs + (source as GranularitySegment).endTimeMs) / 2;
    const segment = assignmentAt(plan, mid);
    expect(segment).not.toBeNull();
    expect((segment as SegmentAssignment).charCadenceBeats).toBe(2);
  });
});

// ============================================================
// 受け入れ基準3: 曲固有の決定や上書きを持たない
// ============================================================

describe("受け入れ基準3: 曲固有の決定や上書きを持たない", () => {
  it("同一入力で buildAssignmentPlan を2回呼ぶと深く等価（決定的）", () => {
    const input = takeoverInput();
    const granularityPlan = buildGranularityPlan(input);
    const planInput: AssignmentPlanInput = {
      granularityPlan,
      registry: fullRegistry(),
      signals: ALL_SIGNALS,
    };
    expect(buildAssignmentPlan(planInput)).toEqual(buildAssignmentPlan(planInput));
  });

  it("loudness を偽にすると longTone の verticalStretchSwirl が signalUnavailable になる", () => {
    const withLoud = assignmentSegmentByReason(longToneInput(), fullRegistry(), ALL_SIGNALS, "longTone");
    const withoutLoud = assignmentSegmentByReason(
      longToneInput(),
      fullRegistry(),
      { loudness: false, emotion: true, sectionBoundary: true },
      "longTone"
    );
    expect(assignmentOf(withLoud, EFFECT_ID.verticalStretchSwirl).status).toBe("active");
    expect(assignmentOf(withoutLoud, EFFECT_ID.verticalStretchSwirl).status).toBe("signalUnavailable");
  });

  it("必要信号を持たない演出（円状回転増殖・残像・カメラ）は3信号すべてを偽にしても active のまま", () => {
    const repeat = assignmentSegmentByReason(takeoverInput(), fullRegistry(), NO_SIGNALS, "repeat");
    expect(assignmentOf(repeat, EFFECT_ID.circularMultiply).status).toBe("active");
    expect(assignmentOf(repeat, EFFECT_ID.afterimageTrail).status).toBe("active");
    expect(assignmentOf(repeat, EFFECT_ID.depthFlight).status).toBe("active");
  });

  it("最小成立: 実レジストリ＋実TAKEOVERで構造健全、active は charSmash のみかつ短音系セグメントに限る", () => {
    const input = takeoverInput();
    const granularityPlan = buildGranularityPlan(input);
    const planInput: AssignmentPlanInput = {
      granularityPlan,
      registry: realRegistry(),
      signals: ALL_SIGNALS,
    };
    const plan = buildAssignmentPlan(planInput);
    expect(findAssignmentPlanIssues(plan, planInput)).toEqual([]);

    const shortReasons: ReadonlySet<GranularityReason> = new Set(["shortDense", "shortSparse"]);
    for (const segment of plan.segments) {
      for (const assignment of segment.assignments) {
        if (assignment.status === "active") {
          expect(assignment.effectId).toBe(EFFECT_ID.smash);
          expect(shortReasons.has(segment.reason)).toBe(true);
        }
      }
      // 短音系以外の主演出は実装待ち状態で割付意図が保持される。
      if (!shortReasons.has(segment.reason) && segment.granularity !== "fullscreen") {
        for (const assignment of segment.assignments) {
          expect(assignment.status).not.toBe("active");
        }
      }
    }
  });

  it("各セグメントの割付集合が既定規則の期待集合と一致し、規則外の識別名が現れない（findAssignmentPlanIssues が空）", () => {
    const input = takeoverInput();
    const granularityPlan = buildGranularityPlan(input);
    const planInput: AssignmentPlanInput = {
      granularityPlan,
      registry: fullRegistry(),
      signals: ALL_SIGNALS,
    };
    const plan = buildAssignmentPlan(planInput);
    expect(findAssignmentPlanIssues(plan, planInput)).toEqual([]);
  });
});

// ============================================================
// 構造検査と単位参照の保持
// ============================================================

describe("構造検査と単位参照の保持", () => {
  function planInputFor(input: GranularityInput, registry: EffectRegistry): AssignmentPlanInput {
    return { granularityPlan: buildGranularityPlan(input), registry, signals: ALL_SIGNALS };
  }

  it("規則表外の識別名を混入すると不整合を返す", () => {
    const planInput = planInputFor(takeoverInput(), fullRegistry());
    const plan = buildAssignmentPlan(planInput);
    const segment = plan.segments[0];
    const broken: AssignmentPlan = {
      segments: [
        {
          ...segment,
          assignments: [
            ...segment.assignments,
            {
              effectId: "effect.unknown",
              grammar: "smash",
              declaredTargetUnit: "char",
              applyGranularity: "char",
              priorityAdjustment: 0,
              segmentCharCadenceBeats: segment.granularity === "char" ? 1 : null,
              effectBeatCadenceBeats: null,
              status: "pendingImplementation",
            },
          ],
        },
        ...plan.segments.slice(1),
      ],
    };
    expect(findAssignmentPlanIssues(broken, planInput).length).toBeGreaterThan(0);
  });

  it("境界（時刻）を崩すと不整合を返す", () => {
    const planInput = planInputFor(takeoverInput(), fullRegistry());
    const plan = buildAssignmentPlan(planInput);
    const first = plan.segments[0];
    const broken: AssignmentPlan = {
      segments: [{ ...first, startTimeMs: first.startTimeMs + 1 }, ...plan.segments.slice(1)],
    };
    expect(findAssignmentPlanIssues(broken, planInput).length).toBeGreaterThan(0);
  });

  it("文字粒度でないセグメントで segmentCharCadenceBeats を持たせると不整合を返す", () => {
    const planInput = planInputFor(longToneInput(), fullRegistry());
    const plan = buildAssignmentPlan(planInput);
    const phraseSegment = plan.segments.find((s) => s.granularity === "phrase");
    expect(phraseSegment).toBeDefined();
    const target = phraseSegment as SegmentAssignment;
    const broken: AssignmentPlan = {
      segments: plan.segments.map((s) =>
        s === target
          ? {
              ...s,
              assignments: s.assignments.map((a, i) =>
                i === 0 ? { ...a, segmentCharCadenceBeats: 1 } : a
              ),
            }
          : s
      ),
    };
    expect(findAssignmentPlanIssues(broken, planInput).length).toBeGreaterThan(0);
  });

  it("二フレーズと無音の切れ目の入力で連結と被覆（先頭0・末尾は曲終了時刻）を満たす", () => {
    const input = twoPhraseWithGapInput();
    const planInput = planInputFor(input, fullRegistry());
    const plan = buildAssignmentPlan(planInput);
    expect(findAssignmentPlanIssues(plan, planInput)).toEqual([]);
    expect(plan.segments[0].startTimeMs).toBe(0);
    expect(plan.segments[plan.segments.length - 1].endTimeMs).toBe(input.songEndMs);
    for (let i = 1; i < plan.segments.length; i++) {
      expect(plan.segments[i].startTimeMs).toBe(plan.segments[i - 1].endTimeMs);
    }
  });

  it("元の粒度セグメントの unitRefs と phraseChunk を保持する（longSparse のチャンク分割を含む）", () => {
    const input = longSparseInput();
    const granularityPlan = buildGranularityPlan(input);
    const planInput: AssignmentPlanInput = {
      granularityPlan,
      registry: fullRegistry(),
      signals: ALL_SIGNALS,
    };
    const plan = buildAssignmentPlan(planInput);
    expect(plan.segments.length).toBe(granularityPlan.segments.length);
    for (let i = 0; i < plan.segments.length; i++) {
      expect(plan.segments[i].unitRefs).toEqual(granularityPlan.segments[i].unitRefs);
      expect(plan.segments[i].phraseChunk).toEqual(granularityPlan.segments[i].phraseChunk);
    }
    // longSparse はチャンク分割（phraseChunk 付き）を生むため、少なくとも1つは phraseChunk を持つ。
    expect(plan.segments.some((s) => s.phraseChunk !== null)).toBe(true);
  });

  it("signalAvailabilityFrom は最大声量と区間境界の有無、感情の明示引数から在不在を導く", () => {
    const input = takeoverInput();
    const available = signalAvailabilityFrom(input, true);
    expect(available.loudness).toBe(input.loudnessCurve.maxAmplitude > 0);
    expect(available.sectionBoundary).toBe(input.sectionBoundariesMs.length > 0);
    expect(available.emotion).toBe(true);
    expect(signalAvailabilityFrom(input, false).emotion).toBe(false);
  });

  it("resolveSegmentAssignments 単体でも主演出と常時重ね層を解決する", () => {
    const granularityPlan = buildGranularityPlan(middleInput());
    const source = granularityPlan.segments.find((s) => s.reason === "middle");
    expect(source).toBeDefined();
    const assignments = resolveSegmentAssignments(source as GranularitySegment, fullRegistry(), ALL_SIGNALS);
    const ids = assignments.map((a) => a.effectId);
    // middle は主演出なし。常時重ね層3件のみ。
    expect(ids).toContain(EFFECT_ID.emotionLoudness);
    expect(ids).toContain(EFFECT_ID.afterimageTrail);
    expect(ids).toContain(EFFECT_ID.depthFlight);
    expect(ids).not.toContain(EFFECT_ID.smash);
  });

  it("activeAssignmentsAt は範囲外で空、範囲内で active のみを返す", () => {
    const input = takeoverInput();
    const granularityPlan = buildGranularityPlan(input);
    const plan = buildAssignmentPlan({ granularityPlan, registry: realRegistry(), signals: ALL_SIGNALS });
    expect(activeAssignmentsAt(plan, -1)).toEqual([]);
    const shortDense = granularityPlan.segments.find((s) => s.reason === "shortDense");
    expect(shortDense).toBeDefined();
    const mid =
      ((shortDense as GranularitySegment).startTimeMs + (shortDense as GranularitySegment).endTimeMs) / 2;
    const active = activeAssignmentsAt(plan, mid);
    expect(active.length).toBe(1);
    expect(active[0].effectId).toBe(EFFECT_ID.smash);
  });
});
