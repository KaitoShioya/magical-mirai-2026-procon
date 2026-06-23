// 内蔵水準カーブ（Issue #66）。総合得点 S を、理論最大・最小から合成し少数実測で補正した累積分布関数で百分位へ写す。
// Issue #55 の simplePercentile（理論端上の一様分布の線形写像）を磨く版である。曲固有の絶対値を持たず、
// 正規化得点率 t=(S-Smin)/(Smax-Smin) 上のアンカーで表すことで曲非依存（Smin・Smax を引数で受ける）を保つ。
// 依存規則に従い profiles・rendering・tools・three.js を取り込まない。ScoreBounds 型のみ percentile.ts から取り込む
// （percentile.ts は levelCurve.ts を取り込まないため循環参照は生じない）。

import type { ScoreBounds } from "./percentile";

// 水準カーブのアンカー点。fraction は正規化得点率（0以上1以下）、percentile はそのときの百分位（0以上100以下）。
// 両フィールドを読み取り専用にして、型の上での書き換えを防ぐ。
export interface LevelCurveAnchor {
  readonly fraction: number;
  readonly percentile: number;
}

// 内蔵の水準カーブ（Issue #66、判断2の初期アンカー5点）。
// 採用理由を先に述べる。総合得点 S は和音タップ最大 N 回（N はタップ総数上限）の各寄与の和に上限付きコンボを加えた値であり、
// 理論最小（全く反応しない、または素点0の床タップだけ）と理論最大（全タップが両JUSTかつ最大倍率かつ最大コンボ）は
// N 回のタップが同時に退化または完全である必要があり、その確率は N に対し幾何級数的に小さく実質到達不能である。
// ゆえに実際の得点は両端から離れて中央へ集中し、累積分布は中央が急・両端が緩いS字になる。実測が無い段階で得点分布の
// 歪みの向きを主張しないため、中心（得点率0.5）で百分位50を通る対称形（百分位 p が p(t)+p(1-t)=100 を満たす）を採る。
// 中央の傾きを端の4倍とする初期値は集中度の中庸な見積もりであり、端を平坦化する極端な集中も、傾きが一定の無集中（一様＝線形）も
// 避ける中間値として採る。具体値は実測で確定する★暫定であり、通しプレイ成立（Issue #59）後のプレイ検証の実測で内部3点
// （得点率0.25・0.5・0.75）を置き換える。端点（得点率0で百分位0、得点率1で百分位100）は理論で固定し置き換えない。
//
// 実行時の書き換えも防ぐため、配列と各アンカーを Object.freeze で凍結する。凍結する理由は、本定数が「静的に同梱する固定分布」であり、
// 実行中に書き換えられないことを型と実行時の両方で保証して固定分布の不変性を堅くするためである。
export const BUILTIN_LEVEL_CURVE: readonly LevelCurveAnchor[] = Object.freeze([
  Object.freeze({ fraction: 0, percentile: 0 }), // 理論最小（端点固定）
  Object.freeze({ fraction: 0.25, percentile: 10 }), // ★暫定。中央へ集中するS字の下側
  Object.freeze({ fraction: 0.5, percentile: 50 }), // ★暫定。対称の中心
  Object.freeze({ fraction: 0.75, percentile: 90 }), // ★暫定。中央へ集中するS字の上側
  Object.freeze({ fraction: 1, percentile: 100 }), // 理論最大（端点固定）
]);

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  return value > max ? max : value;
}

// 有限な数値かを判定する小道具。型に反するランタイムの要素（null・数値でないフィールド）を例外にせず弾くために使う。
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// 水準カーブの妥当性検査（Issue #66、判断6）。次を全て満たすとき真。1つでも満たさなければ偽。
// 本関数は levelCurve.ts から輸出して単体テストが直接使うが、公開窓口 index.ts からは再輸出しない
// （本番経路の防御であり外部から呼ばないため）。
// 端点固定と値域を検査に含める理由を先に述べる。docs/research/04-ux-and-chart-design.md §3 は累積分布関数を「理論最大・最小から
// 合成する」と定め、本設計は端点（理論最小で百分位0、理論最大で百分位100）を理論で固定することを核心とする。端点と値域を
// 検査しないと、先頭が得点率0でないカーブや得点率が0未満・1超のカーブを有効扱いし、理論端固定の不変条件と矛盾する。
// 型に反するランタイムの要素（null・疎配列の空き・数値でないフィールド）も例外を投げず偽へ倒す。倒す理由を先に述べる。
// percentileFromLevelCurve は curve を引数で受ける公開関数であり、本モジュールの「不正・縮退入力では例外を投げず0へ倒す」規約を
// 保つため、検査もここで止めず偽を返す。
export function isValidLevelCurve(curve: readonly LevelCurveAnchor[]): boolean {
  if (!Array.isArray(curve) || curve.length === 0) return false;
  // 各要素の構造・値域・単調性を順に検査する。型に反する要素はこの段階で偽へ倒す。
  let previous: { fraction: number; percentile: number } | undefined;
  for (const item of curve as readonly unknown[]) {
    if (item === null || typeof item !== "object") return false;
    const fraction = (item as { fraction?: unknown }).fraction;
    const percentile = (item as { percentile?: unknown }).percentile;
    if (!isFiniteNumber(fraction) || !isFiniteNumber(percentile)) return false;
    if (fraction < 0 || fraction > 1) return false; // 得点率の値域
    if (percentile < 0 || percentile > 100) return false; // 百分位の値域
    if (previous !== undefined) {
      if (!(fraction > previous.fraction)) return false; // 厳密増加（重複なし。補間の分母が0にならない）
      if (percentile < previous.percentile) return false; // 単調非減少（累積分布関数の単調性）
    }
    previous = { fraction, percentile };
  }
  // 端点固定。理論最小で百分位0、理論最大で百分位100。上のループで全要素が有限な数値と確かめ済みのため、ここで例外は起きない。
  const first = curve[0] as { fraction: number; percentile: number };
  const last = curve[curve.length - 1] as { fraction: number; percentile: number };
  if (first.fraction !== 0 || first.percentile !== 0) return false;
  if (last.fraction !== 1 || last.percentile !== 100) return false;
  return true;
}

