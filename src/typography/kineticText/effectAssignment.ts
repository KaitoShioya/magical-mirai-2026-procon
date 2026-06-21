// 演出割付規則（Issue #132）。
// 表示粒度切替コントローラ #29 が出す表示粒度プランの各セグメント（粒度と判定理由を持つ時間区間）を入力に、
// docs/research/01-kinetic-typography.md 第9節・docs/idea/concept-final.md 第11節の既定対応へ写像し、
// セグメントごとに「演出識別名・既定優先度補正・適用粒度」を割り付ける曲非依存の純粋ロジック。
// 曲固有の採用・無効化・追加と最終優先度の確定は #33、複数演出の属性合成は #131 が行う。本ファイルは
// その手前の「割付（どの演出を当てるか）」だけを担う。
//
// 責務の境界:
//   - 判定理由から主演出への写像（曲非依存の静的データ）と、常時重ね層（別定数）を持つ。
//   - 演出の適用粒度は固定して破棄せず、設定可能フィールド applyGranularity として持ち、下流コントローラが
//     任意粒度へ上書きできる。演出が宣言する対象単位とセグメント粒度の食い違いを理由に割付を破棄しない。
//   - 必要信号の判定は登録済み演出が宣言する startCondition.requiredSignals のみを正とする。
//   - 状態（active / pendingImplementation / signalUnavailable）は診断とフィルタのための注記であり、
//     最終採否そのものではない（最終採否は #33、属性合成は #131）。
//
// 依存規則（docs/decisions/architecture.md 第5節、src/typography/kineticText/README.md 禁止依存節）:
//   判定・得点・時刻の論理を持たない。profiles・tools を import しない。three.js は持ち込まず型のみ。

import type {
  Granularity,
  GranularityReason,
  GranularitySegment,
  GranularityUnitRef,
  GranularityPlan,
  GranularityInput,
} from "./granularity";
import type {
  ConditionDimension,
  EffectTargetUnit,
  EffectRegistry,
  EffectElement,
} from "./effectElement";

// ---- 演出文法と識別名 ----

/** 演出文法の種別（第9節の6文法と常時重ね層）。識別名のタイプミスを型で防ぐ列挙。 */
export type EffectGrammar =
  | "smash" // 1文字1拍スマッシュ（#23）
  | "letterSpacingSpread" // 字間拡大一括（#24）
  | "circularMultiply" // 円状回転増殖（#25）
  | "verticalStretchSwirl" // 縦伸ばし・渦（#26）
  | "afterimageTrail" // 残像（#27）
  | "fadeBlackout" // 減衰・暗転（#28）
  | "emotionLoudness" // 感情声量から発光・色・動き（#30）
  | "depthFlight"; // 三次元カメラワーク（#32）

/**
 * 演出文法から演出識別名への対応。#24〜#32 の各実演出はこの識別名で登録する命名契約。
 * 文法名と識別名の後半は基本的に一致するが、smash だけは識別名が effect.charSmash である
 * （#23 charSmash に対応する歴史的命名）。写像はこの定数で行うため型安全性は保たれる。
 */
export const EFFECT_ID: Readonly<Record<EffectGrammar, string>> = {
  smash: "effect.charSmash",
  letterSpacingSpread: "effect.letterSpacingSpread",
  circularMultiply: "effect.circularMultiply",
  verticalStretchSwirl: "effect.verticalStretchSwirl",
  afterimageTrail: "effect.afterimageTrail",
  fadeBlackout: "effect.fadeBlackout",
  emotionLoudness: "effect.emotionLoudness",
  depthFlight: "effect.depthFlight",
};

/** 演出が宣言する想定対象単位。検査用擬似演出の対象単位を、各実演出が採るべき宣言値として記録する。 */
const EXPECTED_TARGET_UNIT: Readonly<Record<EffectGrammar, EffectTargetUnit>> = {
  smash: "char",
  letterSpacingSpread: "phrase",
  circularMultiply: "word",
  verticalStretchSwirl: "char",
  afterimageTrail: "char",
  fadeBlackout: "fullscreen",
  emotionLoudness: "char",
  depthFlight: "char",
};

