import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildLyricsTimeline,
  phraseAt,
  wordAt,
  charAt,
  findLyricsTimelineIssues,
  type LyricCharUnit,
  type LyricsTimeline,
} from "./lyricsTimeline";
import { validTimelineSource, edgeCaseSource } from "./fixtures/lyricsSource";

describe("buildLyricsTimeline", () => {
  it("フレーズ・単語・文字を走査順に採番し、時刻の項目名を写して件数を集計する", () => {
    const timeline = buildLyricsTimeline(validTimelineSource);
    expect(timeline.phraseCount).toBe(2);
    expect(timeline.wordCount).toBe(3);
    expect(timeline.charCount).toBe(5);

    const phrase1 = timeline.phrases[1];
    expect(phrase1.phraseIndex).toBe(1);
    expect(phrase1.startTimeMs).toBe(300);
    expect(phrase1.endTimeMs).toBe(600);
    expect(phrase1.text).toBe("さくら");

    const word0 = phrase1.words[0];
    expect(word0.phraseIndex).toBe(1);
    expect(word0.wordIndex).toBe(0);
    expect(word0.wordOrdinal).toBe(1);
    expect(word0.text).toBe("さく");

    const char1 = word0.chars[1];
    expect(char1.phraseIndex).toBe(1);
    expect(char1.wordIndex).toBe(0);
    expect(char1.charIndex).toBe(1);
    expect(char1.charOrdinal).toBe(3);
    expect(char1.startTimeMs).toBe(400);
    expect(char1.endTimeMs).toBe(500);
    expect(char1.text).toBe("く");
  });

  it("同一文字が繰り返し現れても、各文字の通し番号と三つ組が互いに異なる", () => {
    const timeline = buildLyricsTimeline(validTimelineSource);
    const chars = timeline.phrases[0].words[0].chars;
    expect(chars[0].text).toBe("ね");
    expect(chars[1].text).toBe("ね");
    expect(chars[0].charOrdinal).toBe(0);
    expect(chars[1].charOrdinal).toBe(1);
    expect(chars[0].charIndex).toBe(0);
    expect(chars[1].charIndex).toBe(1);
  });

  it("出力は入力の参照を保持せず、構築後に入力を変更しても出力は変わらない", () => {
    const mutableSource = {
      phrases: [
        {
          text: "あ",
          startTime: 0,
          endTime: 100,
          children: [
            {
              text: "あ",
              startTime: 0,
              endTime: 100,
              children: [{ text: "あ", startTime: 0, endTime: 100 }],
            },
          ],
        },
      ],
    };
    const timeline = buildLyricsTimeline(mutableSource);
    mutableSource.phrases[0].children[0].children[0].text = "X";
    mutableSource.phrases[0].children[0].children[0].startTime = 999;
    expect(timeline.phrases[0].words[0].chars[0].text).toBe("あ");
    expect(timeline.phrases[0].words[0].chars[0].startTimeMs).toBe(0);
  });
});

describe("phraseAt / wordAt / charAt（通常の入力）", () => {
  const timeline = buildLyricsTimeline(validTimelineSource);

  it("先頭の単位の開始時刻より前は該当なし", () => {
    expect(phraseAt(timeline, -1)).toBeNull();
  });

  it("開始時刻ちょうどはその単位", () => {
    expect(phraseAt(timeline, 0)?.phraseIndex).toBe(0);
    expect(phraseAt(timeline, 300)?.phraseIndex).toBe(1);
  });

  it("区間の内側はその単位", () => {
    expect(phraseAt(timeline, 100)?.phraseIndex).toBe(0);
    expect(wordAt(timeline, 150)?.text).toBe("ねね");
  });

  it("共有境界ちょうどは開始時刻が大きい後の単位", () => {
    // フレーズ0の文字は[0,100]と[100,200]で境界100を共有する。100では後の文字を返す。
    expect(charAt(timeline, 100)?.charIndex).toBe(1);
  });

  it("後ろが無音区間である単位の終了時刻ちょうどはその単位", () => {
    expect(phraseAt(timeline, 200)?.phraseIndex).toBe(0);
  });

  it("無音区間の時刻は該当なし", () => {
    expect(phraseAt(timeline, 250)).toBeNull();
    expect(wordAt(timeline, 250)).toBeNull();
    expect(charAt(timeline, 250)).toBeNull();
  });

  it("末尾の単位の終了時刻より後は該当なし", () => {
    expect(phraseAt(timeline, 600)?.phraseIndex).toBe(1);
    expect(phraseAt(timeline, 601)).toBeNull();
  });
});