// 総合得点 S を、水準カーブ（累積分布関数）で百分位 [0,100] へ写す（Issue #66、判断1）。
// 採用理由を先に述べる。docs/research/04-ux-and-chart-design.md §3 は「目的関数の理論的な最大と最小から合成した累積分布の
// 関数を作り、少数の実測で補正して同梱する」と定める。正規化得点率 t=(S-Smin)/(Smax-Smin) 上のアンカーを区分線形に補間する
// ことで、少数の実測をそのまま補正点（アンカー）に使えて文言に直接対応し、かつ曲非依存（Smin・Smax を引数で受ける）を保つ。
// アンカーを対角線（端点2点のみ）に置けば一様分布の線形写像 simplePercentile に一致するため、本関数は simplePercentile の
// 真の一般化（後退互換）である。
//
// 防御は次の順とする。score が非有限・理論端が非有限・区間幅が0以下（縮退）・カーブが無効、のいずれでも0（最下位相当）を返す。
// 縮退時の戻り値を0で揃える理由は、simplePercentile と扱いが食い違うと呼び出し側でどちらを使うかにより結果が変わるためである。
export function percentileFromLevelCurve(
  score: number,
  bounds: ScoreBounds,
  curve: readonly LevelCurveAnchor[] = BUILTIN_LEVEL_CURVE,
): number {
  if (!Number.isFinite(score)) return 0;
  if (!Number.isFinite(bounds.min) || !Number.isFinite(bounds.max)) return 0;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return 0; // 縮退（Smax<=Smin）では順位差を作れないため0
  if (!isValidLevelCurve(curve)) return 0; // 無効カーブ（判断6）

  const t = clamp((score - bounds.min) / span, 0, 1);
  // 区分線形補間。curve は端点固定（先頭の得点率0、末尾の得点率1）で得点率が厳密増加のため、t は必ずいずれかの区間に入る。
  for (let i = 1; i < curve.length; i++) {
    const lower = curve[i - 1];
    const upper = curve[i];
    if (t <= upper.fraction) {
      const width = upper.fraction - lower.fraction; // 厳密増加より正
      const ratio = (t - lower.fraction) / width;
      const p = lower.percentile + (upper.percentile - lower.percentile) * ratio;
      return clamp(p, 0, 100);
    }
  }
  // 端点固定により t<=1 は必ず上で返るが、浮動小数点の保険として末尾の百分位を返す。
  return clamp(curve[curve.length - 1].percentile, 0, 100);
}

// 百分位（高いほど上位）を「上位◯パーセント相当」の◯（上位率）へ変換する単一の所有元（Issue #66、判断5）。
// 採用理由を先に述べる。内部の百分位 p は高得点ほど大きいため、そのまま「上位 p パーセント」と書くと意味が反転する
// （百分位90は上位10パーセント相当である）。よって上位率 100-p で算出する。上位率を整数へ四捨五入する理由は、固定分布の
// 推定では小数1桁未満の精度に意味が無く、整数表示のほうが読みやすいためである。百分位が非有限なら最下位相当として100
// （上位100パーセント相当）を返す。非有限を100へ倒す理由は、百分位の非有限を最下位相当（百分位0）と同じ扱いにし、
// 100-0=100 と一致させるためである。
export function topPercentFromPercentile(percentile: number): number {
  if (!Number.isFinite(percentile)) return 100;
  const p = clamp(percentile, 0, 100);
  return clamp(Math.round(100 - p), 0, 100);
}