// ---- 優先度補正定数 ----
// 「優先度は条件による補正のみ行う」を満たすため、#132 は絶対優先度を持たず、判定理由という条件に依存した
// 加算補正だけを返す。最終優先度は #33 が確定する。これらの定数は #132 が単独所有し横断参照されないため
// （tuning.ts 冒頭の規約「単一の所有モジュールが定まる値はその所有モジュールが定義する」に従い）本モジュールに置く。
// 値は実装後のプレイ検証で調整する暫定値とし、根拠を先に述べる。出典: 第9節・第11節。

/**
 * 高密度の短音（判定理由 shortDense）の文字演出の優先度補正。2拍に1回の間引き発火が数拍ごとの切替＝疾走感を
 * 生む区間であり、疾走の主役を常時重ね層より前面化する。値は、基準帯（補正0付近）より明確に上で、かつ
 * 強調帯（演出要素登録基盤の README が記す優先度の慣習で強調は100付近）へ届かない中間として20を初期値とする。暫定。
 */
export const EFFECT_PRIORITY_SHORT_DENSE_RUSH_ADJUST = 20;

/**
 * 曲の切れ目（判定理由 boundary）の暗転演出の優先度補正。切れ目の暗転を常時重ね層より前面化する。
 * 同じ理由で20を初期値とする。暫定。
 */
export const EFFECT_PRIORITY_BOUNDARY_BLACKOUT_ADJUST = 20;

// ---- 信号在不在 ----

/**
 * 曲が選択に供給できる信号の在不在。曲依存で欠けうる3次元だけを持つ。粒度・拍・継続時間の3次元は
 * 表示粒度プランとビート格子から常に導出でき欠けないため、常に充足とみなし、この型に含めない。
 */
export interface SignalAvailability {
  readonly loudness: boolean;
  readonly emotion: boolean;
  readonly sectionBoundary: boolean;
}

/** 常時得られる条件次元。必要信号の充足判定で常に満たすとみなす。 */
const ALWAYS_AVAILABLE_DIMENSIONS: ReadonlySet<ConditionDimension> = new Set<ConditionDimension>([
  "granularity",
  "beat",
  "duration",
]);

// ---- 規則 ----

/** 既定規則の1エントリ（曲非依存・静的・レジストリ非依存）。必要信号は持たない（演出自身の宣言を正とする）。 */
export interface DefaultEffectRule {
  readonly grammar: EffectGrammar;
  readonly effectId: string;
  readonly expectedTargetUnit: EffectTargetUnit;
  readonly defaultApplyGranularity: Granularity;
  readonly priorityAdjustment: number;
}

/** 規則を1件作る。識別名と想定対象単位は文法から引く。 */
function makeRule(
  grammar: EffectGrammar,
  defaultApplyGranularity: Granularity,
  priorityAdjustment: number
): DefaultEffectRule {
  return {
    grammar,
    effectId: EFFECT_ID[grammar],
    expectedTargetUnit: EXPECTED_TARGET_UNIT[grammar],
    defaultApplyGranularity,
    priorityAdjustment,
  };
}

/**
 * 判定理由から主演出への既定規則表。第9節「発声属性→演出文法」の各行を、granularity.ts が確定した判定理由へ
 * 割り当てる。対応の根拠を述べる。短音（shortDense・shortSparse）は第9節の「強い口調・短い音→スマッシュ」、
 * 連発（repeat）は「同一フレーズの連発→円状回転増殖」、ロングトーン（longTone）は「ロングトーン・シャウト→
 * 縦伸ばしと渦」、曲の切れ目（boundary）は「曲の切れ目→暗転」に対応する。長尺（longDense・longSparse）は
 * 第9節の「流れる連続フレーズ→フレーズ一括表示と字間拡大」を、granularity.ts の長尺2分類（高密度の流し込みと
 * 低密度のチャンク分割）へ割り当てたものである。既定の適用粒度はその判定理由の粒度に一致させる（後でコントローラが
 * 任意粒度へ上書き可能）。middle は第9節が中間の単語粒度に固有の文法を割り当てないため主演出を持たず、
 * 空配列とする（常時重ね層だけを受ける）。
 */
