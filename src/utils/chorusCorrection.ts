// 「こたえて」のコーラス補正を適用する純粋関数（Issue #90）。
//
// 背景: 「こたえて」は3段落目（コーラス）が2段落目の発声中に重なり、TextAlive ではコーラス区間の各文字の
// タイミングがおよそ1ミリ秒に潰れる。公式配布の補正データ（src/profiles/kotaete/chorusTimings.ts）で、該当
// フレーズの文字タイミングを正しい値へ置き換える。
//
// 配置の理由を先に述べる。この補正は2つの経路で必要になる。第1は曲プロファイル生成（buildProfile が音楽地図の
// 歌詞から歌詞文字・歌詞密度・見せ場信号を導く）、第2は実行時のキネティックタイポ（musicMap が再生中の歌詞を
// 直読みする）。profiles 層と textalive 層の双方から使うため、依存を持たない utils 層へ純粋関数として置く
// （profiles から textalive への逆依存を避ける。utils は依存規則上の末端）。
//
// 対象フレーズの特定方法の理由を先に述べる。補正データは文字テキストを持たず文字数だけを持つため、誤対応を避けるには
// 構造の一致を確かめる必要がある。そこで、(1) フレーズの全文（子文字の連結）が補正データの phraseText に一致すること、
// (2) 単語数が一致すること、(3) 各単語の文字数が一致することを検査してから割り当てる。いずれかが一致しなければ
// 対応が崩れているため例外で失敗させる。
//
// 単語・フレーズの時刻の再計算の理由を先に述べる。歌詞タイムライン検査（src/textalive/lyricsTimeline.ts の
// findLyricsTimelineIssues）は「子の時間範囲が親の内側に収まる」「兄弟が時刻昇順で重ならない」を要求する。文字だけ
// 補正して単語・フレーズの時刻を潰れたまま残すと不整合になり、再生位置からの歌詞単位検索もずれる。実行時経路では
// 補正後に単語の時刻を先頭・末尾文字へ、フレーズの時刻を先頭・末尾単語へ再計算する。音楽地図経路は単語・フレーズの
// 時刻を生成側が読まないため、文字の時刻だけを補正する。

/** 補正データの1文字ぶんのタイミング（ミリ秒）。 */
export interface ChorusCharTiming {
  readonly startTime: number;
  readonly endTime: number;
}

/** 1フレーズぶんの補正データ。phraseText で対象フレーズを特定し、words[単語][文字] で文字タイミングを与える。 */
export interface ChorusPhraseCorrection {
  /** 対象フレーズの全文（子文字の連結に一致させる）。 */
  readonly phraseText: string;
  /** 単語ごとの文字タイミング。外側=単語、内側=その単語の文字。 */
  readonly words: readonly (readonly ChorusCharTiming[])[];
}

/** 補正データと歌詞の対応が崩れたときに失敗させる例外。 */
export class ChorusCorrectionMismatchError extends Error {
  constructor(message: string) {
    super(`コーラス補正の対応が一致しません: ${message}`);
    this.name = "ChorusCorrectionMismatchError";
  }
}

/** 単語ごとの文字数の配列が、補正データの単語数・各単語の文字数と一致することを検査する。 */
function assertStructureMatches(wordCharCounts: number[], correction: ChorusPhraseCorrection): void {
  if (wordCharCounts.length !== correction.words.length) {
    throw new ChorusCorrectionMismatchError(
      `「${correction.phraseText}」の単語数（歌詞${wordCharCounts.length}・補正${correction.words.length}）`,
    );
  }
  for (let wi = 0; wi < wordCharCounts.length; wi++) {
    if (wordCharCounts[wi] !== correction.words[wi].length) {
      throw new ChorusCorrectionMismatchError(
        `「${correction.phraseText}」単語[${wi}]の文字数（歌詞${wordCharCounts[wi]}・補正${correction.words[wi].length}）`,
      );
    }
  }
}

// ── 実行時歌詞（LyricSourceVideo）経路: 文字の時刻補正に加え、単語・フレーズの時刻を再計算する ──
//
// 適用先が実行時の歌詞のみである理由を先に述べる。補正後のコーラスは2段落目の発声中に重なる重唱で、時刻が他フレーズと
// 重複する。曲プロファイルの lyricChars は時刻昇順・非重複の平坦配列であることを検証関数が要求し、重なる重唱とは
// 両立しない。加えて lyricChars は実行時に消費されない（実行時のキネティックタイポは再生中の歌詞を直読みする）。
// よって補正はこの実行時経路にのみ適用する。

/** 実行時歌詞の文字（src/textalive/lyricsTimeline.ts の LyricSourceChar が構造的に満たす）。 */
interface LyricChar {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
}
interface LyricWord {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
  readonly children: readonly LyricChar[];
}
interface LyricPhrase {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
  readonly children: readonly LyricWord[];
}
interface LyricVideo {
  readonly phrases: readonly LyricPhrase[];
}

/** フレーズの全文を子文字の連結から求める（children をたどる）。 */
function lyricPhraseText(phrase: LyricPhrase): string {
  return phrase.children.map((w) => w.children.map((c) => c.text).join("")).join("");
}

/**
 * 実行時歌詞（フレーズ→単語→文字を children でたどる構造）へコーラス補正を適用した新しい構造を返す（入力は変更しない）。
 * 文字の時刻を置き換えたうえで、単語の時刻を先頭・末尾文字へ、フレーズの時刻を先頭・末尾単語へ再計算する。
 */
export function applyChorusCorrectionToLyricVideo(
  video: LyricVideo,
  corrections: readonly ChorusPhraseCorrection[],
): LyricVideo {
  const phrases: LyricPhrase[] = video.phrases.map((p) => ({
    ...p,
    children: p.children.map((w) => ({ ...w, children: w.children.map((c) => ({ ...c })) })),
  }));
  const used = new Set<number>();
  for (const correction of corrections) {
    const idx = phrases.findIndex((p, i) => !used.has(i) && lyricPhraseText(p) === correction.phraseText);
    if (idx < 0) {
      throw new ChorusCorrectionMismatchError(`対象フレーズ「${correction.phraseText}」が歌詞に見つかりません`);
    }
    used.add(idx);
    const phrase = phrases[idx];
    assertStructureMatches(
      phrase.children.map((w) => w.children.length),
      correction,
    );
    const newWords: LyricWord[] = phrase.children.map((w, wi) => {
      const newChars: LyricChar[] = w.children.map((c, ci) => ({
        ...c,
        startTime: correction.words[wi][ci].startTime,
        endTime: correction.words[wi][ci].endTime,
      }));
      return {
        ...w,
        children: newChars,
        startTime: newChars[0].startTime,
        endTime: newChars[newChars.length - 1].endTime,
      };
    });
    phrases[idx] = {
      ...phrase,
      children: newWords,
      startTime: newWords[0].startTime,
      endTime: newWords[newWords.length - 1].endTime,
    };
  }
  return { ...video, phrases };
}
