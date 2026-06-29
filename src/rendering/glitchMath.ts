// グリッチ後処理の横ずれ計算（純粋・決定的）。
// 設計根拠: docs/decisions/visual-expression-design.md §5.2（グリッチは行のy座標と時刻から横ずれと色ずれを与える）。
// グリッチのシェーダ（postEffectShader.ts のグリッチパス）と同じ計算をここに純粋関数として持ち、Node 上で
// 決定性（同じ入力で同じ出力）とシーク再現性を単体検査する。乱数・フレーム計数を使わず、時刻と強度だけで決まる
// ため、再生位置を後戻り（シーク）しても同じ画素になる。依存規則§5（描画層は状態を読むだけ・three非依存）。

/** 横ずれの最大量（画面幅に対する割合）。強度1・極大時の片側の最大ずれ。★暫定。 */
export const GLITCH_MAX_OFFSET = 0.08;

/** 縦の縞（スライス）の本数。行をこの本数へ量子化して縞ごとに横ずれを与える。★暫定。 */
export const GLITCH_SLICE_COUNT = 24;

/**
 * 縦位置 y（0以上1以下）が属する縞の番号（0からスライス数−1）。
 * 行をスライス数へ量子化し、同じ縞は同じ横ずれになる（縞単位でずれる見えを作る）。
 */
export function sliceIndexAt(y: number, sliceCount: number): number {
  const clamped = y < 0 ? 0 : y > 1 ? 1 : y;
  const index = Math.floor(clamped * sliceCount);
  // y=1 ちょうどは index=sliceCount になるため、最終縞へ収める。
  return Math.min(sliceCount - 1, index);
}

/**
 * 決定的な擬似乱数（0以上1未満）。整数の種から sin の小数部で散らす。シェーダの fract(sin(...)*k) と同じ方式で、
 * 乱数生成器を持たず種だけで決まるため再現性がある。
 */
function hash01(seed: number): number {
  const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * 縞番号・時刻（秒）・強度（0以上1以下）から横ずれ量（画面幅に対する割合、−GLITCH_MAX_OFFSET〜+GLITCH_MAX_OFFSET）を返す。
 * 強度0では必ず0（ずれ無し）。時刻は一定刻みへ量子化された値を渡す前提で、同じ（縞, 時刻, 強度）なら同じ値になる。
 */
export function glitchOffsetAt(sliceIndex: number, timeSec: number, intensity: number): number {
  const clampedIntensity = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  if (clampedIntensity === 0) return 0;
  // 時刻を粗い格子（10分の1秒）へ量子化して種に混ぜ、縞ごとに時間で切り替わる横ずれを作る。
  const timeBucket = Math.floor(timeSec * 10);
  const noise = hash01(sliceIndex * 1.7 + timeBucket * 3.1);
  // 0〜1 を −1〜+1 へ写し、強度と最大量で尺度する。
  return (noise * 2 - 1) * clampedIntensity * GLITCH_MAX_OFFSET;
}
