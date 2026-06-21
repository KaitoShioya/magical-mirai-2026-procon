// 文字可読性ゲート（Issue #98）の指標算出。純粋関数のみを持ち、ブラウザ起動部品を読み込まない。
// 仕様の正典は docs/research/08-quality-assurance.md の3節6節。閾値はすべて初期値であり、
// 実装後のプレイ検証で調整して閾値定義集を確定するIssue #104と整合させる。
//
// 検査は2系統。
// (1) コントラスト比: 発光・ブルーム後の最終描画画素で、文字内部の塗りと縁取りのコントラスト比が下限以上か。
// (2) 最小表示画素: 次の2条件で「フロアが命じた最小寸法が最終画素まで届く」ことを保証する。
//   - 絶対下限の明示確認: フロア出力の射影 emProjectedPixelHeight が下限 18 以上か（画素に依らない）。
//     主目的は値 18 のゲート水準での固定と仕様の字義充足で、故障検出力は Issue #31 の単体テスト（往復一致）と
//     重複し限定的である。この条件を「重複だから外す」と値 18 の固定が失われるため外さない。
//   - 忠実度: 画素で測ったインク縦画素 measuredInkHeightPx が幾何の射影 projectedInkPixelHeight と
//     相対差 projectionTolerance 以内で両側で一致するか。レンダリングの縮み・崩れを描画後画素で捕捉する主検査。
// em 高さは設定が定める寸法で画面に描かれないため、描画後インク画素を em へ換算した量は恒等的に 18 を返し
// 検査にならない。よって emPixelHeightEquivalent は合否に用いず参考に留める。

/**
 * 2つの値の相対差（後者を基準とする絶対相対差）を返す。
 * 採用理由を先に述べる。忠実度は「実測のインク縦画素が幾何の射影とどれだけ離れているか」を
 * 表示寸法に依らず見るため、基準（射影の期待値）に対する割合で測る。基準が0以下なら割合は定まらないため非数。
 * @param {number} value 実測値
 * @param {number} reference 基準値（期待値）
 * @returns {number} 相対差（0以上）。基準が0以下または非有限なら非数。
 */
export function relativeDifference(value, reference) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) {
    return Number.NaN;
  }
  return Math.abs(value - reference) / reference;
}

/**
 * 文字可読性ゲートの初期閾値。すべて初期値であり、実装後のプレイ検証で調整して
 * 閾値定義集を確定するIssue #104と整合させる。各値の採用理由と役割を併記する。
 */
export const DEFAULT_THRESHOLDS = {
  // コントラストの合否。ウェブ内容アクセシビリティ指針 2.1 の通常文字の適合水準。
  contrastRatio: 4.5,
  // 絶対下限の明示確認の合否（フロア出力の射影が 18 以上か）。Issue #31 の最小画面画素高初期値で、
  // 診断が minWorldFontSize へ渡すフロアの目標もこの値。値 18 をゲート水準で固定する役割を負う。
  minPixelHeight: 18,
  // 忠実度の実閾値。画素で測ったインク縦画素と幾何射影の許容相対差。アンチエイリアスと二値化で輪郭が
  // 残差として数画素揺れるため厳密一致では正常な描画も外れる。系統的なずれは二値化閾値 0.5 と超過標本化で
  // 小さく抑え、0.15 は残差を吸収する余裕として置く。許容を小さくするほどグリフの縮み・崩れを細かく捕捉できる。
  projectionTolerance: 0.15,
};

/**
 * 文字可読性ゲートの合否を判定する。コントラスト・絶対下限の明示確認・忠実度を真偽で判定し、
 * 不成立の理由を日本語で列挙する。失敗時の扱い（警告か厳格か）は呼び側が決める。
 * @param {object} m 計測値（背景別コントラストと最小表示画素の測定値）
 * @param {object} [thresholds] 閾値（省略時は DEFAULT_THRESHOLDS）
 * @returns {{acceptable:boolean, reasons:string[], cues:{contrastOk:boolean, notDegenerate:boolean, lowerBoundOk:boolean, fidelityOk:boolean}}}
 */
