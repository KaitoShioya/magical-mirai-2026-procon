// 演出合成エンジン（Issue #131）が作る最終文字状態の型。
// 複数演出の属性寄与を固定順序で畳んだ結果であり、合成適用層が GlyphHandle へ1回反映する。
// three を持ち込まず数値と Vector3Like で表す（依存規則 docs/decisions/architecture.md §5）。

import type { Vector3Like, ResolvedReadabilityStyle, DeformKind, DeformParams } from "./types";
import type { DuplicationContribution, ClipContribution } from "./effectElement";

/**
 * 変形単位の合成結果。変形の種類とパラメータに加え、解決済みの塊配置（位置・大きさ）を持つ。
 * 塊配置は寄与（DeformContribution.massPlacement）が無いとき、合成器が基準位置・等倍を補って確定させる。
 * これにより適用層は分岐なく塊配置を変形取っ手へ反映できる（設計書§2.3.4）。
 */
export interface ComposedDeformState {
  readonly kind: DeformKind;
  readonly params: DeformParams;
  /** 塊全体の位置（解決済み、ワールド座標）。 */
  readonly massPosition: Vector3Like;
  /** 塊全体の大きさ（解決済み、縦横独立の絶対倍率）。 */
  readonly massScale: Vector3Like;
}

/**
 * 1単位・1時刻の最終文字状態。各値は合成器が寄与列から決定的に作る。
 * 変形単位（deform が非 null）では位置・回転・大きさ・字間・複製を持たない（変形排他）。
 */
export interface ComposedGlyphState {
  /** 位置（基準位置に主変形の絶対値または揺らぎの加算を反映した値、ワールド座標）。 */
  readonly position: Vector3Like;
  /**
   * 回転（オイラー角ラジアン、主変形の絶対値に揺らぎの加算を乗せた値）。回転を操作する寄与が無いときは null。
   * null のとき適用層は setRotation を呼ばず、エンジンのカメラ正対を保つ。
   */
  readonly rotation: Vector3Like | null;
  /** 大きさ（縦横独立の絶対倍率）。読ませる役は3成分が等しい。 */
  readonly scale: Vector3Like;
  /** 字間。フレーズ・単語のみ。文字単位と画面全体は null。 */
  readonly letterSpacing: number | null;
  /** 合成・発光・読ませる役の発光抑制を反映した最終塗り色（sRGBの16進）。 */
  readonly color: number;
  /** 透明度（0以上1以下）。読ませる役は下限を満たす。 */
  readonly opacity: number;
  /** 最終輝度がブルーム閾値を超え発光対象として数えるか。読ませる役は常に false。 */
  readonly glowing: boolean;
  /** 変形単位のときの変形の種類・パラメータ・解決済みの塊配置。変形でなければ null。 */
  readonly deform: ComposedDeformState | null;
  /** 縮退適用後の写し計画。各写しは単位レベルの取っ手1つに対応する。複製が無ければ null。 */
  readonly duplication: DuplicationContribution | null;
  /** 矩形の切り抜き（部首分解・縦横ブラインド近似）。切り抜きが無ければ null。 */
  readonly clip: ClipContribution | null;
  /** 読ませる役のときの確定可読性指定。段6で applyReadability に渡す。演出役は null。 */
  readonly readability: ResolvedReadabilityStyle | null;
  /** 診断用。変形単位で捨てた1文字ごとの幾何チャネルの寄与件数。 */
  readonly droppedGeometricContributions: number;
  /** 診断用。文字単位または画面全体で捨てた字間寄与の件数。 */
  readonly droppedLetterSpacing: number;
  /** 診断用。読ませる役へ縦横独立の倍率が来て一律倍率（各軸最大値）へ畳んだか。 */
  readonly collapsedNonUniformScale: boolean;
  /** 診断用。変形単位で読ませる役の確定可読性指定を無効化（null強制）したか。 */
  readonly forcedReadabilityNull: boolean;
}
