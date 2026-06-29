// 渦・波打ち・渦状スキャッター転換の実演出（Issue #26 の渦側、および設計書§1.1.2/§5.5の句替わり転換）。
// 設計根拠: docs/decisions/visual-expression-design.md §2.1.4（ロングトーン・シャウト＝渦や円の歪み）・
// §1.1.2（句替わりの渦状スキャッター転換＝表示中の文字群を中心へ巻き込み細いリボン状に散らす）・
// §2.3.4（塊全体の移動・縮小は変形寄与が運ぶ塊配置を適用層が変形取っ手へ反映する）。
//
// 変形は1文字ごとの幾何チャネルと排他のため、変形寄与だけを返す（変形排他を守る）。渦状スキャッター転換は、
// 生存周期の進行に応じて渦の強さを上げ、塊大きさを縮め、不透明度を減衰させる。塊配置は massPlacement で運び、
// 合成器・適用層を通って変形取っ手の位置・大きさへ届く。カメラのショット切替との同期は後続タスクで結線する。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
} from "../effectElement";
import { outExpo } from "../easing";

/**
 * 渦のねじれの強さ（振幅、ラジアン）と速さ。
 * 採用理由を先に述べる。ねじれ振幅は字形を最大このラジアンだけねじる。0.8ラジアン（約46度）は漢字の字形を破壊して
 * 読めなくするため、可読を保つ上限0.3ラジアン（約17度）へ下げる。速さは1フレームあたりの回転を過大にしない1のまま。★暫定。
 */
export const VORTEX_STRENGTH = 0.3;
export const VORTEX_SPEED = 1;
/**
 * 波打ちの強さ・速さ・空間周波数。
 * 採用理由を先に述べる。空間周波数は隣接グリフ間の位相差を決める。2では隣接位相差が約137度となり隣同士がばらばらに
 * 上下して「各文字が個別に上下するだけ」で連続波に見えない。フレーズ全体で約1波長の滑らかな進行波にするため0.7へ下げる
 * （隣接位相差を緩める）。強さは波のうねりを明確にするため0.5から0.7へ上げる。速さ1.5は波が流れて見える値で維持。★暫定。
 */
export const WAVE_STRENGTH = 0.7;
export const WAVE_SPEED = 1.5;
export const WAVE_SPATIAL_FREQ = 0.7;
/** 渦状スキャッター転換で塊を縮める最小倍率（細いリボン状の細さ）。★暫定。 */
export const SCATTER_MIN_SCALE = 0.15;
/**
 * 渦状スキャッター転換の巻き込みのピーク強さ（ラジアン）。
 * 採用理由を先に述べる。転換は退場演出で最終的に読めなくなってよいが、可読から巻き込みへの過程を残すため、字形破壊
 * レベルの0.8より弱い0.45へ抑える。渦（可読常用の0.3）より強く、巻き込みが進む様子を見せる。★暫定。
 */
export const SCATTER_VORTEX_STRENGTH = 0.45;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 渦（ロングトーン・シャウトのその場の歪み）。文字・単語・フレーズ単位。変形寄与のみ。 */
export const swirlDeform: EffectElement = {
  id: "effect.swirlDeform",
  displayName: "渦の歪み",
  targetUnit: "phrase",
  startCondition: { trigger: "duringUnit", requiredSignals: ["duration", "loudness"], selectionHints: ["loudness", "duration"] },
  operates: { deform: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false };
  },
  evaluate(_ctx: EffectContext): AttributeContribution | null {
    return { deform: { kind: "swirl", params: { strength: VORTEX_STRENGTH, speed: VORTEX_SPEED, spatialFreq: 1, phaseOffset: 0 } } };
  },
};

/** 波打ち（発声ニュアンスの波状の歪み）。文字・単語・フレーズ単位。変形寄与のみ。 */
export const waveDeform: EffectElement = {
  id: "effect.waveDeform",
  displayName: "波打ちの歪み",
  targetUnit: "phrase",
  startCondition: { trigger: "duringUnit", requiredSignals: ["duration"], selectionHints: ["loudness", "duration"] },
  operates: { deform: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false };
  },
  evaluate(_ctx: EffectContext): AttributeContribution | null {
    return { deform: { kind: "wave", params: { strength: WAVE_STRENGTH, speed: WAVE_SPEED, spatialFreq: WAVE_SPATIAL_FREQ, phaseOffset: 0 } } };
  },
};

/**
 * 渦状スキャッター転換（句替わりの場面転換）。フレーズ単位。変形（渦）と不透明度を出す。
 * 生存周期の進行で、渦の強さを上げ、塊大きさを SCATTER_MIN_SCALE まで縮め、不透明度を1から0へ落とす。
 * 塊位置は基準位置に置く（中心へ寄せる先はカメラ連動で後続が決める）。変形と不透明度は同居でき、変形排他は
 * 幾何チャネル（位置・回転・大きさ・字間・複製）との間でのみ働く。
 */
export const vortexScatterTransition: EffectElement = {
  id: "effect.vortexScatterTransition",
  displayName: "渦状スキャッター転換",
  targetUnit: "phrase",
  startCondition: { trigger: "onUnitEnd", requiredSignals: ["sectionBoundary"], selectionHints: ["sectionBoundary"] },
  operates: { deform: true, opacity: true },
  defaultPriority: 0,
  estimateCost(_input: EffectCostInput): EffectCost {
    return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    const span = Math.max(1, ctx.unitEndMs - ctx.unitStartMs);
    const progress = clamp01((ctx.gameTimeMs - ctx.unitStartMs) / span);
    // 出の指数で巻き込みを加速させる。塊は等倍から最小倍率へ縮み、不透明度は1から0へ減衰する。
    const eased = outExpo(progress);
    const scale = 1 + (SCATTER_MIN_SCALE - 1) * eased;
    const base = ctx.basePosition ?? { x: 0, y: 0, z: 0 };
    // 不透明度の減衰は渦・縮小よりやや遅らせる（進行度を1.5乗）。これにより「巻き込んで散る」過程が見えてから消える
    // 順序になり、歪み・縮小と同時に一気に消えて読めなくなるのを避ける。
    const fade = 1 - Math.pow(eased, 1.5);
    return {
      deform: {
        kind: "swirl",
        // 巻き込みが進むほど渦を強める（転換専用の巻き込みピーク強度を使う）。
        params: { strength: SCATTER_VORTEX_STRENGTH * eased, speed: VORTEX_SPEED, spatialFreq: 1, phaseOffset: 0 },
        massPlacement: { position: { x: base.x, y: base.y, z: base.z }, scale: { x: scale, y: scale, z: scale } },
      },
      opacity: { factor: fade },
    };
  },
};
