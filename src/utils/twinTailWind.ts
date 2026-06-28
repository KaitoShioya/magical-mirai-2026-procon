// ツインテールの常時の風なびきを与える純粋な数値計算（中心表示のミク・描画補助）。
// (経過秒, パラメータ, 位相差) から、スプリングボーンの外力に与える「風の局所方向」と「強さ」だけを返す。
// three.js のベクトルだけを名前付きで取り込み、Object3D やスプリングボーンには触れない（副作用なし）。
//
// 配置の理由を先に述べる。これは時刻に基づく純粋な数値計算であり、rendering は「時刻の論理を持たない」
// （docs/decisions/architecture.md §5）。src/utils の責務は「数値計算」を含む（src/utils/README.md）ため、
// 画面拡大・減衰揺れ評価器（screenShake.ts）やカメラ軌跡評価器（cameraTrajectory.ts）と同じ配置とする。
// 実際にスプリングボーンの設定へ当てるのは中心表示のモーション層（vrmMotion.ts の createDynamicPosedMotion）である。
//
// 局所方向で返す理由を先に述べる。スプリングボーンの重力方向はワールド空間で解釈されるが、ミクの向き
// （rotationY を含む配置）は実行時の状態であり純粋関数が持つべきでない。本関数はミクの局所座標での方向を返し、
// 呼び出し側が中心表示オブジェクトのワールド回転で変換する。これにより向きに依存せず正しくなる。

import { Vector3 } from "three";

/** ツインテールの風のパラメータ（曲非依存・モデルの配置に依存しない）。 */
export interface TwinTailWindParams {
  /** 風の基本方向（ミク局所座標）。垂れる方向の反対へ流すため後方かつ上向きを与える。 */
  readonly baseDirectionLocal: { readonly x: number; readonly y: number; readonly z: number };
  /** 流れの強さ（スプリングボーンの gravityPower に与える値）。 */
  readonly power: number;
  /** 方向の揺らぎ量（0以上1未満）。基本方向に直交する成分へ加える正弦波の振幅。 */
  readonly oscillationAmplitude: number;
  /** 揺らぎの周波数（ヘルツ、1秒あたりの振動回数）。 */
  readonly oscillationFrequencyHz: number;
}

/** 風の計算結果。局所方向（正規化済み）と強さ。 */
export interface TwinTailWindResult {
  /** 正規化済みの風の局所方向（ミク局所座標）。呼び出し側がワールド回転で変換する。 */
  readonly directionLocal: Vector3;
  /** 流れの強さ（gravityPower へ与える値）。 */
  readonly power: number;
}

/**
 * 風の局所方向と強さを計算する。
 *
 * 揺らぎは、基本方向に直交する水平軸まわりへ振幅 `oscillationAmplitude` の正弦波で与える。基本方向そのものは
 * 一定に保ち（定常バイアス）、揺らぎは直交成分にのみ加える。これにより、正規化後も風方向と基本方向の内積が
 * 常に正の一定以上に保たれ、どの瞬間に標本化しても「真下（垂れ）でない」判定が一意に定まる。
 *
 * 直交軸の選び方の理由を先に述べる。基本方向（後方かつ上向き）と、横方向の単位ベクトル `(1,0,0)` から、
 * 基本方向への射影を除いた成分を直交軸とする。横方向の揺らぎは左右の振れに見え、上下方向より自然である。
 *
 * @param elapsedSeconds 経過秒（絶対時刻でなく開始からの累積秒）。
 * @param params 風のパラメータ。
 * @param phaseOffset 揺らぎの位相差（ラジアン）。左右2本のツインテールへ異なる値を与えて同じ動きで固まらないようにする。
 */
export function twinTailWind(
  elapsedSeconds: number,
  params: TwinTailWindParams,
  phaseOffset: number
): TwinTailWindResult {
  const base = new Vector3(
    params.baseDirectionLocal.x,
    params.baseDirectionLocal.y,
    params.baseDirectionLocal.z
  ).normalize();

  // 横方向の単位ベクトルから基本方向への射影を除き、基本方向に直交する水平寄りの軸を作る。
  const horizontal = new Vector3(1, 0, 0);
  const perpendicular = horizontal
    .clone()
    .addScaledVector(base, -horizontal.dot(base));
  // 基本方向がほぼ横方向に一致して直交軸が消える場合は、奥行き方向 (0,0,1) を代わりに使う。
  if (perpendicular.lengthSq() < 1e-6) {
    perpendicular.set(0, 0, 1).addScaledVector(base, -base.z);
  }
  perpendicular.normalize();

  const angle = 2 * Math.PI * params.oscillationFrequencyHz * elapsedSeconds + phaseOffset;
  const wiggle = Math.sin(angle) * params.oscillationAmplitude;

  const directionLocal = base
    .clone()
    .addScaledVector(perpendicular, wiggle)
    .normalize();

  return { directionLocal, power: params.power };
}
