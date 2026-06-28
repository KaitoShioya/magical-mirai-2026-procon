// レーン選択精度の純粋関数（Issue #48）。タップしたレーンが、そのノーツの正解レーンに一致するかを返す。
// 関数名・定数名（pitchAccuracy・PITCH_MISS_FLOOR・isPitchJust）は提出直前の大規模改名のリスクを避け温存し、
// 説明文だけをレーン選択の語へ更新する（出典 docs/idea/concept-final.md §4・§6、Codexレビュー反映）。
// 採用する形の根拠を先に述べる。本作はどのレーンを叩いても心地よい打楽器が鳴り外れ音が無いため、成功は
// 「そのノーツの正解レーンへの一致」で最も明確に定義できる。一致を満点、不一致を距離に依らない一定の床値とすると、
// 判定がレーン数に依存せず単純で、正解レーンを狙う動機を保ちつつ失敗のない床を厚くする（ユーザー承認）。
// 床値が単一所有モジュールに属する値であるため、src/config/tuning.ts ではなく本モジュールに定義する
// （tuning.ts 冒頭の規則「単一の所有モジュールが定まる値は所有モジュールが持つ」）。

/** 正解と別のレーンを叩いたタップの床値。★暫定（プレイ検証で調整）。一致との差を残しつつ失敗のない床を保つための初期値。 */
export const PITCH_MISS_FLOOR = 0.2;

/**
 * タップしたレーンとノーツの正解レーンからレーン選択精度（0以上1以下）を返す。
 * 一致は1.0、不一致は床値。両スロットは0始まり。
 * 非有限値・非整数は不一致とみなし床値を返す（失敗のない床の方針のため判定を止めない）。
 */
export function pitchAccuracy(tapSlot0: number, noteSlot0: number): number {
  if (!Number.isInteger(tapSlot0) || !Number.isInteger(noteSlot0)) {
    return PITCH_MISS_FLOOR;
  }
  return tapSlot0 === noteSlot0 ? 1 : PITCH_MISS_FLOOR;
}

/**
 * レーン一致（JUST）か。0始まりの両スロットが整数で等しいときだけ真。
 * #54 ゲージと #55 スコアが「レーン選択の成功」の素データとして用いる。
 */
export function isPitchJust(tapSlot0: number, noteSlot0: number): boolean {
  return Number.isInteger(tapSlot0) && Number.isInteger(noteSlot0) && tapSlot0 === noteSlot0;
}
