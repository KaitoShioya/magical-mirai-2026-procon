// コーラス補正（Issue #90）の純粋関数の検査。
// 実行時歌詞経路 applyChorusCorrectionToLyricVideo について、文字の時刻置換・単語/フレーズ時刻の再計算・
// 構造不一致時の例外・対象外フレーズの不変・補正後の歌詞タイムライン整合を確かめる。
import { describe, expect, it } from "vitest";
import {
  applyChorusCorrectionToLyricVideo,
  ChorusCorrectionMismatchError,
  type ChorusPhraseCorrection,
} from "./chorusCorrection";
import { KOTAETE_CHORUS_CORRECTIONS } from "../profiles/kotaete/chorusTimings";
import { buildLyricsTimeline, findLyricsTimelineIssues, type LyricSourceVideo } from "../textalive/lyricsTimeline";

/** 補正データの文字数から、TextAlive 形（children でたどる）の歌詞を作る。各文字は潰れた時刻（1ミリ秒）にする。
 *  文字テキストは phraseText を文字数に従って単語へ切り分けて与えるため、補正の対象特定（全文一致）が成立する。 */
function buildCollapsedVideo(corrections: readonly ChorusPhraseCorrection[]): LyricSourceVideo {
  const phrases = corrections.map((corr, pi) => {
    const allChars = Array.from(corr.phraseText);
    let cursor = 0;
    const collapsedStart = 65000 + pi;
    const collapsedEnd = collapsedStart + 1;
    const children = corr.words.map((wordTimes) => {
      const charNodes = wordTimes.map(() => {
        const text = allChars[cursor];
        cursor += 1;
        return { startTime: collapsedStart, endTime: collapsedEnd, text };
      });
      return {
        startTime: collapsedStart,
        endTime: collapsedEnd,
        text: charNodes.map((c) => c.text).join(""),
        children: charNodes,
      };
    });
    return {
      startTime: collapsedStart,
      endTime: collapsedEnd,
      text: corr.phraseText,
      children,
    };
  });
  return { phrases } as unknown as LyricSourceVideo;
}

describe("コーラス補正 applyChorusCorrectionToLyricVideo", () => {
  it("対象フレーズの文字時刻を補正値へ置換し、単語・フレーズの時刻を先頭/末尾の子へ再計算する", () => {
    const video = buildCollapsedVideo(KOTAETE_CHORUS_CORRECTIONS);
    const corrected = applyChorusCorrectionToLyricVideo(video, KOTAETE_CHORUS_CORRECTIONS);

    KOTAETE_CHORUS_CORRECTIONS.forEach((corr, pi) => {
      const phrase = corrected.phrases[pi];
      // 文字時刻が補正値に一致する。
      corr.words.forEach((wordTimes, wi) => {
        wordTimes.forEach((t, ci) => {
          expect(phrase.children[wi].children[ci].startTime).toBe(t.startTime);
          expect(phrase.children[wi].children[ci].endTime).toBe(t.endTime);
        });
        // 単語時刻＝先頭文字開始・末尾文字終了。
        expect(phrase.children[wi].startTime).toBe(wordTimes[0].startTime);
        expect(phrase.children[wi].endTime).toBe(wordTimes[wordTimes.length - 1].endTime);
      });
      // フレーズ時刻＝先頭単語開始・末尾単語終了。
      const firstWord = corr.words[0];
      const lastWord = corr.words[corr.words.length - 1];
      expect(phrase.startTime).toBe(firstWord[0].startTime);
      expect(phrase.endTime).toBe(lastWord[lastWord.length - 1].endTime);
    });
  });

  it("補正後の歌詞タイムラインが整合する（子が親に収まる・兄弟が昇順非重複・文字列連結一致）", () => {
    const video = buildCollapsedVideo(KOTAETE_CHORUS_CORRECTIONS);
    const corrected = applyChorusCorrectionToLyricVideo(video, KOTAETE_CHORUS_CORRECTIONS);
    const issues = findLyricsTimelineIssues(buildLyricsTimeline(corrected));
    expect(issues).toEqual([]);
  });

  it("入力を変更しない（新しいオブジェクトを返す）", () => {
    const video = buildCollapsedVideo(KOTAETE_CHORUS_CORRECTIONS);
    const before = video.phrases[0].children[0].children[0].startTime;
    applyChorusCorrectionToLyricVideo(video, KOTAETE_CHORUS_CORRECTIONS);
    expect(video.phrases[0].children[0].children[0].startTime).toBe(before);
  });

  it("対象外フレーズは変更しない", () => {
    const correction: ChorusPhraseCorrection = {
      phraseText: "あい",
      words: [[{ startTime: 100, endTime: 200 }], [{ startTime: 200, endTime: 300 }]],
    };
    const other = {
      startTime: 0,
      endTime: 10,
      text: "うえ",
      children: [
        { startTime: 0, endTime: 5, text: "う", children: [{ startTime: 0, endTime: 5, text: "う" }] },
        { startTime: 5, endTime: 10, text: "え", children: [{ startTime: 5, endTime: 10, text: "え" }] },
      ],
    };
    const target = buildCollapsedVideo([correction]).phrases[0];
    const video = { phrases: [other, target] } as unknown as LyricSourceVideo;
    const corrected = applyChorusCorrectionToLyricVideo(video, [correction]);
    // 対象外フレーズ（うえ）は時刻が変わらない。
    expect(corrected.phrases[0].children[0].children[0].startTime).toBe(0);
    expect(corrected.phrases[0].children[1].children[0].endTime).toBe(10);
    // 対象フレーズ（あい）は補正される。
    expect(corrected.phrases[1].children[0].children[0].startTime).toBe(100);
  });

  it("単語数が一致しないと例外になる", () => {
    const correction: ChorusPhraseCorrection = {
      phraseText: "あい",
      words: [[{ startTime: 100, endTime: 200 }]], // 1単語しか与えないが歌詞は2単語
    };
    const video = {
      phrases: [
        {
          startTime: 0,
          endTime: 2,
          text: "あい",
          children: [
            { startTime: 0, endTime: 1, text: "あ", children: [{ startTime: 0, endTime: 1, text: "あ" }] },
            { startTime: 1, endTime: 2, text: "い", children: [{ startTime: 1, endTime: 2, text: "い" }] },
          ],
        },
      ],
    } as unknown as LyricSourceVideo;
    expect(() => applyChorusCorrectionToLyricVideo(video, [correction])).toThrow(ChorusCorrectionMismatchError);
  });

  it("対象フレーズが見つからないと例外になる", () => {
    const correction: ChorusPhraseCorrection = {
      phraseText: "存在しない歌詞",
      words: [[{ startTime: 100, endTime: 200 }]],
    };
    const video = { phrases: [] } as unknown as LyricSourceVideo;
    expect(() => applyChorusCorrectionToLyricVideo(video, [correction])).toThrow(ChorusCorrectionMismatchError);
  });
});