const REASON_RULES: Readonly<Record<GranularityReason, readonly DefaultEffectRule[]>> = {
  shortDense: [makeRule("smash", "char", EFFECT_PRIORITY_SHORT_DENSE_RUSH_ADJUST)],
  shortSparse: [makeRule("smash", "char", 0)],
  middle: [],
  longTone: [makeRule("verticalStretchSwirl", "phrase", 0)],
  repeat: [makeRule("circularMultiply", "phrase", 0)],
  longDense: [makeRule("letterSpacingSpread", "phrase", 0)],
  longSparse: [makeRule("letterSpacingSpread", "phrase", 0)],
  boundary: [makeRule("fadeBlackout", "fullscreen", EFFECT_PRIORITY_BOUNDARY_BLACKOUT_ADJUST)],
};

/**
 * 常時重ね層（画面全体以外の全セグメントへ重ねる演出）の既定規則。主演出の写像とは別に持つ。
 * 感情声量・残像・カメラの3つで、すべて既定適用粒度は文字。出典と選定の根拠を述べる。感情声量は
 * docs/research/01-kinetic-typography.md 第9節・docs/idea/concept-final.md 第11節の「声量を太さと大きさ、
 * 感情を色と動きへ写像する」に直接対応する。残像とカメラは、第11節の「粒度で複数の要素を重ねて組み合わせる」
 * 重ね合わせ方針に基づき、本作で常時重ねる層として選定した設計判断である（第11節がこの3演出を常時重ね層として
 * 列挙しているわけではない）。曲非依存の静的既定であり、曲固有の決定は持たない。
 */
export const DEFAULT_OVERLAY_RULES: readonly DefaultEffectRule[] = [
  makeRule("emotionLoudness", "char", 0),
  makeRule("afterimageTrail", "char", 0),
  makeRule("depthFlight", "char", 0),
];

/** 判定理由に対する既定規則（主演出のみ）を返す純写像。常時重ね層は DEFAULT_OVERLAY_RULES に別に持つ。 */
export function defaultRulesFor(reason: GranularityReason): readonly DefaultEffectRule[] {
  return REASON_RULES[reason];
}

// ---- 割付の型 ----

/** 演出が現時点で実演奏できるかの状態。割付意図は破棄せず状態で注記する。 */
export type EffectAssignmentStatus =
  | "active" // レジストリに実在し必要信号も満たす
  | "pendingImplementation" // 演出識別名が未登録（実演出が未実装）
  | "signalUnavailable"; // 登録済みだが必要信号を曲が供給できない

/** 1セグメントへ割り付けた1演出。 */
export interface EffectAssignment {
  readonly effectId: string;
  readonly grammar: EffectGrammar;
  /** 演出の宣言対象単位（active は登録実体の targetUnit、未実装は規則の expectedTargetUnit）。 */
  readonly declaredTargetUnit: EffectTargetUnit;
  /** 設定可能な適用粒度。既定は規則の defaultApplyGranularity、上書き指定があればその値。 */
  readonly applyGranularity: Granularity;
  /** #132 が担う条件補正のみ（最終優先度は #33 が確定）。 */
  readonly priorityAdjustment: number;
  /** 元セグメントの charCadenceBeats をそのまま持つ（文字粒度のときのみ非null。適用粒度ではなく元セグメント粒度で決まる）。 */
  readonly segmentCharCadenceBeats: number | null;
  /** 演出宣言由来（startCondition.beatCadence）。宣言の無い登録演出と未実装演出は null。 */
  readonly effectBeatCadenceBeats: number | null;
  readonly status: EffectAssignmentStatus;
}

/** 1セグメントへの割付結果。元の粒度セグメントの単位参照とチャンク情報を保持する。 */
export interface SegmentAssignment {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly granularity: Granularity;
  readonly reason: GranularityReason;
  readonly phraseIndex: number | null;
  readonly unitRefs: readonly GranularityUnitRef[];
  readonly phraseChunk: { readonly chunkIndex: number; readonly chunkCount: number } | null;
  readonly charCadenceBeats: number | null;
  /** 優先度補正の降順。同値は規則順（主演出が先、常時重ね層が後）で安定化。 */
  readonly assignments: readonly EffectAssignment[];
}

export interface AssignmentPlan {
  readonly segments: readonly SegmentAssignment[];
}

/** 適用粒度の上書き指定（コントローラが任意粒度を与える窓口）。 */
export type GranularityOverrides = Partial<Record<EffectGrammar, Granularity>>;

