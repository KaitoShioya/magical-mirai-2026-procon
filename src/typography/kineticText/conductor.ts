// タイポ・コンポジション駆動部（指揮者、Issue #33）。
//
// 役割: 再生位置（ゲーム時刻）に応じて文字エンジンを毎フレーム動かし、歌詞を1つの可読なキネティックテキストとして
// 表示する。歌詞は読ませる役（可読な styling）として表示し、その同じテキストへ演出文法①スマッシュ（#23）の
// 出現時の拡大から落ち着きへの動きを適用する。読ませる役と演出役を別々の文字として二重に出さない
// （同じ歌詞が別位置に重複しないようにするため、1つの表現に統一する）。
//
// 再構成方式: 毎フレーム、その時刻に表示されているべき読ませる役の区間を計算し、現在表示中と異なれば
// 古い区間を解放して新しい区間を生成する。表示状態を現在時刻の関数として作るため、シーク・再生開始直後・
// タブ離脱からの再開でも特別扱いを書かずに正しい状態へ収束する。
//
// 駆動の経路: 毎フレーム計算経路（スマッシュの大きさ曲線をその場で評価）のみを使い、文字ごとにアニメーションの
// タイムラインを作る経路（glyphAnimation、GSAP）は使わない。
//
// 縮退時の保護: 上限超過の出現破棄（NOOP_HANDLE）は表示中集合へ登録せず次フレームに再試行する。
// 読ませる役は寿命（lifetimeMs）を指定せず生成し、解放は本駆動部が管理する（自動失効で途中で消えないため）。
//
// 依存規則: profiles・tools を import しない。曲固有データの型は共有の型置き場 src/types から取り込む。
// 描画器とカメラへの依存は、世界座標への配置を注入インターフェース ConductorPlacement に閉じ込める。

import type { GlyphHandle, ReadabilityOptions, Vector3Like } from "./types";
import type { LyricsTimeline } from "../../textalive/lyricsTimeline";
import { phraseAt } from "../../textalive/lyricsTimeline";
import type { ResolvedAssignmentPlan } from "./typographyChartResolve";
import { activeResolvedAssignmentsAt } from "./typographyChartResolve";
import type { ReadingSpansByPhrase, ReadingSpan, ReadingPlacementResolved } from "./readingLayout";
import { readingSpanAt } from "./readingLayout";
import { EFFECT_ID } from "./effectAssignment";
import { charSmashScaleAt } from "./effects/charSmash";
import type { EffectElement, EffectContext } from "./effectElement";
import { composeGlyphState } from "./effectCompositor";

/** スマッシュの拡大から落ち着きへ至るまでの時間（ミリ秒、採用理由を先に述べる）。
 * 読ませる役の区間が現れた瞬間に拡大し、短い時間で落ち着き寸法へ戻る打撃感を出す。300ミリ秒は毎分175拍の
 * 1拍（約343ミリ秒）より短く、拍に乗る素早い出現として自然な値である。実機調整で確定する暫定値。 */
const SMASH_POP_MS = 300;

/** 駆動部が使う文字エンジンの最小契約（読ませる役の生成）。
 * 読ませる役は行全体を1つのテキストとして描く。char に文字列全体を渡すと、文字エンジンが内包する troika が
 * 字形ごとの送り幅・空白（英語の単語間隔）・字形差を正しく組む。1文字ずつ均一間隔で並べるとサイズ不一致や
 * 字間の詰まりに見えるため、行を1つのテキストにまとめる。 */
export interface ConductorEngineLike {
  spawnGlyph(request: {
    /** 行の文字列全体（troika が1つのテキストとして正しく組版する）。 */
    readonly char: string;
    readonly fontName: string;
    readonly position: Vector3Like;
    readonly fontSize: number;
    readonly color: number;
    readonly opacity: number;
    readonly readability?: ReadabilityOptions;
  }): GlyphHandle;
}

/** 世界座標への配置（カメラ依存）。結線時に実装し、テストでは擬似に差し替える。 */
export interface ConductorPlacement {
  /** 読ませる役の行の中心に対応する世界座標を返す（行は中央基準で1つのテキストとして置く）。 */
  readingWorldPosition(placement: ReadingPlacementResolved): Vector3Like;
  /** 想定表示寸法（デバイス画素）に対応する世界座標の文字寸法を返す。 */
  worldFontSizeForPixelHeight(pixelHeight: number): number;
}

/** 駆動部の内容（読み込み済みデータ）。 */
export interface ConductorContent {
  readonly timeline: LyricsTimeline;
  readonly resolvedPlan: ResolvedAssignmentPlan;
  readonly spansByPhrase: ReadingSpansByPhrase;
  /** フレーズ番号からそのフレーズの読ませる役の配置（譜面指定または既定）を返す。 */
  placementFor(phraseIndex: number): ReadingPlacementResolved;
}

