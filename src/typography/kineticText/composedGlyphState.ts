// 演出合成エンジン（Issue #131）が作る最終文字状態の型。
// 複数演出の属性寄与を固定順序で畳んだ結果であり、合成適用層が GlyphHandle へ1回反映する。
// three を持ち込まず数値と Vector3Like で表す（依存規則 docs/decisions/architecture.md §5）。

import type { Vector3Like, ResolvedReadabilityStyle } from "./types";
import type { DeformContribution, DuplicationContribution } from "./effectElement";

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
  /** 変形単位のときの変形の種類とパラメータ。変形でなければ null。 */
  readonly deform: DeformContribution | null;
  /** 縮退適用後の写し計画。各写しは単位レベルの取っ手1つに対応する。複製が無ければ null。 */
  readonly duplication: DuplicationContribution | null;
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
