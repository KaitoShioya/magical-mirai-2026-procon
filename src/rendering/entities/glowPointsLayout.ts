// 発光点の配置を助ける純粋関数。three.js にも文書要素にも依存しないため決定的に単体検証できる。
// 基盤ファクトリ（glowPoints.ts）は配置方針を内蔵せず、呼び手（下流の #60・#61 や診断・検証）が
// ここを使って位置を決める。

/**
 * 0以上1以下の入力を、円板上で面積一様になる半径へ写す。
 * 採用理由を先に述べる。角度を一様、半径を maxRadius×√u（u は0〜1の一様乱数）とすると、半径の確率密度が
 * 半径に比例し、円板上の単位面積あたりの点の数が一定（面積一様）になる。素朴な maxRadius×u は中心が
 * 過密になるため、平方根がこれを補正する。Issue や試作の注釈にある「中心集中」は本関数の効果ではなく、
 * カメラ軌跡（#13）とボロノイ緩和（#62）が下流で作る構図を指す。
 * 入力 u は0以上1以下へ丸める。非有限値は不正入力のため中心（半径0）へ丸める。
 */
export function areaUniformRadius(u: number, maxRadius: number): number {
  if (!Number.isFinite(u) || u <= 0) {
    return 0;
  }
  const clamped = u >= 1 ? 1 : u;
  return Math.sqrt(clamped) * maxRadius;
}

/**
 * 極座標（半径・角度ラジアン）を湖面（水平面）の x・z へ写す。
 * 採用理由を先に述べる。湖面は水平面で、高さ（y）は灯しの種類が別に決める。水平面上の位置だけを
 * 角度0で +x、角度90度で +z になる素直な対応で返す。
 */
export function polarToXZ(radius: number, angle: number): { x: number; z: number } {
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}
