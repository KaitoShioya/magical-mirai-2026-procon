// 音高から周波数への変換と、スロット番号から音高を引く補助。AudioContext に依存しない純粋ロジック。
// どのオクターブに置くか（音域配置）の規則は本サブシステムの責務外（Issue #36）であり、ここには持たない。

import { SYNTH_OVERTONE_RATIO } from "./synthConstants";

/**
 * 音高番号（標準のMIDI音高番号）から周波数（ヘルツ）へ変換する。
 * 採用理由を先に述べる。市販の楽曲はA音（音高番号69）を440ヘルツに合わせて作られるため、
 * 標準式 440 × 2 の((音高番号−69)÷12)乗 で楽曲と整合する（research 07 §1.3）。
 * 非有限値は変換できないため null を返す（呼び出し側は無音にする）。
 */
export function midiToFrequency(midiNote: number): number | null {
  if (!Number.isFinite(midiNote)) {
    return null;
  }
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * 投下中に重ねる倍音の周波数（ヘルツ）を、基本周波数から求める。
 * 基本周波数 × SYNTH_OVERTONE_RATIO（整数倍）を返す。整数倍にすることで倍音は基本周波数と協和し、基本周波数自体は
 * 変えない。非有限値は変換できないため null を返す（呼び出し側は倍音を足さない）。
 */
export function overtoneFrequency(fundamentalHz: number): number | null {
  if (!Number.isFinite(fundamentalHz)) {
    return null;
  }
  return fundamentalHz * SYNTH_OVERTONE_RATIO;
}

/**
 * スロットの音高配列から、指定スロットの音高番号を引く。
 * 範囲外・該当なし・非有限値は null を返す（呼び出し側は無音にする）。
 * スロット番号は0が最下、増えるほど高い（配列は低い順に並ぶ前提）。
 */
export function slotToMidi(
  slotPitches: readonly number[],
  slotIndex: number
): number | null {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotPitches.length) {
    return null;
  }
  const midiNote = slotPitches[slotIndex];
  if (!Number.isFinite(midiNote)) {
    return null;
  }
  return midiNote;
}

/**
 * 外から受け取った音高配列を、発音に使える音高だけに整える。
 * 未設定（null・undefined）は空配列に、非有限値は取り除く。
 * これにより setSlotPitches が不正な入力を受けても発音時に例外を出さない。
 */
export function sanitizeSlotPitches(
  midiNotes: readonly number[] | null | undefined
): number[] {
  if (!midiNotes) {
    return [];
  }
  return midiNotes.filter((value) => Number.isFinite(value));
}