export interface AssignmentPlanInput {
  readonly granularityPlan: GranularityPlan;
  readonly registry: EffectRegistry;
  readonly signals: SignalAvailability;
  readonly granularityOverrides?: GranularityOverrides;
}

export interface AssignmentPlanIssue {
  readonly path: string;
  readonly message: string;
}

// ---- 信号在不在の導出 ----

/**
 * 曲データの実体有無から信号在不在を導く補助。声量の在不在は loudnessCurve.maxAmplitude が正か
 * （maxAmplitude > 0）で判定する。この1条件を必要十分とする理由：granularity.ts の声量判定が最大声量を
 * 正と前提し（最大声量0以下は声量データ無しとして扱う）、それに揃えて在不在の判断を一致させるためである。
 * 区間境界の在不在は sectionBoundariesMs が空でないかで判定する。GranularityInput は感情値を持たないため、
 * 感情の在不在は明示引数で受け取る（信号の導出元を偽らないため）。
 */
export function signalAvailabilityFrom(
  input: GranularityInput,
  emotionAvailable: boolean
): SignalAvailability {
  return {
    loudness: input.loudnessCurve.maxAmplitude > 0,
    emotion: emotionAvailable,
    sectionBoundary: input.sectionBoundariesMs.length > 0,
  };
}

// ---- 解決 ----

/** レジストリの一覧から識別名→演出実体の対応表を作る。get は未知の識別名で例外を投げるため存在確認に使わない。 */
function buildRegistryLookup(registry: EffectRegistry): Map<string, EffectElement> {
  const lookup = new Map<string, EffectElement>();
  for (const element of registry.list()) {
    lookup.set(element.id, element);
  }
  return lookup;
}

/**
 * 必要信号を満たすか。常時得られる3次元は常に満たすとみなし、曲依存の3次元のみ SignalAvailability で判定する。
 * requiredSignals が省略された演出は要求信号が無いとみなし、信号の在不在に関わらず満たす。
 */
function signalsSatisfied(
  required: readonly ConditionDimension[] | undefined,
  signals: SignalAvailability
): boolean {
  if (required === undefined) {
    return true;
  }
  for (const dimension of required) {
    if (ALWAYS_AVAILABLE_DIMENSIONS.has(dimension)) {
      continue;
    }
    if (dimension === "loudness" && !signals.loudness) {
      return false;
    }
    if (dimension === "emotion" && !signals.emotion) {
      return false;
    }
    if (dimension === "sectionBoundary" && !signals.sectionBoundary) {
      return false;
    }
  }
  return true;
}

/** 登録演出の発火間隔を取り出す。宣言が無い（undefined・null）ときは null。 */
function effectBeatCadenceOf(element: EffectElement): number | null {
  const cadence = element.startCondition.beatCadence;
  return cadence === undefined || cadence === null ? null : cadence;
}

/** 演出の実在と必要信号から、状態・宣言対象単位・発火間隔を導く。割付の生成と検査が同じ規則を共有するため切り出す。 */
interface ElementState {
  readonly status: EffectAssignmentStatus;
  readonly declaredTargetUnit: EffectTargetUnit;
  readonly effectBeatCadenceBeats: number | null;
}

function resolveElementState(
  rule: DefaultEffectRule,
  element: EffectElement | undefined,
  signals: SignalAvailability
): ElementState {
  if (element === undefined) {
    // 未実装演出は信号に関わらず実装待ち状態。宣言対象単位は規則の想定値、発火間隔は取れないため null。
    return {
      status: "pendingImplementation",
      declaredTargetUnit: rule.expectedTargetUnit,
      effectBeatCadenceBeats: null,
    };
  }
  return {
    status: signalsSatisfied(element.startCondition.requiredSignals, signals)
      ? "active"
      : "signalUnavailable",
    declaredTargetUnit: element.targetUnit,
    effectBeatCadenceBeats: effectBeatCadenceOf(element),
  };
}

