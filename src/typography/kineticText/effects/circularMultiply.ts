// 演出文法③「円状回転・重ね増殖」の実演出（Issue #25）。
// 同一フレーズの連発を、円状に並べて回す・一点に重ねて増殖させる表現にする。設計根拠:
// docs/decisions/visual-expression-design.md §2.1.5（同一フレーズの連発＝円状に並べて回す、または一点に重ねて増殖）。
// 単語単位。回転の主変形と複製（円状）を出す。複製は変形・回転を写しへ渡せない制約のため、写しは円周上の位置の
// ずれと大きさ・不透明度だけを持ち、回転は塊全体（主取っ手）の回転で与える（合成器が写しへ回転を渡さないため）。

import type {
  EffectElement,
  EffectContext,
  AttributeContribution,
  EffectCost,
  EffectCostInput,
  DuplicateCopy,
} from "../effectElement";

/** 円周上に並べる写しの数。1個ずつを判別できるよう5にする。★暫定。 */
export const CIRCULAR_COPIES = 5;
/**
 * 円の半径（ワールド単位）。
 * 採用理由を先に述べる。半径が単語の幅より小さいと写しが中心で重なり団子に見え「光の塊」になる。単語の幅
 * （短語でおよそ6ワールド単位）より広く、円環として1個ずつ読める7へ広げる。★暫定。
 */
export const CIRCULAR_RADIUS = 7;
/** 1秒あたりの公転の角速度（ラジアン）。円環全体をゆっくり回す初期値。★暫定。 */
export const CIRCULAR_SPIN_RATE = Math.PI / 2;

export const circularMultiply: EffectElement = {
  id: "effect.circularMultiply",
  displayName: "円状回転・重ね増殖",
  targetUnit: "word",
  startCondition: { trigger: "onUnitStart", requiredSignals: ["duration"], selectionHints: ["granularity", "duration"] },
  // 回転の主変形を持たせない理由を先に述べる。塊全体の回転（主変形）と写しの公転（複製の位置回転）を同時に出すと、
  // 字が二重に回って読めなくなる。設計の「円状に並べて回す」は、写しを円周上に配置しその配置角を時間で回す公転で
  // 表せる。写しには回転が渡らない（合成器の制約）ため、写しは正立のまま円環として読め、円環全体が公転で回る。
  // よって本演出は複製だけを操作し、回転の主変形は使わない。
  operates: { duplication: true },
  defaultPriority: 0,
  estimateCost(input: EffectCostInput): EffectCost {
    return {
      extraGlyphs: CIRCULAR_COPIES * input.unitGlyphCount,
      gsapTargetsPerFrame: CIRCULAR_COPIES,
      troikaSyncs: 1,
      glowTargets: 0,
      duplication: true,
    };
  },
  evaluate(ctx: EffectContext): AttributeContribution | null {
    // 公転の角。時間で円環全体を回す（各写しの配置角に加える）。
    const spin = (ctx.gameTimeMs / 1000) * CIRCULAR_SPIN_RATE;
    const copies: DuplicateCopy[] = [];
    for (let index = 0; index < CIRCULAR_COPIES; index += 1) {
      const theta = spin + (index / CIRCULAR_COPIES) * Math.PI * 2;
      copies.push({ offset: { x: Math.cos(theta) * CIRCULAR_RADIUS, y: Math.sin(theta) * CIRCULAR_RADIUS, z: 0 } });
    }
    return {
      duplication: { layout: "polar", copies, minCount: 3 },
    };
  },
};
