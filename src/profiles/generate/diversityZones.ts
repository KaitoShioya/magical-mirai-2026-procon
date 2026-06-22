// 多様性逓減区間の自動抽出（Issue #42）。
// 音楽地図のサビ区間から三部形式の diversityZones を決定論的に生成する純粋関数。
// 役割は時刻順で決まる（先頭=主題、末尾=回帰、中間=変奏）。境界はサビ区間そのものとする
//（出典 docs/decisions/app-overall-decisions.md §3.5「進化の刻みは反復区間に同期させる」）。
// ラベルはハイブリッド: 曲別の任意上書きがあればそれを、無ければ汎用ラベルを生成する
//（曲固有の文言は songmap から導出できないため。#46 チェックポイント「役割を表すラベルだけを手動で与える」）。
//
// 区間値（startMs < endMs・数値の有限性）の検査は本関数に持たせない。理由を先に述べる。入力のサビ区間は
// songmap 由来で常に startMs < endMs であり信頼でき、生成物の妥当性検査は validateProfile が担う（時刻の有限性・
// 終了が開始より前になる逆転・区間どうしの昇順と重なり・曲長以内を検査する）ためである。
//
// 依存方針: schema の型と生成層の型だけを取り込み、中核・rendering・tools・three.js は取り込まない。

import type { DiversityZone, DiversityRole } from "../schema/profileSchema";
import type { ChorusSegment } from "./types";

/** 役割の和名。汎用ラベルの生成に使う。 */
const ROLE_LABEL_JA: Record<DiversityRole, string> = {
  theme: "主題",
  variation: "変奏",
  reprise: "回帰",
};

/** 時刻昇順に整列済みのサビ区間に、位置から役割を割り当てる。
 *  三部形式は主題（先頭）・展開（中間）・回帰（末尾）であるため、N=1 は主題のみ、
 *  N≧2 は先頭=主題・末尾=回帰・中間すべて=変奏とする。 */
function roleAt(index: number, count: number): DiversityRole {
  if (index === 0) {
    return "theme";
  }
  if (index === count - 1) {
    return "reprise";
  }
  return "variation";
}

/** サビ区間から多様性逓減区間を自動生成する。
 *  labels は索引ごとのラベル上書き。要素が undefined または空文字の索引は汎用ラベルを生成する。
 *  空文字を汎用ラベルへ倒す理由を先に述べる。表示するラベルとして空文字は事故になりやすく、
 *  未指定（undefined）と同じ「曲別の文言を与えない」意図とみなすのが安全なためである。
 *  labels の要素数が区間数を超える場合は、存在しない区間へのラベル指定であり誤りのため例外を投げる。 */
export function deriveDiversityZones(
  chorusSegments: ChorusSegment[],
  labels?: ReadonlyArray<string | undefined>,
): DiversityZone[] {
  if (labels !== undefined && labels.length > chorusSegments.length) {
    throw new Error(
      `ラベル数（${labels.length}）が反復区間数（${chorusSegments.length}）を超えています`,
    );
  }
  const sorted = [...chorusSegments].sort((a, b) => a.startMs - b.startMs);
  return sorted.map((segment, index) => {
    const role = roleAt(index, sorted.length);
    const override = labels?.[index];
    const label =
      override !== undefined && override !== "" ? override : `第${index + 1}反復区間（${ROLE_LABEL_JA[role]}）`;
    return {
      startTimeMs: segment.startMs,
      endTimeMs: segment.endMs,
      role,
      label,
    };
  });
}
