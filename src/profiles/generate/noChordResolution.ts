// 無和音（コード無し、頭文字でN.C.）区間を実在和音名へ解決する曲非依存の純粋関数。Issue #37。
//
// 役割の理由を先に述べる。本作の協和は「Y軸スロットにその時刻の和音の構成音を割り当て、どのスロットを
// 叩いてもその和音の構成音になる」ことで成立する（docs/research/07-feasibility-and-parameters.md §1.1・§1.3）。
// この保証は和音が楽曲の全域を切れ目なく覆うことを前提とする。和音が存在しない区間は構成音が定まらず保証が
// 切れるため、各無和音区間を「直前の和音」または「調の主和音」へ解決して協和の保証を全域へ広げる（§1.2）。
//
// 出力の理由を先に述べる。本関数は解決後の実在和音名と埋め方の種別までを返す。音高への展開と、安全付加音を
// 加えた7スロットへの正規化は Issue #36 が担う（src/utils/chordPitch.ts 冒頭注釈、src/profiles/README.md）。
//
// 依存方針: 本モジュールは src/profiles/schema の型と src/utils を取り込むが、中核（engine など）や
// src/tools は取り込まない（src/profiles/README.md・src/profiles/generate/README.md の依存規則）。

import type { Chord, MusicalKey, NcRange, NcTreatment } from "../schema/profileSchema";
import { chordSymbolToPitchSet, isNoChordSymbol } from "../../utils/chordPitch";
import { tonicChordSymbol } from "../../utils/musicalKey";

/** 和音の無和音区間と ncRanges の時刻一致を判定する許容差（ミリ秒）。
 *  採用理由: ncRanges は songmap の "N" 区間と同一時刻で記述されるが、生成経路の浮動小数点演算で微小な差が
 *  生じ得る。よって検証関数 validateProfile の TIME_TOLERANCE_MS（1ミリ秒、浮動小数点誤差対策）と同じ値・
 *  同じ理由で対応づける。 */
const TIME_TOLERANCE_MS = 1;

/** 無和音区間1個の解決結果。対応する和音 "N" 区間と同じ時間範囲・索引を持つ。 */
export interface NoChordResolution {
  /** 対応する和音 "N" 区間の索引。識別と差分確認に使い、浮動小数点の時刻だけに頼らない。 */
  chordIndex: number;
  startTimeMs: number;
  endTimeMs: number;
  /** 埋め方の種別。下流の Issue #36 がこれを見て音高の作り方を決める（"scale" はFマイナーペンタトニック）。 */
  treatment: NcTreatment;
  /** 解決前の和音名。無和音区間のため常に "N"。経緯を残す。 */
  originalChordName: string;
  /** 解決後の実在和音名。"previous" は直前の無和音でない区間の和音名、"scale" は調の主和音記号。 */
  resolvedChordName: string;
}

/** コード進行・無和音区間・調から、各無和音（"N"）区間の解決結果を和音索引の昇順で返す。
 *  入力の chords は索引（＝時刻）昇順で連続することを前提とする（曲プロファイルの契約）。
 *  件数不一致・対応づけの欠落や曖昧・previous の前提不成立・解決名の変換不能は、文脈付きの例外で失敗させる。 */
export function resolveNoChordRegions(
  chords: readonly Chord[],
  ncRanges: readonly NcRange[],
  musicalKey: MusicalKey,
): NoChordResolution[] {
  const noChordPositions: number[] = [];
  for (let pos = 0; pos < chords.length; pos++) {
    if (isNoChordSymbol(chords[pos].name)) {
      noChordPositions.push(pos);
    }
  }

  // 件数の整合を先に検査する。診断のため、両者の件数に加えて時刻一覧も含める
  // （どの区間が余ったか不足したかを呼び出し側がすぐ特定できるようにする）。
  if (noChordPositions.length !== ncRanges.length) {
    const noChordTimes = noChordPositions
      .map((pos) => `${chords[pos].startTimeMs}〜${chords[pos].endTimeMs}`)
      .join("、");
    const ncRangeTimes = ncRanges.map((n) => `${n.startTimeMs}〜${n.endTimeMs}`).join("、");
    throw new Error(
      `無和音区間の件数が一致しません（単位ミリ秒）: コード進行中の "N" 区間は${noChordPositions.length}個（${noChordTimes}）、ncRanges は${ncRanges.length}個（${ncRangeTimes}）です`,
    );
  }

  const resolutions: NoChordResolution[] = [];

  for (const pos of noChordPositions) {
    const region = chords[pos];

    // 対応する無和音区間（ncRanges）を時刻一致で引く。
    const matches = ncRanges.filter(
      (n) =>
        Math.abs(n.startTimeMs - region.startTimeMs) <= TIME_TOLERANCE_MS &&
        Math.abs(n.endTimeMs - region.endTimeMs) <= TIME_TOLERANCE_MS,
    );
    if (matches.length === 0) {
      throw new Error(
        `和音の無和音区間（索引${region.index}、${region.startTimeMs}〜${region.endTimeMs}ミリ秒）に対応する ncRanges がありません`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `和音の無和音区間（索引${region.index}、${region.startTimeMs}〜${region.endTimeMs}ミリ秒）に対応する ncRanges が${matches.length}個あり曖昧です`,
      );
    }
    const treatment = matches[0].treatment;

    // "previous" は直前の無和音でない区間の和音名を採り、境界の連続性を保つ。
    // "scale" はこの段階で調の主和音名へ正規化する（ファ短調なら "Fm"）。安全付加音（短調は♭7度と11度）を
    // 加えてFマイナーペンタトニックの7スロットへ展開するのは Issue #36 であり、Fm三和音へ縮退させない。
    const resolvedChordName =
      treatment === "previous"
        ? previousNonNoChordName(chords, pos)
        : tonicChordSymbol(musicalKey.tonicPitchClass, musicalKey.mode);

    // 解決名が音高集合へ変換可能かを自己検査する（契約違反を黙って通さない）。
    try {
      chordSymbolToPitchSet(resolvedChordName);
    } catch (cause) {
      const causeMessage = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `無和音区間（索引${region.index}、${region.startTimeMs}〜${region.endTimeMs}ミリ秒、種別${treatment}）の解決名 "${resolvedChordName}" が音高集合へ変換できません: ${causeMessage}`,
      );
    }

    resolutions.push({
      chordIndex: region.index,
      startTimeMs: region.startTimeMs,
      endTimeMs: region.endTimeMs,
      treatment,
      originalChordName: region.name,
      resolvedChordName,
    });
  }

  return resolutions;
}

/** 指定した配列位置より前で、最も近い無和音でない和音の名前を返す。無ければ文脈付きの例外。 */
function previousNonNoChordName(chords: readonly Chord[], position: number): string {
  for (let i = position - 1; i >= 0; i--) {
    if (!isNoChordSymbol(chords[i].name)) {
      return chords[i].name;
    }
  }
  const region = chords[position];
  throw new Error(
    `無和音区間（索引${region.index}、${region.startTimeMs}〜${region.endTimeMs}ミリ秒、種別previous）の直前に無和音でない和音がありません。曲頭などでは scale を使ってください`,
  );
}
