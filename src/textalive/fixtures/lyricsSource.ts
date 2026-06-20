// 歌詞タイムラインの単体テスト用の小さな入力データ。
// 実TAKEOVERデータ（実データテストが別に読む）ではなく、構築・時刻探索・整合検査の
// 振る舞いを固定するための最小データである。いずれも整合した（不整合を持たない）入力とする。
//
// 設計の要点:
//   - 時刻はミリ秒。隣接する単位は終了時刻と次の開始時刻を共有する箇所を含める。
//   - 同一文字の繰り返し・単一文字の単語・複数文字の単語・無音区間を含める。
//   - 開始時刻と終了時刻が等しいゼロ長の単位、および同一の開始時刻で終了時刻が異なる
//     単位の並びを含める。

import type { LyricSourceVideo } from "../lyricsTimeline";

// 通常の入力。2フレーズ。フレーズ間に無音区間がある。
// フレーズ0は同一文字「ね」を繰り返す1単語。フレーズ1は複数文字の単語と単一文字の単語。
// 隣接する文字は境界を共有する（フレーズ0の100、フレーズ1の400）。
export const validTimelineSource: LyricSourceVideo = {
  phrases: [
    {
      text: "ねね",
      startTime: 0,
      endTime: 200,
      children: [
        {
          text: "ねね",
          startTime: 0,
          endTime: 200,
          children: [
            { text: "ね", startTime: 0, endTime: 100 },
            { text: "ね", startTime: 100, endTime: 200 },
          ],
        },
      ],
    },
    {
      text: "さくら",
      startTime: 300,
      endTime: 600,
      children: [
        {
          text: "さく",
          startTime: 300,
          endTime: 500,
          children: [
            { text: "さ", startTime: 300, endTime: 400 },
            { text: "く", startTime: 400, endTime: 500 },
          ],
        },
        {
          text: "ら",
          startTime: 500,
          endTime: 600,
          children: [{ text: "ら", startTime: 500, endTime: 600 }],
        },
      ],
    },
  ],
};

// エッジの入力。3フレーズ。
//   - フレーズ0[0,200]: 通常の2単語。
//   - フレーズ1[200,400]: 先頭にゼロ長の単語「ん」[200,200]を置き、次の単語「こ」[200,400]と
//     開始時刻200を共有する（同一の開始時刻で終了時刻が異なる並び）。
//     フレーズ0の終了200とフレーズ1の開始200も共有する。
//   - フレーズ2[500,500]: ゼロ長のフレーズ。前後に同じ開始時刻の単位が無く、その時刻ちょうどで引ける。
// フレーズ1の開始200より前（フレーズ0の末尾）、フレーズ1とフレーズ2の間[400,500]は無音区間。
export const edgeCaseSource: LyricSourceVideo = {
  phrases: [
    {
      text: "あい",
      startTime: 0,
      endTime: 200,
      children: [
        {
          text: "あ",
          startTime: 0,
          endTime: 100,
          children: [{ text: "あ", startTime: 0, endTime: 100 }],
        },
        {
          text: "い",
          startTime: 100,
          endTime: 200,
          children: [{ text: "い", startTime: 100, endTime: 200 }],
        },
      ],
    },
    {
      text: "んこ",
      startTime: 200,
      endTime: 400,
      children: [
        {
          text: "ん",
          startTime: 200,
          endTime: 200,
          children: [{ text: "ん", startTime: 200, endTime: 200 }],
        },
        {
          text: "こ",
          startTime: 200,
          endTime: 400,
          children: [{ text: "こ", startTime: 200, endTime: 400 }],
        },
      ],
    },
    {
      text: "ぜ",
      startTime: 500,
      endTime: 500,
      children: [
        {
          text: "ぜ",
          startTime: 500,
          endTime: 500,
          children: [{ text: "ぜ", startTime: 500, endTime: 500 }],
        },
      ],
    },
  ],
};
