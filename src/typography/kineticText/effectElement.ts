// 演出要素の登録・共通インターフェース基盤（Issue #130）。
// 各演出要素は、対象単位・開始条件・操作する属性・既定優先度・費用を宣言し、GlyphHandle を直接操作せず
// 属性寄与を返す。合成（#131）・割付（#132）・曲固有の上書き（#33）・個別演出（#23・#24〜#28・#30・#32）は
// 本ファイルに含めない。本ファイルは契約の型と、登録の仕組みと、必須項目の実行時検証だけを担う。
//
// 依存規則（docs/decisions/architecture.md §5）: 判定・得点・時刻の論理を持たない。profiles・tools を
// import しない。three.js は持ち込まず、型のみを既存の共有型から取り込む。

import type { Granularity } from "./granularity";
import type { Vector3Like, DeformKind, DeformParams } from "./types";

// ---- 対象単位 ----

/** 演出が対象とする表示単位。文字・単語・フレーズ・画面全体。既存の Granularity を別名で再利用する。 */
export type EffectTargetUnit = Granularity;

const TARGET_UNITS: readonly EffectTargetUnit[] = ["char", "word", "phrase", "fullscreen"];

// ---- 操作する属性の宣言（区別付きの静的目録）----

/** 位置・回転・大きさ・字間の寄与の層。主変形＝その単位の主たる動き、揺らぎ＝小さな範囲の加算。 */
export type TransformLayer = "main" | "jitter";
/** 色の寄与の層。主張色＝前面に出す色、補助色＝弱く混ぜる色。 */
export type ColorLayer = "assertive" | "auxiliary";

const TRANSFORM_LAYERS: readonly TransformLayer[] = ["main", "jitter"];
const COLOR_LAYERS: readonly ColorLayer[] = ["assertive", "auxiliary"];

/** 演出が触れてよい寄与チャネルの宣言。各チャネルは任意で、無指定はそのチャネルに触れないことを表す。 */
export interface OperatedAttributes {
  readonly position?: TransformLayer;
  readonly rotation?: TransformLayer;
  /** 縦横独立の大きさ。 */
  readonly scale?: TransformLayer;
  /** 字間（単語・フレーズ単位）。 */
  readonly letterSpacing?: TransformLayer;
  readonly color?: ColorLayer;
  readonly opacity?: boolean;
  readonly glow?: boolean;
  readonly deform?: boolean;
  readonly duplication?: boolean;
  /** 矩形の切り抜きを操作するか。 */
  readonly clip?: boolean;
}

// ---- 費用の宣言 ----

/** 費用算出の入力。対象単位に含まれる文字数。 */
export interface EffectCostInput {
  readonly unitGlyphCount: number;
}

/**
 * 演出1回の発動が、ある単位に対して要する最大費用。estimateCost が、与えた文字数で発生し得る最大値
 * （保守的上限）を返す。演出内部の最大複製数を織り込むため、複製数は入力に取らない。
 */
export interface EffectCost {
  /** 必要追加文字数（複製で増える文字の最大数）。 */
  readonly extraGlyphs: number;
  /** 1フレーム内のGSAP更新対象の最大数。 */
  readonly gsapTargetsPerFrame: number;
  /** troika同期回数の見込み（文字配置の再計算の最大回数）。 */
  readonly troikaSyncs: number;
  /** 発光対象の最大数（ブルーム閾値を超える文字の数）。 */
  readonly glowTargets: number;
  /** 複製の有無。 */
  readonly duplication: boolean;
}

// ---- 既定優先度 ----

/** 既定優先度。#132 が条件で補正し #33 が曲固有で上書きするため、段階の列挙ではなく素の数値とする。 */
export type EffectPriority = number;

// ---- 開始条件 ----

/** 単位の生存周期における発火位置。 */
export type UnitLifecyclePhase = "onUnitStart" | "duringUnit" | "onUnitEnd";

