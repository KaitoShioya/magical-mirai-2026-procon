// 「こたえて」のコーラス補正タイミングデータ（Issue #90）。
// 出典: 公式配布 https://developer.textalive.jp/events/magicalmirai2026/6W2N_chorus_timings.jsonc
//
// 取り込みの理由を先に述べる。静的アプリは実行時の外部取得が失敗・遅延・同一生成元制約の影響を受けうるため、
// タイミング数値（著作権メディアでなくコンテスト公開の補正データ）をリポジトリ内に取り込んで決定性とオフライン
// 動作を確保する。
//
// 「こたえて」は3段落目（コーラス）が2段落目の発声中に重なり、TextAlive ではコーラス区間の各文字のタイミングが
// 1ミリ秒に潰れる。この補正データで該当フレーズの文字タイミングを正しい値へ置き換える。
//
// 構造（公式jsoncと同じ）: 区間（=フレーズ。歌詞1行）の配列。各区間は単語の配列で、各単語は文字の {startTime, endTime}
// （ミリ秒）の配列。文字テキストは持たないため、対象フレーズの単語・文字へ順番（位置）で割り当てる。
// 対象フレーズは phraseText の一致で特定し、単語数・文字数の一致を補正適用時に検証する（src/utils/chorusCorrection.ts）。
// 本ファイルの単語数・文字数は docs/analysis/kotaete.songmap.json の該当フレーズと一致することを生成時に照合済みである。

import type { ChorusPhraseCorrection } from "../../utils/chorusCorrection";

export const KOTAETE_CHORUS_CORRECTIONS: readonly ChorusPhraseCorrection[] = [
  {
    phraseText: "どれほどの苦しみも悲しみの向こうに",
    words: [
      [{ startTime: 52140, endTime: 52351 }, { startTime: 52351, endTime: 52585 }],
      [{ startTime: 52585, endTime: 52807 }, { startTime: 52807, endTime: 53272 }],
      [{ startTime: 53272, endTime: 53490 }],
      [{ startTime: 53490, endTime: 53992 }, { startTime: 53992, endTime: 54216 }, { startTime: 54216, endTime: 54658 }],
      [{ startTime: 54906, endTime: 55354 }],
      [{ startTime: 55623, endTime: 56133 }, { startTime: 56133, endTime: 56322 }, { startTime: 56322, endTime: 56865 }],
      [{ startTime: 56865, endTime: 57140 }],
      [{ startTime: 57140, endTime: 57333 }, { startTime: 57333, endTime: 57529 }, { startTime: 57529, endTime: 57722 }],
      [{ startTime: 57729, endTime: 57903 }],
    ],
  },
  {
    phraseText: "きっと私の目指す私がいると信じ続けていた",
    words: [
      [{ startTime: 57903, endTime: 58077 }, { startTime: 58083, endTime: 58248 }, { startTime: 58250, endTime: 58591 }],
      [{ startTime: 59444, endTime: 59951 }],
      [{ startTime: 59951, endTime: 60454 }],
      [{ startTime: 60461, endTime: 60677 }, { startTime: 60677, endTime: 60891 }, { startTime: 60891, endTime: 61315 }],
      [{ startTime: 61363, endTime: 62083 }],
      [{ startTime: 62083, endTime: 62411 }],
      [{ startTime: 63058, endTime: 63236 }, { startTime: 63236, endTime: 63431 }],
      [{ startTime: 63431, endTime: 63678 }],
      [{ startTime: 63678, endTime: 64087 }, { startTime: 64087, endTime: 64254 }],
      [{ startTime: 64254, endTime: 65069 }, { startTime: 65069, endTime: 65342 }],
      [{ startTime: 65342, endTime: 65585 }],
      [{ startTime: 65585, endTime: 65806 }],
      [{ startTime: 65806, endTime: 66249 }],
    ],
  },
];