/** 1つの規則を1つの割付へ解決する。 */
function toAssignment(
  rule: DefaultEffectRule,
  segment: GranularitySegment,
  lookup: Map<string, EffectElement>,
  signals: SignalAvailability,
  overrides: GranularityOverrides | undefined
): EffectAssignment {
  const state = resolveElementState(rule, lookup.get(rule.effectId), signals);
  return {
    effectId: rule.effectId,
    grammar: rule.grammar,
    declaredTargetUnit: state.declaredTargetUnit,
    applyGranularity: overrides?.[rule.grammar] ?? rule.defaultApplyGranularity,
    priorityAdjustment: rule.priorityAdjustment,
    // 元セグメントの charCadenceBeats を演出によらず一律に入れる（文字粒度のときのみ非null）。
    segmentCharCadenceBeats: segment.charCadenceBeats,
    effectBeatCadenceBeats: state.effectBeatCadenceBeats,
    status: state.status,
  };
}

/** 1セグメントの規則（主演出と、画面全体以外なら常時重ね層）を連結して返す。 */
function rulesForSegment(segment: GranularitySegment): DefaultEffectRule[] {
  const rules: DefaultEffectRule[] = [...defaultRulesFor(segment.reason)];
  if (segment.granularity !== "fullscreen") {
    rules.push(...DEFAULT_OVERLAY_RULES);
  }
  return rules;
}

/**
 * 1セグメントの割付を解決する。主演出を先、常時重ね層を後に連結した配列を作り、priorityAdjustment の降順で
 * 安定ソートする。安定ソートが同じ補正値の要素の相対順序を保つため、連結順が同補正値での最終順序を決める。
 */
function resolveWithLookup(
  segment: GranularitySegment,
  lookup: Map<string, EffectElement>,
  signals: SignalAvailability,
  overrides: GranularityOverrides | undefined
): EffectAssignment[] {
  const assignments = rulesForSegment(segment).map((rule) =>
    toAssignment(rule, segment, lookup, signals, overrides)
  );
  // Array.prototype.sort は安定（ECMAScript 2019 以降）。連結順を初期順序として保つ。
  return assignments.sort((a, b) => b.priorityAdjustment - a.priorityAdjustment);
}

/**
 * 1セグメント＋レジストリ＋信号在不在＋適用粒度上書きから、割付の群を解決する純粋関数。
 * 主演出（defaultRulesFor）と常時重ね層（画面全体以外で DEFAULT_OVERLAY_RULES）を合成する。
 */
export function resolveSegmentAssignments(
  segment: GranularitySegment,
  registry: EffectRegistry,
  signals: SignalAvailability,
  overrides?: GranularityOverrides
): EffectAssignment[] {
  return resolveWithLookup(segment, buildRegistryLookup(registry), signals, overrides);
}

/** 1つの粒度セグメントを1つの割付セグメントへ変換する。 */
function toSegmentAssignment(
  segment: GranularitySegment,
  lookup: Map<string, EffectElement>,
  signals: SignalAvailability,
  overrides: GranularityOverrides | undefined
): SegmentAssignment {
  return {
    startTimeMs: segment.startTimeMs,
    endTimeMs: segment.endTimeMs,
    granularity: segment.granularity,
    reason: segment.reason,
    phraseIndex: segment.phraseIndex,
    unitRefs: segment.unitRefs,
    phraseChunk: segment.phraseChunk,
    charCadenceBeats: segment.charCadenceBeats,
    assignments: resolveWithLookup(segment, lookup, signals, overrides),
  };
}

/**
 * 表示粒度プラン全体を一度走査して割付プランを作る。決定的で、再生中の瞬時値に依存しない。
 * 割付プランのセグメントは粒度プランのセグメントと1対1で対応し、時間範囲を変えない（境界不変）。
 */
export function buildAssignmentPlan(input: AssignmentPlanInput): AssignmentPlan {
  const lookup = buildRegistryLookup(input.registry);
  const segments = input.granularityPlan.segments.map((segment) =>
    toSegmentAssignment(segment, lookup, input.signals, input.granularityOverrides)
  );
  return { segments };
}

// ---- 時刻探索 ----

/**
 * 再生位置を含む割付セグメントを二分探索で返す（granularityAt と同形・同じ境界規則）。
 * セグメントが無いとき、または範囲外（最初の開始より前、最後の終了以降）は null を返す。
 */
