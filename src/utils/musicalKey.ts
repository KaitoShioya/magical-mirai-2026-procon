// 楽曲の調から和音記号を導く曲非依存の純粋関数。Issue #37（無和音区間の解決）が、
// 「調の音階で埋める」区間に割り当てる主和音の記号を作るために使う。
//
// 依存方針の理由を先に述べる。本モジュールは曲プロファイル型（src/profiles/schema）を取り込まず、
// 引数を数値と種別の文字列だけで受ける。これは utils が特定サブシステムや曲プロファイル型へ依存しない
// 最下層であるという規則（src/utils/README.md、docs/decisions/architecture.md §5）に従い、依存方向を
// 一方向に保つためである。
//
// 配置の理由を先に述べる。「調から和音名を作る」処理は「和音名から音高を作る」Issue #35
// （src/utils/chordPitch.ts）とは別の概念のため、本ファイルに分けて置く。

/** 1オクターブの半音数。 */
const SEMITONES_PER_OCTAVE = 12;

/** 音高クラス（0をハ＝Cとして0〜11）から音名への対応。
 *  採用理由: TAKEOVER の和音記号がフラット表記（"Ab"・"Db"・"Bb"・"Eb"）であり、表記を揃えると下流の
 *  照合・表示で曖昧さが出ない。よって変化記号はフラットで統一する。
 *  表記規則: 白鍵にあたる音（索引 0・2・4・5・7・9・11）は自然音名（C・D・E・F・G・A・B）、黒鍵にあたる音
 *  （索引 1・3・6・8・10）は直上の自然音のフラット（Db・Eb・Gb・Ab・Bb）とする。これにより各索引の戻り値が
 *  一意に定まる。横展開でシャープ系の調が来た場合の表記差は将来の課題とする（現時点で確定している調は
 *  ファのナチュラルマイナーのみ。docs/research/07-feasibility-and-parameters.md §1.1）。 */
export const PITCH_CLASS_TO_FLAT_NAME: readonly string[] = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

/** 楽曲の調の種別。長調か短調か。src/profiles/schema の MusicalKey.mode と同義の文字列で受ける
 *  （型自体は取り込まず、依存方向を保つ）。 */
export type KeyMode = "major" | "minor";

/** 音高クラス（0〜11の整数）をフラット表記の音名へ変換する。範囲外は明確なメッセージの例外。 */
export function pitchClassToFlatNoteName(pitchClass: number): string {
  if (!Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass >= SEMITONES_PER_OCTAVE) {
    throw new Error(`音高クラスは0〜11の整数である必要があります: ${pitchClass}`);
  }
  return PITCH_CLASS_TO_FLAT_NAME[pitchClass];
}

/** 主音の音高クラスと調の種別から、主和音の和音記号を返す。
 *  採用理由: ナチュラルマイナーの主和音は短三和音、メジャーの主和音は長三和音であるという標準的な和声に従う。
 *  よって短調は根音名に "m"（短三和音）を付け、長調は根音名のみ（長三和音）とする。
 *  例: 主音=ファ（音高クラス5）・短調 → "Fm"。
 *  戻り値は src/utils/chordPitch.ts の parseChordSymbol が解釈できる実在和音記号である。 */
export function tonicChordSymbol(tonicPitchClass: number, mode: KeyMode): string {
  const rootName = pitchClassToFlatNoteName(tonicPitchClass);
  return mode === "minor" ? `${rootName}m` : rootName;
}
