// オンセット（音の立ち上がり）を拍格子から選び、間引いてノーツを生成する曲非依存の純粋関数。Issue #38。
//
// 抽出源を拍格子に限定する理由を先に述べる。docs/research/04-ux-and-chart-design.md §4 はノーツの抽出源として
// 拍・アクセント・和音変化・声量と感情の山を挙げるが、本作の密度規則（基本は2拍に1回、サビは毎拍）は拍を単位に
// 定義され、その規則で見積もったフルに可能なタップ数は434である（docs/research/07-feasibility-and-parameters.md
// §2.1・§2.6）。よって第1段の抽出源を拍格子に限定すると、密度規則と数値が一致し、受け入れ基準「密度が難度に
// 追従（サビとサビ以外が区別できる）」を最小の構成で満たせる。アクセント・和音変化・声量と感情の山の取り込みは
// 密度規則（434）に含まれないため、後段の譜面パターン適用（#39）と譜面密度設計（#43）に委ねる（ユーザー承認済み）。
//
// 後段の責務を先に述べる。本関数の出力は中間ノーツで、Y軸スロット索引（slotIndex）と譜面パターン名（pattern）は
// #39、カメラ軌跡上の位置（trajectoryPosition）は #40 が後段で付与する（src/profiles/schema/profileSchema.ts の
// Note 型の注釈）。中間ノーツに仮値を持たせると未確定の項目を確定済みと誤認する事故が起きるため、本型はこの3項目を
// 持たず、必要になった段で付与する。
//
// 密度の谷の休符と見せ場前の溜めは本Issueの対象外で #43 に委ねる。本関数は密度の頻度を間引き間隔のオプションとして
// 外部化するにとどめ、#43 が値を渡して精緻化できるようにする。
//
// 依存方針: 本モジュールは src/profiles/generate/types（共通型 ChorusSegment）のみを取り込み、中核（engine・chart・
// scoring・input・audio）・rendering・tools・three.js を取り込まない（src/profiles/README.md・
// src/profiles/generate/README.md の依存規則）。最終ノーツ型 Note への依存も持たない（中間型のため）。

import type { ChorusSegment } from "./types";

/** 拍格子の1要素。音楽地図 beats から必要な2項目だけを受け取る。 */
export interface OnsetBeat {
  /** 拍格子の索引（音楽地図の beats[i].index）。判定とJUST認定に使う。 */
  index: number;
  /** 拍の開始時刻（ミリ秒）。演出の実時刻に使う。 */
  startTimeMs: number;
}

/** オンセット選択の入力。すべて音楽地図由来の素のデータで受け取り、TextAlive や tools の型に依存しない。
 *  beats は開始時刻の昇順が必須（音楽地図が保証する）。昇順でない入力は未定義動作とし、本関数は並べ替えない。
 *  並べ替えない理由を先に述べる。純粋関数を単純かつ決定論に保ち、既存の見せ場生成（昇順想定）と挙動を揃え、
 *  「出力は入力の拍順を保つ」という不変条件を成立させるためである。
 *  chorusSegments は順不同でも重複していても、右半開区間の包含判定で各拍を一意にサビ／サビ以外へ分類するため、
 *  分類そのものは正しく動く。区間の重複は分類には影響しないが、毎秒あたり密度を区間長から求める検証では分母が
 *  二重計上され得るため、その検証は呼び出し側で区間の重複なしを前提に確認する。 */
export interface OnsetInput {
  beats: OnsetBeat[];
  chorusSegments: ChorusSegment[];
}

/** オンセット選択のオプション。すべて既定値を持ち、Issue #43 や曲横展開で上書きできる。
 *  間引き間隔は1以上の整数とする（generateOnsetNotes の防御を参照）。 */
export interface OnsetOptions {
  /** サビでの拍の間引き間隔。1は毎拍。 */
  chorusBeatStride: number;
  /** サビ以外での拍の間引き間隔。2は2拍に1回。 */
  nonChorusBeatStride: number;
  /** ノーツ id の接頭辞。 */
  idPrefix: string;
}

/** 中間ノーツ（第1段の出力）。最終 Note のうち第1段で確定する項目に、密度の出所を加える。
 *  slotIndex と pattern は #39、trajectoryPosition は #40 が後段で付与するため、本型は持たない。 */