export function assignmentAt(plan: AssignmentPlan, positionMs: number): SegmentAssignment | null {
  const segments = plan.segments;
  if (segments.length === 0) {
    return null;
  }
  if (positionMs < segments[0].startTimeMs || positionMs >= segments[segments.length - 1].endTimeMs) {
    return null;
  }
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = segments[mid];
    if (positionMs < segment.startTimeMs) {
      high = mid - 1;
    } else if (positionMs >= segment.endTimeMs) {
      low = mid + 1;
    } else {
      return segment;
    }
  }
  return null;
}

/** 再生位置の、現時点で実演奏できる（active な）割付だけを返す駆動側向けの補助。 */
export function activeAssignmentsAt(
  plan: AssignmentPlan,
  positionMs: number
): readonly EffectAssignment[] {
  const segment = assignmentAt(plan, positionMs);
  if (segment === null) {
    return [];
  }
  return segment.assignments.filter((assignment) => assignment.status === "active");
}

// ---- 整合検査 ----

const GRANULARITY_VALUES: ReadonlySet<string> = new Set(["char", "word", "phrase", "fullscreen"]);
const REASON_VALUES: ReadonlySet<string> = new Set([
  "boundary",
  "longTone",
  "repeat",
  "longDense",
  "longSparse",
  "shortDense",
  "shortSparse",
  "middle",
]);
const GRAMMAR_VALUES: ReadonlySet<string> = new Set(Object.keys(EFFECT_ID));
const STATUS_VALUES: ReadonlySet<string> = new Set([
  "active",
  "pendingImplementation",
  "signalUnavailable",
]);

