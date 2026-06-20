// 表示粒度切替コントローラ（#29）の単体テスト用の小さな入力データ。
// 実TAKEOVERデータ（テストが別に読む）では現れない分岐（長音主体など）や、時刻探索・正規化の
// 振る舞いを固定するための最小データである。
//
// 設計の要点:
//   - 時刻はミリ秒。ビートは一定間隔で生成する。
//   - 各合成入力は、特定の判定分岐を1つ確実に起こすよう文字の継続時間と声量を設計する。

import { buildLyricsTimeline } from "../../../textalive/lyricsTimeline";
import type { LyricSourceVideo, LyricSourceWord } from "../../../textalive/lyricsTimeline";
import type { GranularityInput, LoudnessCurveInput } from "../granularity";

/** 一定間隔のビート開始時刻を生成する。 */
export function makeBeats(intervalMs: number, count: number): number[] {
  const beats: number[] = [];
  for (let i = 0; i < count; i++) {
    beats.push(i * intervalMs);
  }
  return beats;
}

/** 全区間で同じ声量の曲線を作る。 */
function flatLoudness(stepMs: number, count: number, value: number, maxAmplitude: number): LoudnessCurveInput {
  return { stepMs, values: new Array(count).fill(value), maxAmplitude };
}

/** [文字, 開始, 終了] の並びから1単語を作る。 */
function word(chars: ReadonlyArray<readonly [string, number, number]>): LyricSourceWord {
  const text = chars.map((c) => c[0]).join("");
  return {
    text,
    startTime: chars[0][1],
    endTime: chars[chars.length - 1][2],
    children: chars.map((c) => ({ text: c[0], startTime: c[1], endTime: c[2] })),
  };
}

/** 単語の配列から1フレーズの動画（1フレーズ）を作る。 */
function singlePhraseVideo(words: LyricSourceWord[]): LyricSourceVideo {
  const text = words.map((w) => w.text).join("");
  return {
    phrases: [
      {
        text,
        startTime: words[0].startTime,
        endTime: words[words.length - 1].endTime,
        children: words,
      },
    ],
  };
}

/**
 * 長音主体のフレーズ。3文字すべてが800ミリ秒（長音下限500ミリ秒以上）で、声量が最大に近く、
 * 文字数3は一画面可読数14以下。判定理由 longTone を起こす。
 */
export function longToneInput(): GranularityInput {
  const video = singlePhraseVideo([
    word([
      ["ラ", 0, 800],
      ["ラ", 800, 1600],
      ["ラ", 1600, 2400],
    ]),
  ]);
  return {
    lyricsTimeline: buildLyricsTimeline(video),
    beatStartTimesMs: makeBeats(400, 12),
    loudnessCurve: flatLoudness(200, 24, 100, 100),
    sectionBoundariesMs: [],
    songEndMs: 4000,
  };
}

/**
 * 中間のフレーズ。4文字すべてが250ミリ秒（短音上限150ミリ秒超かつ長音下限500ミリ秒未満）で、
 * 短音優勢でも長音主体でもなく、文字数4は可読数以下で長尺でない。判定理由 middle（単語粒度）を起こす。
 */
export function middleInput(): GranularityInput {
  const video = singlePhraseVideo([
    word([
      ["あ", 0, 250],
      ["い", 250, 500],
    ]),
    word([
      ["う", 500, 750],
      ["え", 750, 1000],
    ]),
  ]);
  return {
    lyricsTimeline: buildLyricsTimeline(video),
    beatStartTimesMs: makeBeats(250, 12),
    loudnessCurve: flatLoudness(200, 16, 10, 100),
    sectionBoundariesMs: [],
    songEndMs: 2000,
  };
}

/**
 * 長尺かつ低密度のフレーズ。可読数14を超える18文字を、1拍250ミリ秒に対して文字を粗く配置して
 * 1拍あたり1文字未満（低密度）にする。判定理由 longSparse（フレーズ粒度のチャンク分割）を起こす。
 * 各単語2文字で9単語、文字は各300ミリ秒、単語間に空きを置く。
 */
export function longSparseInput(): GranularityInput {
  const words: LyricSourceWord[] = [];
  // 1単語あたり1000ミリ秒の枠に2文字（各300ミリ秒）を置き、残りを空ける。9単語で18文字。
  for (let i = 0; i < 9; i++) {
    const base = i * 1000;
    words.push(
      word([
        ["漢", base, base + 300],
        ["字", base + 300, base + 600],
      ])
    );
  }
  const video = singlePhraseVideo(words);
  return {
    lyricsTimeline: buildLyricsTimeline(video),
    beatStartTimesMs: makeBeats(250, 48),
    loudnessCurve: flatLoudness(200, 64, 10, 100),
    sectionBoundariesMs: [],
    songEndMs: 9000,
  };
}

/**
 * 2フレーズの間に意味のある無音（4拍ぶん）を置く入力。時刻探索と画面全体セグメントの確認に使う。
 * 各フレーズは中間（単語粒度）になる文字継続時間にする。
 */
export function twoPhraseWithGapInput(): GranularityInput {
  const video: LyricSourceVideo = {
    phrases: [
      {
        text: "あい",
        startTime: 0,
        endTime: 500,
        children: [
          word([
            ["あ", 0, 250],
            ["い", 250, 500],
          ]),
        ],
      },
      {
        text: "うえ",
        startTime: 1500,
        endTime: 2000,
        children: [
          word([
            ["う", 1500, 1750],
            ["え", 1750, 2000],
          ]),
        ],
      },
    ],
  };
  return {
    lyricsTimeline: buildLyricsTimeline(video),
    beatStartTimesMs: makeBeats(250, 16),
    loudnessCurve: flatLoudness(200, 16, 10, 100),
    sectionBoundariesMs: [],
    songEndMs: 2500,
  };
}