export function evaluateReadabilityAcceptance(m, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds;
  const reasons = [];

  // 1. コントラスト比。5背景それぞれの文字内部対縁取りのコントラスト比が下限以上か。
  // どの背景が下回ったかは reasons に背景ごとに積み、cues には「全背景が適合か」を畳んだ1個の真偽を載せる。
  const backgrounds = Array.isArray(m.backgrounds) ? m.backgrounds : [];
  let contrastOk = backgrounds.length > 0;
  if (backgrounds.length === 0) {
    reasons.push("コントラストの計測結果がありません（背景別の計測が空です）");
  }
  for (const background of backgrounds) {
    if (!(background.fillBorderContrast >= t.contrastRatio)) {
      contrastOk = false;
      reasons.push(
        `背景[${background.kind}] の文字内部対縁取りのコントラスト比が ${Number(
          background.fillBorderContrast
        ).toFixed(2)} で、下限 ${t.contrastRatio} 未満です`
      );
    }
  }

  const p = m.minPixel || {};

  // 2. 絶対下限の明示確認。フロア出力の射影が下限以上か。インク画素に依らないため常に評価する。
  const lowerBoundOk = Number.isFinite(p.emProjectedPixelHeight)
    ? p.emProjectedPixelHeight >= t.minPixelHeight
    : false;
  if (!lowerBoundOk) {
    reasons.push(
      `絶対下限の明示確認が不適合です（フロア出力の射影 emProjectedPixelHeight が ${
        Number.isFinite(p.emProjectedPixelHeight)
          ? Number(p.emProjectedPixelHeight).toFixed(2)
          : "判定不能"
      } で、下限 ${t.minPixelHeight} 未満です）`
    );
  }

  // 3. 退化と未確定。可視範囲が要素数4の有限数で配置確定が済み、インク縦画素とインク世界座標高さが
  // 有限かつ0より大きいか。満たさなければインク計測に依る忠実度の判定はしない。
  const notDegenerate =
    p.visibleBoundsValid === true &&
    Number.isFinite(p.measuredInkHeightPx) &&
    p.measuredInkHeightPx > 0 &&
    Number.isFinite(p.inkWorldHeight) &&
    p.inkWorldHeight > 0;
  if (!notDegenerate) {
    reasons.push(
      "最小表示画素の計測が退化または未確定です（可視範囲が要素数4の有限数でない、配置確定前、または塗りが見つかりません）"
    );
  }

  // 4. 忠実度。実測のインク縦画素が幾何の射影と相対差の許容内で両側で一致するか。
  // 退化・未確定のときはインク計測に依るため判定しない（上で理由を積み済み）。
  let fidelityOk = false;
  if (notDegenerate) {
    const relDiff = relativeDifference(p.measuredInkHeightPx, p.projectedInkPixelHeight);
    fidelityOk = Number.isFinite(relDiff) && relDiff <= t.projectionTolerance;
    if (!fidelityOk) {
      reasons.push(
        `忠実度が不適合です（画素で測ったインク縦画素 ${Number(p.measuredInkHeightPx).toFixed(
          1
        )} が幾何の射影 ${
          Number.isFinite(p.projectedInkPixelHeight)
            ? Number(p.projectedInkPixelHeight).toFixed(1)
            : "判定不能"
        } と相対差 ${
          Number.isFinite(relDiff) ? relDiff.toFixed(3) : "判定不能"
        } で、許容 ${t.projectionTolerance} を超えます。レンダリングの縮み・崩れの可能性）`
      );
    }
  }

  const cues = { contrastOk, notDegenerate, lowerBoundOk, fidelityOk };
  // 合否は理由の有無で決める（空間品質ゲートと同じ）。
  const acceptable = reasons.length === 0;
  return { acceptable, reasons, cues };
}
