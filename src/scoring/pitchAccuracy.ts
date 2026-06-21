// 音程精度の純粋関数（Issue #48）。タップ音程スロットが、そのノーツの正解スロットにどれだけ近いかを返す。
// 採用する形の根拠を先に述べる。本作は外れ音が物理的に存在せず（どのスロットも協和音）、音程JUSTは
// 「その瞬間の正解スロットへの完全一致」で最も明確に定義できる。完全一致を満点、それ以外を距離に依らない一定の床値とすると、
// 判定がスロット数に依存せず単純で、音程を狙う動機を保ちつつ失敗のない床を厚くする（ユーザー承認・出典 docs/idea/concept-final.md §4・§6）。
// 床値が単一所有モジュールに属する値であるため、src/config/tuning.ts ではなく本モジュールに定義する
// （tuning.ts 冒頭の規則「単一の所有モジュールが定まる値は所有モジュールが持つ」）。

/** 音程を外したタップの床値。★暫定（プレイ検証で調整）。完全一致との差を残しつつ失敗のない床を保つための初期値。 */
export const PITCH_MISS_FLOOR = 0.2;

/**
 * タップ音程スロットとノーツ正解スロットから音程精度（0以上1以下）を返す。
 * 完全一致は1.0、それ以外は床値。両スロットは0始まり。
 * 非有限値・非整数は不一致とみなし床値を返す（失敗のない床の方針のため判定を止めない）。
 */
export function pitchAccuracy(tapSlot0: number, noteSlot0: number): number {
  if (!Number.isInteger(tapSlot0) || !Number.isInteger(noteSlot0)) {
    return PITCH_MISS_FLOOR;
  }
  return tapSlot0 === noteSlot0 ? 1 : PITCH_MISS_FLOOR;
}

/**
 * 音程JUST（完全一致）か。0始まりの両スロットが整数で等しいときだけ真。
 * #54 ゲージと #55 スコアが「音程の成功」の素データとして用いる。
 */
export function isPitchJust(tapSlot0: number, noteSlot0: number): boolean {
  return Number.isInteger(tapSlot0) && Number.isInteger(noteSlot0) && tapSlot0 === noteSlot0;
}