/** 駆動部の依存。 */
export interface ConductorDeps {
  readonly engine: ConductorEngineLike;
  readonly placement: ConductorPlacement;
  readonly content: ConductorContent;
  readonly fontName: string;
  /** 想定表示寸法から読ませる役の可読性属性を作る。 */
  readabilityFor(pixelHeight: number): ReadabilityOptions;
  /** 文字の基底塗り色（sRGBの16進）。 */
  readonly baseColor: number;
  /** 出現破棄のプレースホルダかを判定する（既定はエンジンの isPlaceholderHandle）。 */
  isPlaceholder(handle: GlyphHandle): boolean;
  /**
   * 演出識別名から登録済みの演出要素を引く（任意）。与えると、読ませる役へ active な演出を汎用経路
   * （EffectElement.evaluate → composeGlyphState → 取っ手へ反映）で適用する。与えないと、従来どおり
   * スマッシュの大きさだけを直接適用する（後方互換）。本編は登録済みレジストリの get を渡す。
   */
  resolveEffect?(effectId: string): EffectElement | null;
  /** 発光（ブルーム）閾値。汎用経路の合成で使う。省略時は1（実質発光なし）。 */
  readonly bloomThreshold?: number;
}

/** 駆動部。毎フレーム update を呼び、終了時に dispose で後始末する。 */
export interface Conductor {
  update(gameTimeMs: number): void;
  dispose(): void;
}

/** 読ませる役の区間の同一性の鍵（フレーズ番号と表示開始時刻で一意）。 */
function readingKeyOf(span: ReadingSpan): string {
  return `${span.phraseIndex}:${span.displayStartMs}`;
}