/** 割付（#132）が用いる条件次元。docs/research/01-kinetic-typography.md §9 の6次元。 */
export type ConditionDimension =
  | "granularity"
  | "beat"
  | "loudness"
  | "emotion"
  | "duration"
  | "sectionBoundary";

const UNIT_LIFECYCLE_PHASES: readonly UnitLifecyclePhase[] = ["onUnitStart", "duringUnit", "onUnitEnd"];
const CONDITION_DIMENSIONS: readonly ConditionDimension[] = [
  "granularity",
  "beat",
  "loudness",
  "emotion",
  "duration",
  "sectionBoundary",
];

export interface StartCondition {
  readonly trigger: UnitLifecyclePhase;
  /** 発火の拍間隔。正の整数。1は毎拍、2は2拍に1回。無指定は拍に同期しない。 */
  readonly beatCadence?: number | null;
  /** 欠けると意味ある寄与を作れない信号。#132 はこれを欠く単位でこの演出を選ばない。 */
  readonly requiredSignals?: readonly ConditionDimension[];
  /** 選択を映えさせる助言の信号。必須ではない。 */
  readonly selectionHints?: readonly ConditionDimension[];
}

// ---- 属性寄与（演出が返し、#131 が合成する値）----

/** 位置・回転の寄与。主変形は絶対値、揺らぎは加算。回転の値はオイラー角3成分（ラジアン）。 */
export interface TransformContribution {
  readonly layer: TransformLayer;
  readonly value: Vector3Like;
}
/** 大きさ。縦横独立の3成分。一律倍率は3成分を等しくする。主変形は絶対倍率、揺らぎは加算の差分。 */
export interface ScaleContribution {
  readonly layer: TransformLayer;
  readonly value: Vector3Like;
}
/** 字間。主変形は絶対値、揺らぎは加算の差分（ワールド単位）。 */
export interface LetterSpacingContribution {
  readonly layer: TransformLayer;
  readonly value: number;
}
export interface ColorContribution {
  readonly layer: ColorLayer;
  /** 16進数の色（GlyphHandle.setColor と同じ）。 */
  readonly color: number;
  /** 補助色の混合比 0以上1以下。主張色では無視する。 */
  readonly weight?: number;
}
/**
 * 発光。合成済みの塗り色の輝度をブルーム閾値より上へ引き上げる要求。独立した描画値ではない。
 * intensity は0以上1以下。0はブルーム閾値ちょうど（最小の発光）、1は線形輝度1.0（最大）。
 */
export interface GlowContribution {
  readonly intensity: number;
}
/** 透明度。0以上1以下、乗算で合成。 */
export interface OpacityContribution {
  readonly factor: number;
}
/**
 * 変形した塊全体（1枚の変形テキスト）の配置。変形は1文字ごとの幾何チャネルと排他のため、塊の移動・拡大は
 * 1文字ごとの位置・大きさでは表せない。塊配置として変形寄与の内側に持たせ、合成器・適用層を通して変形取っ手の
 * 位置・大きさへ反映する（渦状スキャッター転換で塊を巻き込み縮める等に使う。設計書§2.3.4）。
 */
export interface DeformMassPlacement {
  /** 塊全体の位置（ワールド座標）。無指定は基準位置。 */
  readonly position?: Vector3Like;
  /** 塊全体の大きさ（縦横独立の絶対倍率）。無指定は等倍。各成分は有限かつ正。 */
  readonly scale?: Vector3Like;
}

