// 設計書§5.5の追加技法のうち、寄与チャネルで完結する差し替え可能セット。
// いずれもモーションセット抽象 createMotionSetEffect の上に作る（イージング＋モーションの1セット）。
// 識別名は effect.* で先行登録し、割付規則への文法追加（effectAssignment.ts）で到達可能にする。
// 設計根拠: docs/decisions/visual-expression-design.md §2.1.3（動かし方）・§5.5（追加技法の可否）・
// §2.2.4（各セットの既定イージング）。各セットの既定イージングは付録Aの番号に対応する名前で与える。

import { createMotionSetEffect } from "../motionSet";
import type { EffectElement, EffectCost } from "../effectElement";

function lightCost(): EffectCost {
  return { extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 0, duplication: false };
}

/** 軸（直線移動）。位置の主変形。配分7の背骨。登場は出の指数で減速着地、退場は入りの指数で加速して抜ける。 */
export const axisMove: EffectElement = createMotionSetEffect({
  kind: "transform",
  id: "effect.axisMove",
  displayName: "直線移動（軸）",
  targetUnit: "char",
  startCondition: { trigger: "onUnitStart", selectionHints: ["granularity", "beat"] },
  priority: 0,
  channel: "position",
  layer: "main",
  relativeToBase: true,
  // 基準位置からのオフセット。左から滑り込み、中央を通り抜け、右へ滑り抜ける。文字ごとに登場をずらす。
  // オフセット量の採用理由を先に述べる。±2ワールド単位は画面幅のおよそ4パーセントで「少し右にずれるだけ」になり
  // 疾走感が出ない。読ませる主役はカメラの差動運動で画面中央に留める前提（設計書§1.1.2）のため、入退場は画面外
  // （±18、画面幅のおよそ3分の1超）から滑り込み・滑り抜けてよい。
  // 登場退場の長さの採用理由を先に述べる。設計書§2.1.4は「入退場のイージングを重ね掛けすると、完全停止せず次へ流れて
  // なめらかになる」と定める。重ね掛けは登場と退場の時間窓が重なる（登場時間＋退場時間が単位の表示時間を超える）とき
  // 起こり、そのとき中央でも速度が正のまま通り抜ける。登場時間と退場時間を各400ミリ秒（合計800ミリ秒）に取り、本編の
  // 1拍ほどの単位窓でも目視用の短い窓でも重なるようにして、中央で速度が0になる停止を避ける。★暫定。
  window: { entranceMs: 400, exitMs: 400, perCharStaggerMs: 24 },
  easing: { entrance: "outExpo", exit: "inExpo" },
  values: { from: { x: -18, y: 0, z: 0 }, rest: { x: 0, y: 0, z: 0 }, to: { x: 18, y: 0, z: 0 } },
  cost: lightCost,
});

/** 拡大（柔らかい登場）。大きさの主変形。小さい状態から等倍へ、出の戻りで目標を少し越えてから落ち着く。 */
export const scaleSoftSmash: EffectElement = createMotionSetEffect({
  kind: "transform",
  id: "effect.scaleSoftSmash",
  displayName: "柔らかい拡大登場",
  targetUnit: "char",
  startCondition: { trigger: "onUnitStart", selectionHints: ["beat", "granularity"] },
  priority: 0,
  channel: "scale",
  layer: "main",
  // 値の方向の採用理由を先に述べる。柔らかい拡大登場は「小さい状態から等倍へふわっと広がる」もので、登場の始点 from は
  // 等倍より小さくなければならない。0.3（小）から1.0（等倍）へ、出の戻り（番号35）で一瞬1.1倍ほど膨らんで落ち着く。
  // 以前の from 1.6 は等倍より大きく「1.6倍から縮む」逆方向（縮小登場）だったため修正する。登場時間は柔らかさを出すため
  // 260から360へ延ばす。★暫定。
  window: { entranceMs: 360, exitMs: 0 },
  easing: { entrance: "outBack" },
  values: { from: { x: 0.3, y: 0.3, z: 0.3 }, rest: { x: 1, y: 1, z: 1 }, to: { x: 1, y: 1, z: 1 } },
  cost: () => ({ extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false }),
});

/** 押し潰しと引き伸ばし。大きさの縦横独立（演出役）。登場で縦長・横細から等倍へ。読ませる役では一律へ畳まれる。 */
export const squashStretch: EffectElement = createMotionSetEffect({
  kind: "transform",
  id: "effect.squashStretch",
  displayName: "押し潰しと引き伸ばし",
  targetUnit: "char",
  startCondition: { trigger: "onUnitStart", selectionHints: ["beat", "duration"] },
  priority: 0,
  channel: "scale",
  layer: "main",
  // 伸ばす向きの採用理由を先に述べる。設計書§2.1.3-3は「移動方向へ引き伸ばし垂直に潰す」と定める。本演出は横移動
  // （伴走の横移動・本編の軸移動）と対で使うため、伸ばす向きは横（移動方向）、潰す向きは縦（垂直）にする。以前は縦に
  // 伸ばしていた（移動方向と直交）ため不自然だった。横長・縦細から等倍へ戻す。
  // 弾力の採用理由を先に述べる。単調に戻るだけでは弾力が出ないため、出の戻り（番号35）で等倍を一度行き過ぎてから落ち着き、
  // 横長→縦広→等倍の二次運動（弾み）を出す。登場時間は弾みを見せるため280とする。★暫定。
  window: { entranceMs: 280, exitMs: 0 },
  easing: { entrance: "outBack" },
  // 体積保存風に横を伸ばし縦を縮めた状態から等倍へ。出の戻りの行き過ぎで等倍を越えて弾む。
  values: { from: { x: 1.7, y: 0.5, z: 1 }, rest: { x: 1, y: 1, z: 1 }, to: { x: 1, y: 1, z: 1 } },
  cost: () => ({ extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 1, glowTargets: 0, duplication: false }),
});