export interface OnsetNote {
  /** プロファイル内で一意の識別子。idPrefix と固定4桁ゼロ埋め連番を連結する。 */
  id: string;
  /** 演出に使う実時刻（選んだ拍の startTimeMs）。 */
  timeMs: number;
  /** 判定とJUST認定に使う拍格子の索引（選んだ拍の index）。 */
  beatIndex: number;
  /** 密度の出所。達成基準の密度差検査と下流の密度精緻化（#43）に使う。 */
  sectionKind: "chorus" | "nonChorus";
}

/** 既定オプション。
 *  chorusBeatStride=1（サビは1拍に1回）と nonChorusBeatStride=2（サビ以外は2拍に1回）の採用理由を先に述べる。
 *  docs/research/07-feasibility-and-parameters.md §2.6 が「サビは1拍に1回、サビ以外は2拍に1回」と定め、
 *  §2.1 がこの規則でTAKEOVERのフルに可能なタップを434（サビ192・サビ以外242）と見積もるためである。 */
export const DEFAULT_ONSET_OPTIONS: OnsetOptions = {
  chorusBeatStride: 1,
  nonChorusBeatStride: 2,
  idPrefix: "note-",
};

/** id 連番のゼロ埋め桁数。
 *  固定4桁にする理由を先に述べる。対象6曲のノーツ数は数百規模で、TAKEOVERは間引き後434個（3桁）であり、
 *  4桁にすれば全idが等幅になり、桁数が総数に依存して揺れない。連番が9999を超える曲では桁が自然に伸びるが、
 *  idの一意性と昇順は保たれる。 */
const ID_DIGITS = 4;

/** 間引き間隔が1以上の整数であることを検査する。満たさなければ文脈付きの例外を投げる。
 *  入力段で拒否する理由を先に述べる。間引き間隔は「何拍に1回選ぶか」の周期であり、1未満や非整数は選択の意味が
 *  定義できず、0は剰余計算が破綻して選択が止まらないためである。 */
function assertStride(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} は1以上の整数である必要があるが ${value} が渡された`);
  }
}

/** 時刻がいずれかのサビ区間の右半開区間（startMs 以上 endMs 未満）に入るかを判定する。
 *  右半開で統一する理由を先に述べる。types.ts の ChorusSegment の定義と既存の見せ場生成に揃え、区間の境界に
 *  重なる拍を二重に数えないためである。 */
function isInsideAnyChorus(timeMs: number, chorusSegments: readonly ChorusSegment[]): boolean {
  return chorusSegments.some((s) => timeMs >= s.startMs && timeMs < s.endMs);
}

/**
 * 拍格子とサビ区間から、サビは毎拍・サビ以外は2拍に1回の頻度でノーツを選び、中間ノーツの配列を返す。
 *
 * 計数器を種別ごとに独立させ曲全体で累積する理由を先に述べる。種別ごとに独立させると、サビ突入前のサビ以外の
 * 拍数の偶奇にサビ先頭の選択が左右されず、サビの先頭拍を必ず選べる。曲全体で累積し各区間でリセットしないことで、
 * 出力が拍の並びだけで決まる決定論になる。
 *
 * 出力は入力の拍の順序を保つため、入力が昇順であれば時刻昇順になる。
 */
export function generateOnsetNotes(input: OnsetInput, options?: Partial<OnsetOptions>): OnsetNote[] {
  const opts: OnsetOptions = { ...DEFAULT_ONSET_OPTIONS, ...options };
  assertStride(opts.chorusBeatStride, "chorusBeatStride");
  assertStride(opts.nonChorusBeatStride, "nonChorusBeatStride");

  const notes: OnsetNote[] = [];
  let chorusBeatCount = 0;
  let nonChorusBeatCount = 0;
  let selectedCount = 0;

  for (const beat of input.beats) {
    const inChorus = isInsideAnyChorus(beat.startTimeMs, input.chorusSegments);
    // 計数器0始まりのため、各種別の先頭拍は必ず選ばれる。
    const selected = inChorus
      ? chorusBeatCount++ % opts.chorusBeatStride === 0
      : nonChorusBeatCount++ % opts.nonChorusBeatStride === 0;
    if (!selected) continue;

    notes.push({
      id: `${opts.idPrefix}${String(selectedCount).padStart(ID_DIGITS, "0")}`,
      timeMs: beat.startTimeMs,
      beatIndex: beat.index,
      sectionKind: inChorus ? "chorus" : "nonChorus",
    });
    selectedCount++;
  }

  return notes;
}
