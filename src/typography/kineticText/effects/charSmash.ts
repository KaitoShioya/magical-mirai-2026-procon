// 演出文法①「1文字1拍スマッシュ」の実演出（Issue #23）。
// ビートに合わせて1文字を瞬間表示し、拍頭で過大な大きさ（はみ出し）から落ち着きへ単調に減衰する。
// 設計根拠: docs/research/01-kinetic-typography.md §3・§9（強い口調・短い音は1文字を1拍で画面いっぱいに
// スマッシュしはみ出させる）、docs/refs/reference-analysis.md §1.3-4「スケールの暴力」・§1B.2-6
// 「はみ出すまで拡大」。短音の2拍に1回への間引きは beatCadence:2 として宣言する（実際の文字選択と発火は
// 駆動側 #132・#33 が行う）。
//
// 役割分担（後続実装の解釈ぶれを防ぐため明記する）:
//   - requiredSignals は「評価に直接必要な信号」を表す。本演出は beatPhase を読まず、表示単位の開始・終了・
//     現在時刻だけで大きさを決めるため、欠けると寄与を作れない信号は無い。よって持たせない。
//   - selectionHints は「選択を映えさせる助言」を表す。本演出はビートに乗る短い強い音で映えるため、
//     拍・継続時間・粒度を助言に置く。
//   - beatCadence は「拍駆動の適性（発火の刻み）」を表す。2拍に1回の間引きを宣言する。
//
// ビートへの一致（受け入れ基準「ビート±1フレーム一致」）の成立条件:
//   駆動側は、表示単位の開始時刻 unitStartMs に発火フレームの時刻でなくビート時刻を入れる。表示粒度切替
//   コントローラ #29 がセグメントの時刻範囲をビート格子へ吸着して供給するため（src/typography/kineticText/
//   README.md「セグメントの時刻範囲は表示の切替のタイミング（ビート吸着後）」）、本演出が受け取る unitStartMs は
//   ビート時刻になる。発火フレームがビートより遅れても、開始時刻がビート時刻に固定されているため、そのフレームの
//   進行は「拍からの経過 ÷ 表示時間」となり、山から経過分だけ進んだ正しい姿で出る（拍同期スケジューラ #16 の
//   コメントが述べる「経過分だけ演出を進めた状態で開始する」補正を、開始時刻のビート時刻固定で実現する）。
//
// 依存規則（docs/decisions/architecture.md §5）: 判定・得点・時刻の論理を持たない。profiles・tools を import
// しない。three.js は持ち込まず型のみ。本ファイルは effectElement の型と types の Vector3Like だけを取り込む。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
} from "../effectElement";
import type { Vector3Like } from "../types";
import { outPow } from "../easing";

// --- スマッシュ曲線の係数（演出固有値。横断参照されないためモジュール内に置く）---
// 記号の意味は tuning.ts の規約に倣う。★暫定＝実装後のプレイ検証で調整、☆確定＝仕様で固定。
// 係数の想定範囲（プレイ検証で調整する際の不変条件。範囲逸脱は charSmash.test.ts が検知する）:
//   山倍率 > 落ち着き倍率 > 0（はみ出しは落ち着きより大きく、落ち着きは消失でない）。
//   0 < 落ち着き割合 <= 1（表示進行のうち減衰に使う割合）。減衰指数 >= 1（序盤に速く落ちる単調減衰）。

/**
 * 拍頭の過大倍率（はみ出し）。基準寸法の6倍で画面いっぱいのはみ出しを狙う。
 * 採用理由を先に述べる。設計書§2.1.5は「1文字を1拍で画面いっぱいに見せ、画面からはみ出させる」と定める。
 * 基準寸法の文字が画面高のおよそ1割を占めるとき、2.5倍は画面高の2割5分ほどを占め、過大すぎず打撃感が読める。
 * 6倍・4倍では大きすぎたため、打撃感を保ちつつ過大さを抑える2.5倍にする。★暫定。
 */
export const CHAR_SMASH_PEAK_SCALE = 2.5;

/** 落ち着きの倍率。落ち着き＝基準寸法そのもの。☆確定。 */
export const CHAR_SMASH_SETTLE_SCALE = 1.0;