describe("phraseAt / wordAt / charAt（ゼロ長と同一開始のエッジ）", () => {
  const timeline = buildLyricsTimeline(edgeCaseSource);

  it("フレーズの共有境界では後のフレーズを返す", () => {
    // フレーズ0[0,200]とフレーズ1[200,400]は境界200を共有する。
    expect(phraseAt(timeline, 200)?.phraseIndex).toBe(1);
  });

  it("同一の開始時刻でゼロ長の単位と通常の単位が並ぶとき、走査順で後の通常の単位を返す", () => {
    // フレーズ1の単語: ゼロ長「ん」[200,200]と通常「こ」[200,400]が開始200を共有する。
    expect(wordAt(timeline, 200)?.text).toBe("こ");
  });

  it("同じ開始時刻の後続が無いゼロ長の単位は、その時刻ちょうどで引ける", () => {
    // フレーズ2[500,500]はゼロ長で、同じ開始時刻の後続が無い。
    expect(phraseAt(timeline, 500)?.phraseIndex).toBe(2);
    expect(charAt(timeline, 500)?.text).toBe("ぜ");
  });

  it("ゼロ長フレーズの前の無音区間は該当なし", () => {
    expect(phraseAt(timeline, 450)).toBeNull();
  });
});

// 整合検査の不整合系テストのための小さな組み立て補助。
function ch(
  charIndex: number,
  charOrdinal: number,
  startTimeMs: number,
  endTimeMs: number,
  text: string
): LyricCharUnit {
  return { phraseIndex: 0, wordIndex: 0, charIndex, charOrdinal, startTimeMs, endTimeMs, text };
}

// 1フレーズ1単語の歌詞タイムラインを組み立てる。各項目は上書きできる。
function singleWordTimeline(
  chars: LyricCharUnit[],
  overrides: {
    wordText?: string;
    phraseText?: string;
    wordStartMs?: number;
    wordEndMs?: number;
  } = {}
): LyricsTimeline {
  const concat = chars.map((c) => c.text).join("");
  const startMs =
    overrides.wordStartMs ?? Math.min(...chars.map((c) => c.startTimeMs));
  const endMs = overrides.wordEndMs ?? Math.max(...chars.map((c) => c.endTimeMs));
  const wordText = overrides.wordText ?? concat;
  const phraseText = overrides.phraseText ?? concat;
  return {
    phrases: [
      {
        phraseIndex: 0,
        startTimeMs: startMs,
        endTimeMs: endMs,
        text: phraseText,
        words: [
          {
            phraseIndex: 0,
            wordIndex: 0,
            wordOrdinal: 0,
            startTimeMs: startMs,
            endTimeMs: endMs,
            text: wordText,
            chars,
          },
        ],
      },
    ],
    phraseCount: 1,
    wordCount: 1,
    charCount: chars.length,
  };
}