/** 点滅。不透明度の方形波（電飾・発光の質感）。点灯時に発光を添える。 */
export const blink: EffectElement = createMotionSetEffect({
  kind: "squareWave",
  id: "effect.blink",
  displayName: "点滅",
  targetUnit: "char",
  startCondition: { trigger: "duringUnit", selectionHints: ["beat"] },
  priority: 0,
  halfPeriodMs: 120,
  // 点灯時の発光を眩くする理由を先に述べる。発光0.6では点灯が弱く「ただ点滅するだけ」に見える。点灯を1.0（最大）まで
  // 上げると電飾のように眩く明滅し、ブルームのにじみと相まって電飾・発光の質感が出る。★暫定。
  onGlow: 1.0,
  cost: () => ({ extraGlyphs: 0, gsapTargetsPerFrame: 1, troikaSyncs: 0, glowTargets: 1, duplication: false }),
});

/** 浮遊・小刻みの揺らぎ。位置の揺らぎ層（合成器が加算する唯一の層）。生気・不安定さ。 */
export const floatJitter: EffectElement = createMotionSetEffect({
  kind: "jitter",
  id: "effect.floatJitter",
  displayName: "浮遊・小刻み",
  targetUnit: "char",
  startCondition: { trigger: "duringUnit", selectionHints: ["loudness"] },
  priority: 0,
  // 振幅の採用理由を先に述べる。0.05では微小で「ほぼ静止」に見える。漂いを読ませるため縦振幅を文字径のおよそ
  // 5パーセント（0.12）へ上げ、横はその4分の1ほどに留めて主に上下に漂わせる。0.8Hzのゆっくりした周期で漂う。★暫定。
  amplitude: { x: 0.03, y: 0.12, z: 0 },
  freqHz: 0.8,
  loudnessGain: 1,
  cost: lightCost,
});

/** 全体回転・回転して戻す。回転の主変形（単語・フレーズ単位）。出の戻りで行き過ぎてから戻る。 */
export const wordRotation: EffectElement = createMotionSetEffect({
  kind: "transform",
  id: "effect.wordRotation",
  displayName: "全体回転・回転して戻す",
  targetUnit: "word",
  startCondition: { trigger: "onUnitStart", selectionHints: ["granularity", "beat"] },
  priority: 0,
  channel: "rotation",
  layer: "main",
  // 回転量の採用理由を先に述べる。-0.35ラジアン（約-20度）は小さく「少し動くだけ」に見える。-1.0ラジアン（約-57度）まで
  // 大きく傾けてから出の戻り（番号35）の行き過ぎで等角へ戻すと、弾むように回って登場する躍動が読める。登場時間は回転の弧を
  // 見せるため300から400へ延ばす。★暫定。
  window: { entranceMs: 400, exitMs: 0 },
  easing: { entrance: "outBack" },
  values: { from: { x: 0, y: 0, z: -1.0 }, rest: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } },
  cost: lightCost,
});

/** 単位の暗転・句読点。不透明度（フレーズ・画面全体単位）。登場で現れ退場で消える。 */
export const unitOpacity: EffectElement = createMotionSetEffect({
  kind: "scalar",
  id: "effect.unitOpacity",
  displayName: "単位の暗転・句読点",
  targetUnit: "phrase",
  startCondition: { trigger: "duringUnit", selectionHints: ["sectionBoundary", "duration"] },
  priority: 0,
  channel: "opacity",
  // 時間とイージングの採用理由を先に述べる。160ミリ秒登場・200ミリ秒退場は速く、短い句では現れてすぐ消えて「点滅するだけ」に
  // 見える。登場280・退場360へ延ばし、退場は句読点の滑らかさを優先して両端の遅い正弦の入り出（番号4）にする（暗転と同じ、
  // 滑らかに沈む読後感の局面のため指数から外す）。★暫定。
  window: { entranceMs: 280, exitMs: 360 },
  easing: { entrance: "outExpo", exit: "inOutSine" },
  values: { from: 0, rest: 1, to: 0 },
  cost: lightCost,
});

/**
 * 頭文字の予告フラッシュ。不透明度（文字単位）。登場直後にパッと現れて予告する。
 * 設計の核（§5.5「輪郭だけを1コマ先に出してから塗りで本体」の2段構成）は、輪郭の表示（縁取り可視・塗り不透明度0）を
 * 扱う専用の寄与チャネルが要る。現状の寄与モデルは輪郭チャネルを持たないため、不透明度1チャネルでの近似に留める。
 * 近似の採用理由を先に述べる。入りの指数（番号23の逆、終盤に急上昇）は終端まで暗く最後に点くため「一瞬点滅」に見える。
 * 出の指数（番号23）に変え、素早く現れてそのまま留まる「予告」の見えにする。時間も90から150へ延ばす。★暫定。
 * 輪郭先出しの完全版は輪郭チャネルの導入を要する別課題とする。
 */
export const initialFlash: EffectElement = createMotionSetEffect({
  kind: "scalar",
  id: "effect.initialFlash",
  displayName: "頭文字の予告フラッシュ",
  targetUnit: "char",
  startCondition: { trigger: "onUnitStart", selectionHints: ["beat"] },
  priority: 0,
  channel: "opacity",
  window: { entranceMs: 150, exitMs: 0 },
  easing: { entrance: "outExpo" },
  values: { from: 0, rest: 1, to: 1 },
  cost: lightCost,
});
