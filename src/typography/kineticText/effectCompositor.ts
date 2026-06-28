// 演出合成エンジン（Issue #131）の純粋な合成器。
// 同一単位へ束ねた複数演出の属性寄与を固定順序（位置と回転→大きさ→色→透明度→発光→可読性補正）で
// 1つの最終文字状態へ畳む。副作用と three を持たない（依存規則 docs/decisions/architecture.md §5）。
//
// 色の計算は線形色空間で行う（光量の補間は線形空間が物理的に正しく、sRGB空間の直接補間は中間色が暗く濁る）。
// ブルーム閾値と読ませる役の透明度下限は外から受け取り、本モジュールは rendering へ依存しない。

import type {
  AttributeContribution,
  OperatedAttributes,
  EffectTargetUnit,
  DuplicationContribution,
} from "./effectElement";
import { findContributionIssues } from "./effectElement";
import type { Vector3Like, ResolvedReadabilityStyle } from "./types";
import {
  srgbHexToChannels,
  srgbChannelToLinear,
  linearChannelToSrgb,
  srgbChannelsToHex,
  relativeLuminanceFromSrgbHex,
  clampLuminanceSrgbHex,
} from "./readability";
import { READING_ROLE_MIN_OPACITY } from "../../config/tuning";
import type { ComposedGlyphState } from "./composedGlyphState";

/** 1演出の寄与と、駆動側（#132・#33）が補正・上書き済みの最終優先度、操作属性の宣言、演出識別子。 */
export interface ContributionEntry {
  readonly id: string;
  readonly contribution: AttributeContribution;
  readonly priority: number;
  readonly operates: OperatedAttributes;
}

/** 合成器の入力。単位の種別は字間・複製の可否と読ませる役の可否を決める。 */
export interface ComposeInput {
  readonly unit: EffectTargetUnit;
  readonly contributions: readonly ContributionEntry[];
  /** 単位の基底塗り色（spawn 時の色）。主張色が無いとき色の起点になる。 */
  readonly baseColor: number;
  /**
   * 単位の基準位置（spawn 時の配置、ワールド座標）。位置の主変形が無いとき位置の起点になり、揺らぎはこの上に乗る。
   * 省略時は原点。baseColor と対称に、位置の主変形を持たない演出が単位を原点へ動かさないために要る。
   */
  readonly basePosition?: Vector3Like;
  /** ブルーム閾値（線形相対輝度）。発光の引き上げ先と発光対象判定に使う。正典は src/rendering/constants.ts。 */
  readonly bloomThreshold: number;
  /** 読ませる役のときの確定可読性指定。null は演出役。 */
  readonly readability: ResolvedReadabilityStyle | null;
  /** 読ませる役の透明度下限。省略時は READING_ROLE_MIN_OPACITY。 */
  readonly minReadingOpacity?: number;
}

