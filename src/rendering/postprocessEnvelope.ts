// 後処理（グリッチ・色ずれ・句読点反転）を駆動する強度の包絡計算（純粋・決定的）。
// 設計根拠: docs/decisions/visual-expression-design.md §2.2.4・§5.2（色ずれは強拍で立ち上がる、句読点反転は曲の
// 切れ目でインパルス駆動、グリッチは場面転換のアクセント）。後処理は文字の取っ手を持たないため EffectElement
// ではなく、ここで純粋に強度（0以上1以下）を算出し、描画層の設定関数（renderRoot.setChromaBurstIntensity 等）へ
// 渡す側（#59・本編結線）が使う。値の算出だけを担い、描画層へ依存しない（依存規則§5）。本モジュールは
// シーク再現性のため乱数・状態を持たず、再生位置と契機の時刻だけで強度を決める。

/** 減衰の形。"linear"＝直線、"exp"＝指数（序盤に速く減衰、余韻が短い）。 */
export type DecayShape = "linear" | "exp";

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 契機からの経過 elapsedMs と持続 durationMs から、1から0へ減衰する強度を返す。
 * elapsedMs<=0 で1、elapsedMs>=durationMs で0。durationMs<=0 のときは0（持続なし）。
 * "exp" は同じ端点（0で1、durationMsで0）を保ちつつ序盤に速く落ちる（余韻を短く鋭くする）。
 */
export function decayEnvelope(elapsedMs: number, durationMs: number, shape: DecayShape = "linear"): number {
  if (!(durationMs > 0)) return 0;
  if (elapsedMs <= 0) return 1;
  if (elapsedMs >= durationMs) return 0;
  const linear = 1 - elapsedMs / durationMs;
  if (shape === "linear") return linear;
  // 指数減衰: 端点を保つよう、直線の進行 t=elapsed/duration に対し (1 - t) を2乗して序盤を急にする。
  return linear * linear;
}

/**
 * 現在時刻 gameTimeMs に対し、直前の契機（pulseTimesMs のうち gameTimeMs 以下で最も近いもの）からの減衰強度を返す。
 * 契機が無い、または直前の契機から durationMs を過ぎていれば0。色ずれ（強拍）・句読点反転（曲の切れ目）・
 * グリッチ（場面転換）を、契機の時刻列とインパルスの持続で駆動するために使う。
 *
 * 探索方法に二分探索を採る理由を先に述べる。色ずれは拍の時刻列で駆動し、拍は曲全体で数百件になりうる
 * （目安＝約200秒・毎分175拍の曲で 200×175÷60≈583件）。これを毎フレーム線形に走査すると無駄が大きい。
 * pulseTimesMs は昇順である前提のため、再生位置以下で最も近い契機（昇順列で gameTimeMs 以下の最後の要素）を
 * 二分探索で対数時間で求める。昇順列では「gameTimeMs 以下で最大の契機」と「gameTimeMs 以下の最後の要素」は
 * 一致するため、結果は線形走査と同じになる。
 */
export function pulseEnvelopeAt(
  gameTimeMs: number,
  pulseTimesMs: readonly number[],
  durationMs: number,
  shape: DecayShape = "linear",
): number {
  // gameTimeMs 以下の最後の契機の添字を二分探索する。見つからなければ -1。
  let low = 0;
  let high = pulseTimesMs.length - 1;
  let latestIndex = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pulseTimesMs[mid] <= gameTimeMs) {
      latestIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (latestIndex === -1) return 0;
  return clamp01(decayEnvelope(gameTimeMs - pulseTimesMs[latestIndex], durationMs, shape));
}