describe("findLyricsTimelineIssues", () => {
  it("整合した入力（通常）で空配列を返す", () => {
    expect(findLyricsTimelineIssues(buildLyricsTimeline(validTimelineSource))).toEqual([]);
  });

  it("整合した入力（ゼロ長・共有境界・無音を含む）で空配列を返す", () => {
    // 無音区間も共有境界もゼロ長も不整合として報告しないことを同時に確認する。
    expect(findLyricsTimelineIssues(buildLyricsTimeline(edgeCaseSource))).toEqual([]);
  });

  it("文字の文字列の連結が単語の文字列に一致しないと報告する", () => {
    const timeline = singleWordTimeline(
      [ch(0, 0, 0, 100, "あ"), ch(1, 1, 100, 200, "い")],
      { wordText: "あX", phraseText: "あX" }
    );
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("単語の文字列の連結がフレーズの文字列に一致しないと報告する", () => {
    const timeline = singleWordTimeline(
      [ch(0, 0, 0, 100, "あ"), ch(1, 1, 100, 200, "い")],
      { phraseText: "あう" }
    );
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("文字通し番号が重複していると報告する", () => {
    const timeline = singleWordTimeline([ch(0, 0, 0, 100, "あ"), ch(1, 0, 100, 200, "い")]);
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("文字通し番号が連続していないと報告する", () => {
    const timeline = singleWordTimeline([ch(0, 0, 0, 100, "あ"), ch(1, 5, 100, 200, "い")]);
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("子の時間範囲が親の範囲を超えると報告する", () => {
    const timeline = singleWordTimeline(
      [ch(0, 0, 0, 100, "あ"), ch(1, 1, 100, 300, "い")],
      { wordEndMs: 200 }
    );
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("兄弟の時間が厳密に重なると報告する", () => {
    const timeline = singleWordTimeline([ch(0, 0, 0, 100, "あ"), ch(1, 1, 50, 150, "い")]);
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("兄弟の開始時刻が昇順でないと報告する", () => {
    const timeline = singleWordTimeline([ch(0, 0, 100, 200, "あ"), ch(1, 1, 0, 100, "い")]);
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("終了時刻が開始時刻より前だと報告する（ゼロ長は許容）", () => {
    const bad = singleWordTimeline([ch(0, 0, 100, 50, "あ")]);
    expect(findLyricsTimelineIssues(bad).length).toBeGreaterThan(0);
    const zeroLength = singleWordTimeline([ch(0, 0, 100, 100, "あ")]);
    expect(findLyricsTimelineIssues(zeroLength)).toEqual([]);
  });
});

describe("整合検査の追加分岐とエッジ", () => {
  it("時刻が有限の数値でないと報告する", () => {
    const timeline = singleWordTimeline([ch(0, 0, Number.NaN, 100, "あ")]);
    const issues = findLyricsTimelineIssues(timeline);
    expect(issues.some((issue) => issue.message.includes("有限の数値でない"))).toBe(true);
  });

  it("フレーズ件数・単語件数・文字件数が数と一致しないと報告する", () => {
    const timeline = buildLyricsTimeline(validTimelineSource);
    expect(findLyricsTimelineIssues({ ...timeline, charCount: timeline.charCount + 1 }).length).toBeGreaterThan(0);
    expect(findLyricsTimelineIssues({ ...timeline, wordCount: timeline.wordCount + 1 }).length).toBeGreaterThan(0);
    expect(findLyricsTimelineIssues({ ...timeline, phraseCount: timeline.phraseCount + 1 }).length).toBeGreaterThan(0);
  });

  it("フレーズ番号が走査順と一致しないと報告する", () => {
    const timeline = buildLyricsTimeline(validTimelineSource);
    const broken: LyricsTimeline = {
      ...timeline,
      phrases: [{ ...timeline.phrases[0], phraseIndex: 9 }, timeline.phrases[1]],
    };
    expect(findLyricsTimelineIssues(broken).length).toBeGreaterThan(0);
  });

  it("文字番号が走査順と一致しないと報告する", () => {
    const timeline = singleWordTimeline([ch(5, 0, 0, 100, "あ")]);
    expect(findLyricsTimelineIssues(timeline).length).toBeGreaterThan(0);
  });

  it("空のタイムライン（フレーズが無い）は整合とし、時刻探索は該当なしを返す", () => {
    const empty = buildLyricsTimeline({ phrases: [] });
    expect(empty.phraseCount).toBe(0);
    expect(empty.wordCount).toBe(0);
    expect(empty.charCount).toBe(0);
    expect(findLyricsTimelineIssues(empty)).toEqual([]);
    expect(phraseAt(empty, 0)).toBeNull();
    expect(wordAt(empty, 0)).toBeNull();
    expect(charAt(empty, 0)).toBeNull();
  });

  it("空の単語・空のフレーズ（子が無く文字列も空）は整合とする", () => {
    const timeline = buildLyricsTimeline({
      phrases: [
        {
          text: "",
          startTime: 0,
          endTime: 100,
          children: [{ text: "", startTime: 0, endTime: 100, children: [] }],
        },
      ],
    });
    expect(timeline.wordCount).toBe(1);
    expect(timeline.charCount).toBe(0);
    expect(findLyricsTimelineIssues(timeline)).toEqual([]);
  });
});

describe("実データ（TAKEOVERの音楽地図ダンプ）", () => {
  // 音楽地図ダンプは words・chars の項目名のため、構造型の children へ写してから構築する。
  // 実曲の全1157文字で受け入れ基準（件数・整合・連結一致）が成り立つことを直接確認する。
  type DumpChar = { startTime: number; endTime: number; text: string };
  type DumpWord = { startTime: number; endTime: number; text: string; chars: DumpChar[] };
  type DumpPhrase = { startTime: number; endTime: number; text: string; words: DumpWord[] };

  const songmapPath = fileURLToPath(
    new URL("../../docs/analysis/takeover.songmap.json", import.meta.url)
  );
  const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as { phrases: DumpPhrase[] };
  const source = {
    phrases: songmap.phrases.map((p) => ({
      text: p.text,
      startTime: p.startTime,
      endTime: p.endTime,
      children: p.words.map((w) => ({
        text: w.text,
        startTime: w.startTime,
        endTime: w.endTime,
        children: w.chars.map((c) => ({
          text: c.text,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
      })),
    })),
  };

  it("件数が90フレーズ・495単語・1157文字である", () => {
    const timeline = buildLyricsTimeline(source);
    expect(timeline.phraseCount).toBe(90);
    expect(timeline.wordCount).toBe(495);
    expect(timeline.charCount).toBe(1157);
  });

  it("整合検査が不整合を返さない", () => {
    const timeline = buildLyricsTimeline(source);
    expect(findLyricsTimelineIssues(timeline)).toEqual([]);
  });
});

describe("走査規則の回帰", () => {
  it("モジュール本文に文字列 .next と TextAlive のパッケージ名が現れない", () => {
    const modulePath = fileURLToPath(new URL("./lyricsTimeline.ts", import.meta.url));
    const source = readFileSync(modulePath, "utf8");
    expect(source.includes(".next")).toBe(false);
    expect(source.includes("textalive-app-api")).toBe(false);
  });
});