/**
 * 落ち着きへ達するまでの進行の割合。減衰時間 CHAR_SMASH_DECAY_MS のうちこの割合で落ち着く。
 * 採用理由を先に述べる。打撃は素早く落ち着くべきで、減衰時間300ミリ秒の半分（150ミリ秒）で落ち着き寸法へ戻すと、
 * 拍頭の山から半拍未満で落ち着く打撃感になる。割合を0.5とする。★暫定。
 */
export const CHAR_SMASH_SETTLE_FRACTION = 0.5;

/** 減衰の速さ。序盤に速く落ちる二次の減衰。★暫定。 */
export const CHAR_SMASH_DECAY_EXPONENT = 2;

/**
 * 山から落ち着きへ減衰する固定時間（ミリ秒）。
 * 採用理由を先に述べる。設計書§2.1.5の「1文字を1拍」のスマッシュは、表示が続く長さに関わらず1拍ほどの短い時間で
 * 打撃から落ち着きへ減衰すべきである。減衰を表示窓（unitEndMs−unitStartMs）で正規化すると、表示の長い局面ほど減衰が
 * 鈍り「ゆっくり縮むだけ」になる。よって減衰の時間軸を表示窓から切り離し、固定の減衰時間で進行度を計算する。
 * 300ミリ秒は毎分175拍の1拍（約343ミリ秒）より短く、次の拍が来る前に落ち着く打撃の長さである。★暫定。
 */
export const CHAR_SMASH_DECAY_MS = 300;

/** 0以上1以下に制限する。 */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 表示進行 progress（0以上1以下）に対する縦横一律の絶対倍率を返す純粋関数。
 * progress=0 で山倍率、落ち着き割合以降で落ち着き倍率。間に二次の単調減衰を置く。
 * evaluate とテストが同じ式を共有するため公開する（テストは期待値の算出にこれを使う）。
 */
export function charSmashScaleAt(progress: number): number {
  // 落ち着き割合は (0, 1] を想定する。0以下のときは0除算で値が壊れる（NaN や無限大が大きさへ漏れる）ため、
  // 即座に落ち着いた状態（減衰の入力を1）として扱い、毎フレームのホットパスで安全な有限値だけを返す。
  const ratio = CHAR_SMASH_SETTLE_FRACTION > 0 ? clamp01(progress) / CHAR_SMASH_SETTLE_FRACTION : 1;
  const decayInput = clamp01(ratio);
  // 減衰はイージング基盤の出の多項式で表す。outPow(u,n)=1-(1-u)^n より 1-outPow(u,n)=(1-u)^n の恒等式が
  // 成り立つため、従来の (1-decayInput)^減衰指数 と数値的に同値（浮動小数の最小桁の差を許容差内に収める）で、
  // charSmash.test.ts は変更なしで通る。
  const decay = 1 - outPow(decayInput, CHAR_SMASH_DECAY_EXPONENT);
  return CHAR_SMASH_SETTLE_SCALE + (CHAR_SMASH_PEAK_SCALE - CHAR_SMASH_SETTLE_SCALE) * decay;
}

/** Issue #23 1文字1拍スマッシュ。文字単位。大きさの主変形と不透明度を操作する。 */
export const charSmash: EffectElement = {
  id: "effect.charSmash",
  displayName: "1文字1拍スマッシュ",
  targetUnit: "char",
  startCondition: {
    trigger: "onUnitStart",
    beatCadence: 2,
    selectionHints: ["beat", "duration", "granularity"],
  },
  operates: { scale: "main", opacity: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    // 複製せず1文字を拡大する。文字単位で1個の取っ手の大きさを毎フレーム更新（GSAP更新対象1）。
    // 開始で1回配置する（troika同期1）。発光せず（発光対象0）、複製しない。
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    // 減衰の進行は、ビート吸着済みの開始時刻からの経過を固定の減衰時間 CHAR_SMASH_DECAY_MS で正規化したもの。
    // 表示窓ではなく固定時間で割ることで、表示が長い局面でも打撃から落ち着きへの減衰が1拍ほどの短さに保たれる。
    const progress = clamp01((ctx.gameTimeMs - ctx.unitStartMs) / CHAR_SMASH_DECAY_MS);
    const scale = charSmashScaleAt(progress);
    const value: Vector3Like = { x: scale, y: scale, z: scale };
    // 不透明度は常に1。瞬間表示は駆動側が開始（ビート時刻）で文字を出現させて実現し、消失は別文法 #28 が担う。
    return {
      scale: { layer: "main", value },
      opacity: { factor: 1 },
    };
  },
};