/** セグメントの期待割付識別名集合（画面全体は主演出のみ、それ以外は主演出と常時重ね層の合併）。 */
function expectedEffectIds(segment: SegmentAssignment): Set<string> {
  const ids = new Set<string>();
  for (const rule of defaultRulesFor(segment.reason)) {
    ids.add(rule.effectId);
  }
  if (segment.granularity !== "fullscreen") {
    for (const rule of DEFAULT_OVERLAY_RULES) {
      ids.add(rule.effectId);
    }
  }
  return ids;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * 割付プランの構造的な整合性を検査し、不整合の一覧を返す（空なら整合）。例外は投げない。
 * 品質判断はせず構造の正しさに限定する（findGranularityPlanIssues に倣う）。
 */
export function findAssignmentPlanIssues(
  plan: AssignmentPlan,
  input: AssignmentPlanInput
): AssignmentPlanIssue[] {
  const issues: AssignmentPlanIssue[] = [];
  const planSegments = plan.segments;
  const sourceSegments = input.granularityPlan.segments;
  const lookup = buildRegistryLookup(input.registry);

  // 1対1境界不変: 割付セグメント数と粒度プランのセグメント数が一致する。
  if (planSegments.length !== sourceSegments.length) {
    issues.push({
      path: "segments",
      message: "割付セグメント数が表示粒度プランのセグメント数と一致しない",
    });
  }

  const count = Math.min(planSegments.length, sourceSegments.length);
  for (let i = 0; i < count; i++) {
    const segment = planSegments[i];
    const source = sourceSegments[i];
    const path = `segments[${i}]`;

    if (!Number.isFinite(segment.startTimeMs) || !Number.isFinite(segment.endTimeMs)) {
      issues.push({ path, message: "時刻が有限の数値でない" });
    }
    if (segment.endTimeMs <= segment.startTimeMs) {
      issues.push({ path, message: "終了時刻が開始時刻以下で長さがゼロまたは負になっている" });
    }
    // 境界不変: 時刻・粒度・判定理由が粒度プランの対応セグメントと一致する。
    if (
      segment.startTimeMs !== source.startTimeMs ||
      segment.endTimeMs !== source.endTimeMs ||
      segment.granularity !== source.granularity ||
      segment.reason !== source.reason
    ) {
      issues.push({ path, message: "表示粒度プランの対応セグメントと時刻・粒度・判定理由が一致しない" });
    }
    if (!GRANULARITY_VALUES.has(segment.granularity)) {
      issues.push({ path, message: "粒度が4つの値のいずれでもない" });
    }
    if (!REASON_VALUES.has(segment.reason)) {
      issues.push({ path, message: "判定理由が定義済みの値のいずれでもない" });
    }

    // このセグメントの期待規則（主演出と、画面全体以外なら常時重ね層）を識別名で引ける表にする。
    const expectedRulesById = new Map<string, DefaultEffectRule>();
    for (const rule of defaultRulesFor(segment.reason)) {
      expectedRulesById.set(rule.effectId, rule);
    }
    if (segment.granularity !== "fullscreen") {
      for (const rule of DEFAULT_OVERLAY_RULES) {
        expectedRulesById.set(rule.effectId, rule);
      }
    }

    // 割付ごとの検査。
    for (let j = 0; j < segment.assignments.length; j++) {
      const assignment = segment.assignments[j];
      const apath = `${path}.assignments[${j}]`;

      // 語彙と形の検査（規則表外の識別名にも適用する基礎検査）。
      if (!GRAMMAR_VALUES.has(assignment.grammar)) {
        issues.push({ path: apath, message: "文法が定義済みの値でない" });
      }
      if (assignment.effectId !== EFFECT_ID[assignment.grammar]) {
        issues.push({ path: apath, message: "識別名が文法に対応する EFFECT_ID と一致しない" });
      }
      if (!Number.isFinite(assignment.priorityAdjustment)) {
        issues.push({ path: apath, message: "優先度補正が有限数でない" });
      }
      if (assignment.effectBeatCadenceBeats !== null && !isPositiveInteger(assignment.effectBeatCadenceBeats)) {
        issues.push({ path: apath, message: "effectBeatCadenceBeats が正の整数または null でない" });
      }
      if (!STATUS_VALUES.has(assignment.status)) {
        issues.push({ path: apath, message: "状態が定義済みの値でない" });
      }

      // segmentCharCadenceBeats は元セグメントの charCadenceBeats と値まで一致する（形だけでなく値を照合する）。
      if (assignment.segmentCharCadenceBeats !== source.charCadenceBeats) {
        issues.push({ path: apath, message: "segmentCharCadenceBeats が元セグメントの charCadenceBeats と一致しない" });
      }

      // 規則に対応する割付は、優先度補正・適用粒度・状態・宣言対象単位・発火間隔が規則と実体から導かれる値と一致する。
      // 規則表外の識別名（後段の集合一致が別に検出する）は規則を引けないため、この詳細検査の対象から外す。
      const rule = expectedRulesById.get(assignment.effectId);
      if (rule !== undefined) {
        if (assignment.priorityAdjustment !== rule.priorityAdjustment) {
          issues.push({ path: apath, message: "優先度補正が既定規則の値と一致しない" });
        }
        const expectedApplyGranularity = input.granularityOverrides?.[assignment.grammar] ?? rule.defaultApplyGranularity;
        if (assignment.applyGranularity !== expectedApplyGranularity) {
          issues.push({ path: apath, message: "適用粒度が規則の既定値または上書き値と一致しない" });
        }
        const expected = resolveElementState(rule, lookup.get(assignment.effectId), input.signals);
        if (assignment.status !== expected.status) {
          issues.push({ path: apath, message: "状態が演出の実在と必要信号から導かれる状態と一致しない" });
        }
        if (assignment.declaredTargetUnit !== expected.declaredTargetUnit) {
          issues.push({ path: apath, message: "declaredTargetUnit が期待値（登録実体または規則の想定）と一致しない" });
        }
        if (assignment.effectBeatCadenceBeats !== expected.effectBeatCadenceBeats) {
          issues.push({ path: apath, message: "effectBeatCadenceBeats が期待値（登録演出の beatCadence または null）と一致しない" });
        }
      }
    }

    // 並べ替えが優先度補正の降順か（同値は許す）。
    for (let j = 1; j < segment.assignments.length; j++) {
      if (segment.assignments[j].priorityAdjustment > segment.assignments[j - 1].priorityAdjustment) {
        issues.push({ path, message: "割付が優先度補正の降順に整列していない" });
        break;
      }
    }

    // 期待集合との一致（過不足が無いこと）。
    const expectedIds = expectedEffectIds(segment);
    const actualIds = new Set(segment.assignments.map((assignment) => assignment.effectId));
    for (const id of expectedIds) {
      if (!actualIds.has(id)) {
        issues.push({ path, message: `既定規則の演出 ${id} が割付に存在しない` });
      }
    }
    for (const id of actualIds) {
      if (!expectedIds.has(id)) {
        issues.push({ path, message: `規則に無い演出 ${id} が割付に存在する` });
      }
    }
  }

  return issues;
}