/** 縮退指示。費用合算（effectBudget）が作り、合成器が再合成で反映する。 */
export interface DegradeDirective {
  /** 複製の写し数の上限（minCount を下限とする）。 */
  readonly maxCopies?: number;
  /** 発光を落とす（最終輝度をブルーム閾値以下にする）。 */
  readonly dropGlow?: boolean;
  /** 揺らぎ層を落とす演出の識別子の集合。 */
  readonly dropJitterEffectIds?: ReadonlySet<string>;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

const ZERO: Vector3Like = { x: 0, y: 0, z: 0 };
const ONE: Vector3Like = { x: 1, y: 1, z: 1 };

/** 主変形の上書き対象を選ぶ。最高優先度を採り、同優先度は配列順の後者を採る（後勝ち）。 */
function pickMain<T>(
  entries: readonly ContributionEntry[],
  get: (contribution: AttributeContribution) => T | undefined
): T | null {
  let best: T | null = null;
  let bestPriority = -Infinity;
  for (const entry of entries) {
    const value = get(entry.contribution);
    if (value === undefined) continue;
    if (best === null || entry.priority >= bestPriority) {
      best = value;
      bestPriority = entry.priority;
    }
  }
  return best;
}

/** 線形色空間で起点色へ補助色を弱く混合する。weight は0以上1以下。 */
function mixLinear(baseHex: number, mixHex: number, weight: number): number {
  const base = srgbHexToChannels(baseHex);
  const mix = srgbHexToChannels(mixHex);
  const w = clamp01(weight);
  const blend = (b: number, m: number): number => {
    const linear = (1 - w) * srgbChannelToLinear(b) + w * srgbChannelToLinear(m);
    return linearChannelToSrgb(linear);
  };
  return srgbChannelsToHex(blend(base.r, mix.r), blend(base.g, mix.g), blend(base.b, mix.b));
}

/**
 * 発光: 色相を保ったまま線形相対輝度を目標まで引き上げる。intensity 0 はブルーム閾値、1 は線形輝度1.0。
 * 最も明るいチャネルが1.0で頭打ちになる場合は色相を保つため係数を 1/最大チャネル に抑える（輝度は目標より下回る）。
 * 黒（輝度がほぼ0）は色相を決められないため、相対輝度が目標に一致する中立な明色（3チャネル等値）にする。
 */
function liftLuminance(colorHex: number, intensity: number, bloomThreshold: number): number {
  const target = bloomThreshold + clamp01(intensity) * (1 - bloomThreshold);
  const channels = srgbHexToChannels(colorHex);
  const rLinear = srgbChannelToLinear(channels.r);
  const gLinear = srgbChannelToLinear(channels.g);
  const bLinear = srgbChannelToLinear(channels.b);
  const luminance = 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  const EPSILON = 1e-4;
  if (luminance <= EPSILON) {
    // 等しい線形チャネル c の相対輝度は c（係数の総和が1）。よって c = target。
    const c = Math.min(target, 1);
    const srgb = linearChannelToSrgb(c);
    return srgbChannelsToHex(srgb, srgb, srgb);
  }
  if (target <= luminance) {
    // 既に目標以上の輝度。引き上げ不要。
    return colorHex;
  }
  const maxLinear = Math.max(rLinear, gLinear, bLinear);
  let factor = target / luminance;
  if (maxLinear > 0 && factor * maxLinear > 1) {
    factor = 1 / maxLinear;
  }
  return srgbChannelsToHex(
    linearChannelToSrgb(clamp01(rLinear * factor)),
    linearChannelToSrgb(clamp01(gLinear * factor)),
    linearChannelToSrgb(clamp01(bLinear * factor))
  );
}

const PER_GLYPH_GEOMETRIC = ["position", "rotation", "scale", "letterSpacing", "duplication"] as const;

function hasGeometricChannel(contribution: AttributeContribution): boolean {
  return PER_GLYPH_GEOMETRIC.some((channel) => contribution[channel] !== undefined);
}

/** 位置・回転（主変形は絶対値の上書き、揺らぎは加算）。 */
function composeVector(
  entries: readonly ContributionEntry[],
  get: (c: AttributeContribution) => { layer: "main" | "jitter"; value: Vector3Like } | undefined,
  base: Vector3Like,
  dropJitter: ReadonlySet<string> | undefined
): Vector3Like {
  const main = pickMain(entries, (c) => {
    const v = get(c);
    return v && v.layer === "main" ? v.value : undefined;
  });
  let x = main ? main.x : base.x;
  let y = main ? main.y : base.y;
  let z = main ? main.z : base.z;
  for (const entry of entries) {
    if (dropJitter && dropJitter.has(entry.id)) continue;
    const v = get(entry.contribution);
    if (v && v.layer === "jitter") {
      x += v.value.x;
      y += v.value.y;
      z += v.value.z;
    }
  }
  return { x, y, z };
}

/** 大きさ（主変形は絶対倍率、揺らぎは各成分への加算差分）。 */
function composeScale(
  entries: readonly ContributionEntry[],
  dropJitter: ReadonlySet<string> | undefined
): Vector3Like {
  return composeVector(entries, (c) => c.scale, ONE, dropJitter);
}

export function composeGlyphState(input: ComposeInput, directive?: DegradeDirective): ComposedGlyphState {
  const { unit, contributions, baseColor, bloomThreshold, readability } = input;
  const basePosition = input.basePosition ?? ZERO;
  const dropJitter = directive?.dropJitterEffectIds;
  const hasRotation = contributions.some((e) => e.contribution.rotation !== undefined);

  // 合成前の不変条件検査（#130 が #131 の責務と定める）。
  for (const entry of contributions) {
    const issues = findContributionIssues(entry.operates, entry.contribution);
    if (issues.length > 0) {
      const detail = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new Error(`寄与の不変条件に違反しています（${entry.id}）: ${detail}`);
    }
  }

  const isReadingRole = readability !== null;
  const minReadingOpacity = input.minReadingOpacity ?? READING_ROLE_MIN_OPACITY;

  // 段3: 色（変形・非変形のいずれでも合成する）。
  const assertive = pickMain(contributions, (c) =>
    c.color && c.color.layer === "assertive" ? c.color.color : undefined
  );
  let mixedColor = assertive ?? baseColor;
  const auxiliaries = contributions
    .filter((e) => e.contribution.color && e.contribution.color.layer === "auxiliary")
    .sort((a, b) => a.priority - b.priority);
  for (const aux of auxiliaries) {
    const color = aux.contribution.color;
    if (color) {
      mixedColor = mixLinear(mixedColor, color.color, color.weight ?? 0);
    }
  }

  // 段5: 発光（優先度順に上書き、directive.dropGlow で抑止）。
  const glowIntensity = directive?.dropGlow
    ? null
    : pickMain(contributions, (c) => (c.glow ? c.glow.intensity : undefined));

  let finalColor: number;
  let glowing: boolean;
  if (isReadingRole) {
    // 読ませる役は発光を抑制し、塗りをブルーム閾値以下へ収める。発光対象には数えない。
    finalColor = clampLuminanceSrgbHex(mixedColor, readability.maxBrightLuminance);
    glowing = false;
  } else {
    finalColor = glowIntensity !== null ? liftLuminance(mixedColor, glowIntensity, bloomThreshold) : mixedColor;
    glowing = relativeLuminanceFromSrgbHex(finalColor) > bloomThreshold;
  }

  // 段4: 透明度（係数の積、読ませる役は下限付き）。
  let opacityProduct = 1;
  for (const entry of contributions) {
    if (entry.contribution.opacity) {
      opacityProduct *= clamp01(entry.contribution.opacity.factor);
    }
  }
  const opacity = isReadingRole ? Math.max(clamp01(opacityProduct), minReadingOpacity) : clamp01(opacityProduct);

  // 変形を含む単位は変形優先で幾何チャネルを捨て、読ませる役指定を無効化する。
  const deformValue = pickMain(contributions, (c) => c.deform);
  if (deformValue) {
    const droppedGeometricContributions = contributions.filter((e) =>
      hasGeometricChannel(e.contribution)
    ).length;
    // 塊配置を解決する。寄与が塊配置を持たないときは基準位置・等倍を補い、適用層が分岐なく反映できるようにする。
    const massPlacement = deformValue.massPlacement;
    const massPosition = massPlacement?.position ?? basePosition;
    const massScale = massPlacement?.scale ?? ONE;
    return {
      position: basePosition,
      rotation: null,
      scale: ONE,
      letterSpacing: null,
      color: finalColor,
      opacity,
      glowing,
      deform: { kind: deformValue.kind, params: deformValue.params, massPosition, massScale },
      duplication: null,
      clip: null,
      readability: null,
      droppedGeometricContributions,
      droppedLetterSpacing: 0,
      collapsedNonUniformScale: false,
      forcedReadabilityNull: isReadingRole,
    };
  }

  // 段1・段2: 位置・回転・大きさ。位置は基準位置を起点にする。回転を操作する寄与が無ければ null（カメラ正対を保つ）。
  const position = composeVector(contributions, (c) => c.position, basePosition, dropJitter);
  const rotation = hasRotation
    ? composeVector(contributions, (c) => c.rotation, ZERO, dropJitter)
    : null;
  let scale = composeScale(contributions, dropJitter);

  // 読ませる役は一律倍率に限る（可読性下地が縦横独立に追従できないため、各軸最大値へ畳む）。
  let collapsedNonUniformScale = false;
  if (isReadingRole && !(scale.x === scale.y && scale.y === scale.z)) {
    const max = Math.max(scale.x, scale.y, scale.z);
    scale = { x: max, y: max, z: max };
    collapsedNonUniformScale = true;
  }

  // 字間（フレーズ・単語のみ）。文字単位と画面全体は捨てる。
  let letterSpacing: number | null = null;
  let droppedLetterSpacing = 0;
  const letterSpacingEntries = contributions.filter((e) => e.contribution.letterSpacing !== undefined);
  if (unit === "word" || unit === "phrase") {
    if (letterSpacingEntries.length > 0) {
      const mainSpacing = pickMain(contributions, (c) =>
        c.letterSpacing && c.letterSpacing.layer === "main" ? c.letterSpacing.value : undefined
      );
      let value = mainSpacing ?? 0;
      for (const entry of contributions) {
        if (dropJitter && dropJitter.has(entry.id)) continue;
        const ls = entry.contribution.letterSpacing;
        if (ls && ls.layer === "jitter") {
          value += ls.value;
        }
      }
      letterSpacing = value;
    }
  } else {
    droppedLetterSpacing = letterSpacingEntries.length;
  }

  // 複製（最高優先度を採用、縮退指示の写し数上限を反映）。
  let duplication: DuplicationContribution | null = pickMain(contributions, (c) => c.duplication);
  if (duplication && directive?.maxCopies !== undefined) {
    const targetCount = Math.max(
      duplication.minCount,
      Math.min(duplication.copies.length, directive.maxCopies)
    );
    if (targetCount < duplication.copies.length) {
      duplication = { ...duplication, copies: duplication.copies.slice(0, targetCount) };
    }
  }

  // 切り抜き（最高優先度の1件を採用）。
  const clip = pickMain(contributions, (c) => c.clip) ?? null;

  return {
    position,
    rotation,
    scale,
    letterSpacing,
    color: finalColor,
    opacity,
    glowing,
    deform: null,
    duplication,
    clip,
    readability,
    droppedGeometricContributions: 0,
    droppedLetterSpacing,
    collapsedNonUniformScale,
    forcedReadabilityNull: false,
  };
}