export interface DeformContribution {
  readonly kind: DeformKind;
  readonly params: DeformParams;
  /** 変形した塊全体の配置。変形寄与だけが持てる（型の上で非変形寄与は持てない）。 */
  readonly massPlacement?: DeformMassPlacement;
}
/** 1つの写しの変換。位置のずれ、任意の不透明度、任意の一律倍率。 */
export interface DuplicateCopy {
  readonly offset: Vector3Like;
  /** 0以上1以下。残像の減衰に使う。 */
  readonly opacity?: number;
  /** 一律倍率。無指定は1。 */
  readonly scale?: number;
}
export interface DuplicationContribution {
  /** 円状・残像・一点重ね。 */
  readonly layout: "polar" | "trail" | "stack";
  /** 写しごとの変換。長さが写しの数。 */
  readonly copies: readonly DuplicateCopy[];
  /** 意味を失う最小写し数。#131 の縮退の下限。 */
  readonly minCount: number;
}

/**
 * 1単位・1時刻の属性寄与。宣言した操作属性の範囲内の項目だけを持つ。各フィールドは任意で、無指定は
 * そのチャネルの合成規則における単位元（位置と回転と大きさと字間と色は寄与なし、透明度は係数1、複製は0個）。
 *
 * 発信時の不変条件（#131 が検査し、findContributionIssues で確認できる）:
 * 1. deform と、position・rotation・scale・letterSpacing・duplication のいずれかを同時に含めない
 *    （変形は単一の変形テキストへ回り、1文字ごとの取っ手や複製を持てないため）。
 * 2. 含む項目は、宣言した操作属性 operates の範囲内に収める。
 */
/**
 * 矩形の切り抜き（文字のローカル座標系。最小が最大以下）。部首分解・縦横ブラインド近似に使う（設計書§5.3/§5.5）。
 * troika の clipRect と同じ並び [minX, minY, maxX, maxY] に対応する。
 */