export function createConductor(deps: ConductorDeps): Conductor {
  const { engine, placement, content, fontName, baseColor } = deps;

  // 現在表示中の読ませる役の取っ手・鍵・区間。
  let readingHandle: GlyphHandle | null = null;
  let readingKey: string | null = null;
  let readingSpan: ReadingSpan | null = null;
  // 現在適用している大きさ倍率（同じ値の再設定を避けるため保持する。従来のスマッシュ経路で使う）。
  let appliedScale = 1;
  // 現在の読ませる役の世界座標（汎用経路の基準位置に使う。生成時に確定する）。
  let readingWorldPos: Vector3Like = { x: 0, y: 0, z: 0 };

  /** スマッシュが現時点で有効か（active な割付に smash があるか）。 */
  function smashActiveAt(gameTimeMs: number): boolean {
    const active = activeResolvedAssignmentsAt(content.resolvedPlan, gameTimeMs);
    return active.some((assignment) => assignment.effectId === EFFECT_ID.smash);
  }

  /** 表示されているべき読ませる役の区間へ合わせる（生成・解放）。
   *
   * 時刻境界の規約を先に述べる。読ませる役の被覆は、発声中の半開区間 [フレーズ開始, フレーズ終了) を基準とする。
   * 読ませる役の区間はこの半開区間を構成上分割する（readingLayout.ts の buildReadingSpansForPhrase）。
   * phraseAt は終了時刻を含む閉区間で判定するため、フレーズ終了時刻ちょうどでもフレーズを返すが、次の2つの場合があり
   * いずれも正しい状態へ収束する。第一に、次のフレーズが同時刻に始まる隣接の場合、phraseAt は後のフレーズを返し、
   * その区間が同時刻から始まるため切れ目なく繋がる。第二に、後に無音が続く場合、phraseAt は終了したフレーズを返すが
   * readingSpanAt は半開区間のため null を返し、読ませる役を解放する。終了時刻ちょうどは発声が止まる時刻であり、
   * そこから無音が始まるまで何も出さないのは正しい。よって閉区間の phraseAt ゲートは被覆を損なわない。 */
  function reconcileReading(gameTimeMs: number): void {
    const phrase = phraseAt(content.timeline, gameTimeMs);
    let desired: ReadingSpan | null = null;
    if (phrase !== null) {
      const spans = content.spansByPhrase.get(phrase.phraseIndex);
      desired = spans ? readingSpanAt(spans, gameTimeMs) : null;
    }

    const desiredKey = desired ? readingKeyOf(desired) : null;
    if (desiredKey === readingKey) {
      return;
    }
    // 望ましい区間が変わった。現在を解放し、新しい区間を生成する。
    if (readingHandle !== null) {
      readingHandle.release();
      readingHandle = null;
      readingKey = null;
      readingSpan = null;
    }
    if (desired !== null && phrase !== null) {
      const placementResolved = content.placementFor(phrase.phraseIndex);
      const fontSize = placement.worldFontSizeForPixelHeight(placementResolved.targetPixelHeight);
      const worldPos = placement.readingWorldPosition(placementResolved);
      // 行全体を1つのテキストとして描く（troika が字形ごとの送り幅・空白・字形差を正しく組み、サイズと字間が整う）。
      const handle = engine.spawnGlyph({
        char: desired.text,
        fontName,
        position: worldPos,
        fontSize,
        color: baseColor,
        opacity: 1,
        readability: deps.readabilityFor(placementResolved.targetPixelHeight),
      });
      // 出現破棄は表示中集合へ登録しない（次フレームに枠が空けば再試行する）。
      if (!deps.isPlaceholder(handle)) {
        readingHandle = handle;
        readingKey = desiredKey;
        readingSpan = desired;
        readingWorldPos = worldPos;
        appliedScale = 1;
      } else {
        handle.release();
      }
    }
  }

  /** 読ませる役へスマッシュの大きさ（出現時の拡大から落ち着きへ）を直接適用する（後方互換の従来経路）。 */
  function applySmashScaleLegacy(gameTimeMs: number): void {
    if (readingHandle === null || readingSpan === null) {
      return;
    }
    // スマッシュが有効な区間でのみ拡大の打撃を出す。無効な区間は落ち着き寸法（倍率1）で出す。
    let scale = 1;
    if (smashActiveAt(gameTimeMs)) {
      const elapsed = gameTimeMs - readingSpan.displayStartMs;
      const progress = elapsed <= 0 ? 0 : elapsed >= SMASH_POP_MS ? 1 : elapsed / SMASH_POP_MS;
      scale = charSmashScaleAt(progress);
    }
    if (scale !== appliedScale) {
      readingHandle.setScale3(scale, scale, scale);
      appliedScale = scale;
    }
  }

  /** 読ませる役の単位の EffectContext を作る（汎用経路で各演出に渡す）。 */
  function readingContext(gameTimeMs: number, span: ReadingSpan): EffectContext {
    return {
      gameTimeMs,
      unit: "phrase",
      unitStartMs: span.displayStartMs,
      unitEndMs: span.displayEndMs,
      text: span.text,
      unitGlyphCount: [...span.text].length,
      phraseIndex: span.phraseIndex,
      basePosition: readingWorldPos,
    };
  }

  /**
   * 読ませる役へ active な演出を汎用経路（evaluate → composeGlyphState → 取っ手へ反映）で適用する。
   * 読ませる役の可読性（色・縁取り・影）は生成時のまま保つため、合成結果のうち幾何（大きさ・位置・回転）と
   * 不透明度だけを反映し、色は上書きしない。変形・複製は別の取っ手を要するため読ませる役へは適用しない
   * （演出役・変形役の単位別生成は後続の結線で扱う）。
   */
  function applyReadingEffectsGeneric(gameTimeMs: number, resolveEffect: NonNullable<ConductorDeps["resolveEffect"]>): void {
    if (readingHandle === null || readingSpan === null) {
      return;
    }
    const active = activeResolvedAssignmentsAt(content.resolvedPlan, gameTimeMs);
    const ctx = readingContext(gameTimeMs, readingSpan);
    const contributions = [];
    for (const assignment of active) {
      const element = resolveEffect(assignment.effectId);
      if (element === null) continue;
      const contribution = element.evaluate(ctx);
      if (contribution === null) continue;
      contributions.push({
        id: element.id,
        priority: assignment.finalPriority,
        operates: element.operates,
        contribution,
      });
    }
    const composed = composeGlyphState({
      unit: "phrase",
      contributions,
      baseColor,
      basePosition: readingWorldPos,
      bloomThreshold: deps.bloomThreshold ?? 1,
      readability: null,
    });
    // 幾何と不透明度を反映する（色・可読性は生成時のまま保つ）。
    readingHandle.setScale3(composed.scale.x, composed.scale.y, composed.scale.z);
    if (composed.rotation !== null) {
      readingHandle.setRotation(composed.rotation.x, composed.rotation.y, composed.rotation.z);
    }
    readingHandle.setPosition(composed.position.x, composed.position.y, composed.position.z);
    readingHandle.setOpacity(composed.opacity);
  }

  return {
    update(gameTimeMs: number): void {
      reconcileReading(gameTimeMs);
      if (deps.resolveEffect !== undefined) {
        applyReadingEffectsGeneric(gameTimeMs, deps.resolveEffect);
      } else {
        applySmashScaleLegacy(gameTimeMs);
      }
    },
    dispose(): void {
      if (readingHandle !== null) {
        readingHandle.release();
        readingHandle = null;
        readingKey = null;
        readingSpan = null;
      }
    },
  };
}