export interface ClipContribution {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface AttributeContribution {
  readonly position?: TransformContribution;
  readonly rotation?: TransformContribution;
  readonly scale?: ScaleContribution;
  readonly letterSpacing?: LetterSpacingContribution;
  readonly color?: ColorContribution;
  readonly opacity?: OpacityContribution;
  readonly glow?: GlowContribution;
  readonly deform?: DeformContribution;
  readonly duplication?: DuplicationContribution;
  /** 矩形の切り抜き（部首分解・縦横ブラインド近似）。 */
  readonly clip?: ClipContribution;
}

// ---- 評価コンテキスト ----

/**
 * 演出が寄与を作るために受け取る入力。GlyphHandle は含めない（演出は寄与を返すだけで文字を直接操作しない）。
 * 条件次元と評価コンテキストの対応: granularity→unit, beat→beatPhase, loudness→loudness, emotion→emotion,
 * duration→unitEndMs−unitStartMs（導出）, sectionBoundary→atSectionBoundary。任意の条件フィールドは
 * 駆動側（#131・#132）が満たす。将来の信号は任意フィールドの追加（後方互換）で対応する。
 */
export interface EffectContext {
  readonly gameTimeMs: number;
  readonly unit: EffectTargetUnit;
  readonly unitStartMs: number;
  readonly unitEndMs: number;
  /** 単位の文字内容。画面全体は空文字。 */
  readonly text: string;
  /** 単位の文字数。画面全体は0。 */
  readonly unitGlyphCount: number;
  readonly phraseIndex: number | null;
  readonly wordIndex?: number;
  readonly charIndex?: number;
  /** 現在の拍の中での進行 0以上1以下。 */
  readonly beatPhase?: number;
  /** 正規化した声量 0以上1以下。 */
  readonly loudness?: number;
  /** 正規化した感情（取得できる場合）。 */
  readonly emotion?: number;
  /** 区間境界の近傍か。 */
  readonly atSectionBoundary?: boolean;
  /**
   * その単位の自然な基準位置（世界座標）。位置の主変形を絶対値で出す演出（軸の直線移動・奥行き飛び込み）が、
   * 文字の自然な配置へ着地するために使う。駆動側が各単位の世界座標で充填する。合成器が受け取る
   * ComposeInput.basePosition と同値を供給する（位置の主変形が無いときの起点と、演出内部の静止位置を一致させる）。
   */
  readonly basePosition?: Vector3Like;
}

// ---- 演出要素のインターフェース ----

export interface EffectElement {
  readonly id: string;
  readonly displayName: string;
  readonly targetUnit: EffectTargetUnit;
  readonly startCondition: StartCondition;
  readonly operates: OperatedAttributes;
  /** 必須（受け入れ基準2）。 */
  readonly defaultPriority: EffectPriority;
  /** 単位の文字数から最大費用を求める。必須（受け入れ基準2）。 */
  estimateCost(input: EffectCostInput): EffectCost;
  /** 純粋関数。副作用と文字操作を持たない。宣言した操作属性の範囲内の寄与だけを返す。寄与が無ければ null。 */
  evaluate(ctx: EffectContext): AttributeContribution | null;
}

// ---- 検証 ----

export interface EffectElementIssue {
  readonly path: string;
  readonly message: string;
}

function isFiniteNonNegative(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** 3成分すべてが有限の数値か（符号は問わない）。塊の位置の検査に使う。 */
function isFiniteVector(value: Vector3Like): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

/** 3成分すべてが有限かつ正か。塊の大きさの検査に使う（0や負は描画が壊れるため）。 */
function isFinitePositiveVector(value: Vector3Like): boolean {
  return isFiniteVector(value) && value.x > 0 && value.y > 0 && value.z > 0;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** EffectCost が5項目を正しい型（duplication は真偽、他は0以上の有限数）で持つかを検査する。 */
function findCostIssues(cost: unknown, path: string): EffectElementIssue[] {
  const issues: EffectElementIssue[] = [];
  if (typeof cost !== "object" || cost === null) {
    issues.push({ path, message: "費用がオブジェクトではありません。" });
    return issues;
  }
  const c = cost as Record<string, unknown>;
  if (!isFiniteNonNegative(c.extraGlyphs)) {
    issues.push({ path: `${path}.extraGlyphs`, message: "必要追加文字数は0以上の有限数である必要があります。" });
  }
  if (!isFiniteNonNegative(c.gsapTargetsPerFrame)) {
    issues.push({ path: `${path}.gsapTargetsPerFrame`, message: "GSAP更新対象数は0以上の有限数である必要があります。" });
  }
  if (!isFiniteNonNegative(c.troikaSyncs)) {
    issues.push({ path: `${path}.troikaSyncs`, message: "troika同期回数は0以上の有限数である必要があります。" });
  }
  if (!isFiniteNonNegative(c.glowTargets)) {
    issues.push({ path: `${path}.glowTargets`, message: "発光対象数は0以上の有限数である必要があります。" });
  }
  if (typeof c.duplication !== "boolean") {
    issues.push({ path: `${path}.duplication`, message: "複製の有無は真偽値である必要があります。" });
  }
  return issues;
}

const COST_PROBE_INPUTS: readonly EffectCostInput[] = [{ unitGlyphCount: 1 }, { unitGlyphCount: 16 }];

/**
 * 演出要素の不整合一覧を返す（空＝正当）。register はこれを呼び、空でなければ例外を投げる。
 * 寄与の発信時の不変条件（変形排他・寄与が操作属性の範囲内）は評価の実行を要するため、ここでは検査せず
 * #131 と findContributionIssues が担う。
 */
export function validateEffectElement(element: EffectElement): EffectElementIssue[] {
  const issues: EffectElementIssue[] = [];

  if (typeof element.id !== "string" || element.id.length === 0) {
    issues.push({ path: "id", message: "識別子は空でない文字列である必要があります。" });
  }
  if (!TARGET_UNITS.includes(element.targetUnit)) {
    issues.push({ path: "targetUnit", message: "対象単位は char・word・phrase・fullscreen のいずれかである必要があります。" });
  }
  if (typeof element.defaultPriority !== "number" || !Number.isFinite(element.defaultPriority)) {
    issues.push({ path: "defaultPriority", message: "既定優先度は有限の数値である必要があります。" });
  }

  // 操作属性の層の列挙。
  const op = element.operates;
  if (typeof op !== "object" || op === null) {
    issues.push({ path: "operates", message: "操作する属性の宣言がオブジェクトではありません。" });
  } else {
    for (const key of ["position", "rotation", "scale", "letterSpacing"] as const) {
      const layer = op[key];
      if (layer !== undefined && !TRANSFORM_LAYERS.includes(layer)) {
        issues.push({ path: `operates.${key}`, message: "層は main・jitter のいずれかである必要があります。" });
      }
    }
    if (op.color !== undefined && !COLOR_LAYERS.includes(op.color)) {
      issues.push({ path: "operates.color", message: "色の層は assertive・auxiliary のいずれかである必要があります。" });
    }
    for (const key of ["opacity", "glow", "deform", "duplication"] as const) {
      const flag = op[key];
      if (flag !== undefined && typeof flag !== "boolean") {
        issues.push({ path: `operates.${key}`, message: "真偽値である必要があります。" });
      }
    }
  }

  // 開始条件。
  const sc = element.startCondition;
  if (typeof sc !== "object" || sc === null) {
    issues.push({ path: "startCondition", message: "開始条件がオブジェクトではありません。" });
  } else {
    if (!UNIT_LIFECYCLE_PHASES.includes(sc.trigger)) {
      issues.push({ path: "startCondition.trigger", message: "発火位置は onUnitStart・duringUnit・onUnitEnd のいずれかである必要があります。" });
    }
    if (sc.beatCadence !== undefined && sc.beatCadence !== null && !isPositiveInteger(sc.beatCadence)) {
      issues.push({ path: "startCondition.beatCadence", message: "拍の刻みは正の整数である必要があります。" });
    }
    for (const key of ["requiredSignals", "selectionHints"] as const) {
      const list = sc[key];
      if (list !== undefined) {
        if (!Array.isArray(list)) {
          issues.push({ path: `startCondition.${key}`, message: "条件次元の配列である必要があります。" });
        } else {
          for (const dim of list) {
            if (!CONDITION_DIMENSIONS.includes(dim)) {
              issues.push({ path: `startCondition.${key}`, message: `未知の条件次元です: ${String(dim)}` });
            }
          }
        }
      }
    }
  }

  // 費用（必須項目として機能する）。代表入力2点で5項目の型を検査する。
  if (typeof element.estimateCost !== "function") {
    issues.push({ path: "estimateCost", message: "費用算出は関数である必要があります。" });
  } else {
    for (const input of COST_PROBE_INPUTS) {
      let cost: EffectCost | undefined;
      try {
        cost = element.estimateCost(input);
      } catch (error) {
        issues.push({
          path: "estimateCost",
          message: `費用算出が文字数${input.unitGlyphCount}で例外を投げました: ${String(error)}`,
        });
        continue;
      }
      issues.push(...findCostIssues(cost, `estimateCost(${input.unitGlyphCount})`));

      // 宣言と費用の整合（双方向）。operates.duplication と費用の duplication は一致する。
      if (typeof cost === "object" && cost !== null && typeof cost.duplication === "boolean" && typeof op === "object" && op !== null) {
        const declaresDuplication = op.duplication === true;
        if (declaresDuplication !== cost.duplication) {
          issues.push({
            path: `estimateCost(${input.unitGlyphCount}).duplication`,
            message: "operates.duplication と費用の duplication が一致しません（双方向で一致する必要があります）。",
          });
        }
        // 複製を宣言するなら必要追加文字数が正。
        if (cost.duplication && isFiniteNonNegative(cost.extraGlyphs) && cost.extraGlyphs <= 0) {
          issues.push({
            path: `estimateCost(${input.unitGlyphCount}).extraGlyphs`,
            message: "複製を宣言するなら必要追加文字数は正である必要があります。",
          });
        }
      }
    }
  }

  if (typeof element.evaluate !== "function") {
    issues.push({ path: "evaluate", message: "評価は関数である必要があります。" });
  }

  return issues;
}

// ---- 寄与の発信時の不変条件の検査（#131 と #130 のテストが使う）----

const PER_GLYPH_CHANNELS = ["position", "rotation", "scale", "letterSpacing", "duplication"] as const;

/**
 * 1つの属性寄与が発信時の不変条件を満たすかを検査する。空＝正当。
 * 1. deform と、位置・回転・大きさ・字間・複製のいずれかを同居させない。
 * 2. 含む項目は宣言した操作属性 operates の範囲内に収め、層も宣言に一致する。
 * #131 が合成前にこれで検査し、#130 はこの関数で擬似演出の寄与を確認する。
 */
export function findContributionIssues(
  operates: OperatedAttributes,
  contribution: AttributeContribution
): EffectElementIssue[] {
  const issues: EffectElementIssue[] = [];

  // 1. 変形排他。
  if (contribution.deform !== undefined) {
    for (const channel of PER_GLYPH_CHANNELS) {
      if (contribution[channel] !== undefined) {
        issues.push({
          path: `contribution.${channel}`,
          message: "変形寄与と1文字ごとの寄与（位置・回転・大きさ・字間・複製）は同時に出せません。",
        });
      }
    }
    // 塊配置の数値検査。塊配置は変形寄与の内側にネストするため型の上で非変形寄与は持てず、ここでは数値だけを見る。
    // 位置は有限（符号は問わない）、大きさは有限かつ正（0や負は描画が壊れるため）。
    const mp = contribution.deform.massPlacement;
    if (mp?.position !== undefined && !isFiniteVector(mp.position)) {
      issues.push({ path: "contribution.deform.massPlacement.position", message: "塊の位置は有限の数値である必要があります。" });
    }
    if (mp?.scale !== undefined && !isFinitePositiveVector(mp.scale)) {
      issues.push({ path: "contribution.deform.massPlacement.scale", message: "塊の大きさは有限かつ正である必要があります。" });
    }
  }

  // 2. 操作属性の範囲内と層の一致。
  const checkTransform = (
    key: "position" | "rotation" | "scale",
    value: TransformContribution | ScaleContribution | undefined
  ): void => {
    if (value === undefined) return;
    const declared = operates[key];
    if (declared === undefined) {
      issues.push({ path: `contribution.${key}`, message: `${key} は operates で宣言されていません。` });
    } else if (value.layer !== declared) {
      issues.push({ path: `contribution.${key}.layer`, message: `層が宣言（${declared}）と一致しません。` });
    }
  };
  checkTransform("position", contribution.position);
  checkTransform("rotation", contribution.rotation);
  checkTransform("scale", contribution.scale);

  if (contribution.letterSpacing !== undefined) {
    const declared = operates.letterSpacing;
    if (declared === undefined) {
      issues.push({ path: "contribution.letterSpacing", message: "letterSpacing は operates で宣言されていません。" });
    } else if (contribution.letterSpacing.layer !== declared) {
      issues.push({ path: "contribution.letterSpacing.layer", message: `層が宣言（${declared}）と一致しません。` });
    }
  }

  if (contribution.color !== undefined) {
    const declared = operates.color;
    if (declared === undefined) {
      issues.push({ path: "contribution.color", message: "color は operates で宣言されていません。" });
    } else if (contribution.color.layer !== declared) {
      issues.push({ path: "contribution.color.layer", message: `色の層が宣言（${declared}）と一致しません。` });
    }
  }

  for (const key of ["opacity", "glow", "duplication", "clip"] as const) {
    if (contribution[key] !== undefined && operates[key] !== true) {
      issues.push({ path: `contribution.${key}`, message: `${key} は operates で宣言されていません。` });
    }
  }
  if (contribution.deform !== undefined && operates.deform !== true) {
    issues.push({ path: "contribution.deform", message: "deform は operates で宣言されていません。" });
  }

  // 複製の形（写しの数と最小写し数）。
  const dup = contribution.duplication;
  if (dup !== undefined) {
    if (dup.copies.length === 0) {
      issues.push({ path: "contribution.duplication.copies", message: "写しは1つ以上である必要があります。" });
    }
    if (!isPositiveInteger(dup.minCount)) {
      issues.push({ path: "contribution.duplication.minCount", message: "最小写し数は正の整数である必要があります。" });
    } else if (dup.minCount > dup.copies.length) {
      issues.push({ path: "contribution.duplication.minCount", message: "最小写し数は写しの数以下である必要があります。" });
    }
  }

  // 数値の健全性（数式由来の演出を多数追加するため、非数や無限大を合成前に弾く）。
  // 位置・回転・大きさ・字間・透明度・発光の値はいずれも有限であることを要する。透明度・発光の0以上1以下への
  // 収束は合成器の責務（透明度は係数の積をクランプ、発光は閾値以上へ持ち上げ）であり、ここでは範囲ではなく
  // 有限性だけを検査する（範囲を強制すると、合成器のクランプを検証する既存の契約と衝突するため）。
  for (const key of ["position", "rotation", "scale"] as const) {
    const value = contribution[key];
    if (value !== undefined && !isFiniteVector(value.value)) {
      issues.push({ path: `contribution.${key}.value`, message: `${key} の値は有限の数値である必要があります。` });
    }
  }
  if (contribution.letterSpacing !== undefined && !Number.isFinite(contribution.letterSpacing.value)) {
    issues.push({ path: "contribution.letterSpacing.value", message: "字間の値は有限の数値である必要があります。" });
  }
  if (contribution.opacity !== undefined && !Number.isFinite(contribution.opacity.factor)) {
    issues.push({ path: "contribution.opacity.factor", message: "透明度の係数は有限の数値である必要があります。" });
  }
  if (contribution.glow !== undefined && !Number.isFinite(contribution.glow.intensity)) {
    issues.push({ path: "contribution.glow.intensity", message: "発光の強さは有限の数値である必要があります。" });
  }
  if (contribution.clip !== undefined) {
    const clip = contribution.clip;
    const finite = Number.isFinite(clip.minX) && Number.isFinite(clip.minY) && Number.isFinite(clip.maxX) && Number.isFinite(clip.maxY);
    if (!finite || clip.minX > clip.maxX || clip.minY > clip.maxY) {
      issues.push({ path: "contribution.clip", message: "切り抜き矩形は有限の数値で、最小が最大以下である必要があります。" });
    }
  }

  return issues;
}

// ---- 登録の仕組み ----

export interface EffectRegistry {
  /** 検証不合格または識別子重複で例外を投げる。 */
  register(element: EffectElement): void;
  /** 未知の識別子で例外を投げる。 */
  get(id: string): EffectElement;
  list(): readonly EffectElement[];
}

export function createEffectRegistry(): EffectRegistry {
  const elements = new Map<string, EffectElement>();
  return {
    register(element: EffectElement): void {
      const issues = validateEffectElement(element);
      if (issues.length > 0) {
        const detail = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new Error(`演出要素の登録に失敗しました（${String(element.id)}）: ${detail}`);
      }
      // 識別子は #132・#33 が参照する安定した契約のため、重複は無言で上書きせず例外で拒否する。
      if (elements.has(element.id)) {
        throw new Error(`演出要素の識別子が重複しています: ${element.id}`);
      }
      elements.set(element.id, element);
    },
    get(id: string): EffectElement {
      const element = elements.get(id);
      if (!element) {
        throw new Error(`未登録の演出要素の識別子です: ${id}`);
      }
      return element;
    },
    list(): readonly EffectElement[] {
      return [...elements.values()];
    },
  };
}
