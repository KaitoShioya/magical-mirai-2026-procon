// 歌詞タイムライン橋渡し。TextAlive の歌詞構造（フレーズ・単語・文字の入れ子）を、
// TextAlive のオブジェクト参照に依存しない平易なデータへ変換し、再生位置（ミリ秒）から
// 発声中の歌詞単位を引けるようにする純粋ロジック。判定・得点・可読性の役割は持たない。
// TextAlive のパッケージ（型を含む）を一切 import しない。実 player.video との結線は #59 が担う。
// 出典: docs/decisions/architecture.md §4・§5、src/textalive/README.md、Issue #133。

// ---- 入力の構造型（モジュールはこの型に閉じる。実 IVideo がこの型を構造的に満たす） ----
// 各単位は最小の項目だけを要求する。実 IVideo・IPhrase・IWord・IChar がこれを満たすことは
// パッケージ型定義で確認済みであり、差異の吸収が要るとしてもそれは #59 の責務とする。

/** 入力の文字（最小の項目だけを持つ）。 */
export interface LyricSourceChar {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
}

/** 入力の単語。子に文字を持つ。 */
export interface LyricSourceWord {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly children: readonly LyricSourceChar[];
}

/** 入力のフレーズ。子に単語を持つ。 */
export interface LyricSourcePhrase {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly children: readonly LyricSourceWord[];
}

/** 入力の動画。フレーズの順序付き配列を持つ。 */
export interface LyricSourceVideo {
  readonly phrases: readonly LyricSourcePhrase[];
}

// ---- 出力の型（平易なデータ。オブジェクト参照を持たない） ----

/** 歌詞タイムラインの文字単位。 */
export interface LyricCharUnit {
  /** 所属フレーズの番号（走査順、0始まり）。 */
  readonly phraseIndex: number;
  /** 所属フレーズ内の単語番号（0始まり）。 */
  readonly wordIndex: number;
  /** 所属単語内の文字番号（0始まり）。 */
  readonly charIndex: number;
  /** 曲全体の文字通し番号（走査順、0始まり）。 */
  readonly charOrdinal: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  /** 文字の文字列（実データでは1文字）。 */
  readonly text: string;
}

/** 歌詞タイムラインの単語単位。 */
export interface LyricWordUnit {
  readonly phraseIndex: number;
  readonly wordIndex: number;
  /** 曲全体の単語通し番号（走査順、0始まり）。 */
  readonly wordOrdinal: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly text: string;
  readonly chars: readonly LyricCharUnit[];
}

/** 歌詞タイムラインのフレーズ単位。 */
export interface LyricPhraseUnit {
  readonly phraseIndex: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly text: string;
  readonly words: readonly LyricWordUnit[];
}

/** 歌詞タイムライン。フレーズの入れ子と件数を持つ平易なデータ。 */
export interface LyricsTimeline {
  readonly phrases: readonly LyricPhraseUnit[];
  readonly phraseCount: number;
  readonly wordCount: number;
  readonly charCount: number;
}

/** 整合検査が返す不整合の1件。 */
export interface LyricsTimelineIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * 入力の歌詞構造から歌詞タイムラインを作る。
 * フレーズは入力の配列順、単語は phrase.children、文字は word.children の順に辿る。
 * word の next・char の next は使わない（フレーズ境界を越えた重複を避ける）。
 * 出力は入力の参照を保持せず、数値と文字列を値として写した新しいオブジェクトとする。
 * 入力の並びは保たず並べ替えない。入力の整合性（並び・連結・時刻）はここでは検査しない。
 * 整合性の確認が要る呼び出し側（本編結線 #59、品質ゲート #99）は findLyricsTimelineIssues を呼ぶ。
 */
export function buildLyricsTimeline(source: LyricSourceVideo): LyricsTimeline {
  const phrases: LyricPhraseUnit[] = [];
  let wordOrdinal = 0;
  let charOrdinal = 0;
  for (let phraseIndex = 0; phraseIndex < source.phrases.length; phraseIndex++) {
    const sourcePhrase = source.phrases[phraseIndex];
    const words: LyricWordUnit[] = [];
    for (let wordIndex = 0; wordIndex < sourcePhrase.children.length; wordIndex++) {
      const sourceWord = sourcePhrase.children[wordIndex];
      const chars: LyricCharUnit[] = [];
      for (let charIndex = 0; charIndex < sourceWord.children.length; charIndex++) {
        const sourceChar = sourceWord.children[charIndex];
        chars.push({
          phraseIndex,
          wordIndex,
          charIndex,
          charOrdinal,
          startTimeMs: sourceChar.startTime,
          endTimeMs: sourceChar.endTime,
          text: sourceChar.text,
        });
        charOrdinal++;
      }
      words.push({
        phraseIndex,
        wordIndex,
        wordOrdinal,
        startTimeMs: sourceWord.startTime,
        endTimeMs: sourceWord.endTime,
        text: sourceWord.text,
        chars,
      });
      wordOrdinal++;
    }
    phrases.push({
      phraseIndex,
      startTimeMs: sourcePhrase.startTime,
      endTimeMs: sourcePhrase.endTime,
      text: sourcePhrase.text,
      words,
    });
  }
  return { phrases, phraseCount: phrases.length, wordCount: wordOrdinal, charCount: charOrdinal };
}

/** 時刻探索で参照する最小の項目。 */
interface TimeSpan {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

/**
 * 開始時刻の昇順に並んだ単位列から、再生位置を範囲に含む単位を返す。該当が無ければ null。
 * 開始時刻が positionMs 以下である最も右の単位を二分探索で求め（開始時刻が等しい単位が並ぶ場合は
 * 最も後ろの単位を選ぶ）、その単位の終了時刻が positionMs 以上なら返す。
 */
function findSpanContaining<T extends TimeSpan>(units: readonly T[], positionMs: number): T | null {
  let low = 0;
  let high = units.length - 1;
  let candidate = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (units[mid].startTimeMs <= positionMs) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (candidate === -1) {
    return null;
  }
  const unit = units[candidate];
  return unit.endTimeMs >= positionMs ? unit : null;
}

/**
 * 再生位置（ミリ秒）に対応するフレーズを返す。範囲に含む（開始時刻以上かつ終了時刻以下）
 * フレーズのうち、開始時刻が最も大きいものを返す。該当が無ければ null。
 * 入力のフレーズは開始時刻の昇順であることを前提とする（findLyricsTimelineIssues が確認する）。
 */
export function phraseAt(timeline: LyricsTimeline, positionMs: number): LyricPhraseUnit | null {
  return findSpanContaining(timeline.phrases, positionMs);
}

/** 再生位置に対応する単語を返す。該当フレーズの中だけを探す。該当が無ければ null。 */
export function wordAt(timeline: LyricsTimeline, positionMs: number): LyricWordUnit | null {
  const phrase = phraseAt(timeline, positionMs);
  if (phrase === null) {
    return null;
  }
  return findSpanContaining(phrase.words, positionMs);
}

/** 再生位置に対応する文字を返す。該当単語の中だけを探す。該当が無ければ null。 */
export function charAt(timeline: LyricsTimeline, positionMs: number): LyricCharUnit | null {
  const word = wordAt(timeline, positionMs);
  if (word === null) {
    return null;
  }
  return findSpanContaining(word.chars, positionMs);
}

/**
 * 歌詞タイムラインの整合性を検査し、不整合の一覧を返す（空なら整合）。例外は投げない。
 */
export function findLyricsTimelineIssues(timeline: LyricsTimeline): LyricsTimelineIssue[] {
  const issues: LyricsTimelineIssue[] = [];
  let expectedWordOrdinal = 0;
  let expectedCharOrdinal = 0;
  const seenCharKeys = new Set<string>();

  checkSiblingTimes(issues, timeline.phrases, "phrases");

  for (let phraseIndex = 0; phraseIndex < timeline.phrases.length; phraseIndex++) {
    const phrase = timeline.phrases[phraseIndex];
    const phrasePath = `phrases[${phraseIndex}]`;
    if (phrase.phraseIndex !== phraseIndex) {
      issues.push({ path: `${phrasePath}.phraseIndex`, message: "フレーズ番号が走査順と一致しない" });
    }

    checkSiblingTimes(issues, phrase.words, `${phrasePath}.words`);

    const wordsConcat = phrase.words.map((w) => w.text).join("");
    if (wordsConcat !== phrase.text) {
      issues.push({ path: phrasePath, message: "単語の文字列の連結がフレーズの文字列に一致しない" });
    }

    let phraseCharsConcat = "";
    for (let wordIndex = 0; wordIndex < phrase.words.length; wordIndex++) {
      const word = phrase.words[wordIndex];
      const wordPath = `${phrasePath}.words[${wordIndex}]`;
      if (word.phraseIndex !== phraseIndex) {
        issues.push({ path: `${wordPath}.phraseIndex`, message: "所属フレーズ番号が一致しない" });
      }
      if (word.wordIndex !== wordIndex) {
        issues.push({ path: `${wordPath}.wordIndex`, message: "単語番号が走査順と一致しない" });
      }
      if (word.wordOrdinal !== expectedWordOrdinal) {
        issues.push({ path: `${wordPath}.wordOrdinal`, message: "単語通し番号が走査順に0から連続していない" });
      }
      expectedWordOrdinal++;
      checkChildWithinParent(issues, word, phrase, wordPath);
      checkSiblingTimes(issues, word.chars, `${wordPath}.chars`);

      const charsConcat = word.chars.map((c) => c.text).join("");
      if (charsConcat !== word.text) {
        issues.push({ path: wordPath, message: "文字の文字列の連結が単語の文字列に一致しない" });
      }
      phraseCharsConcat += charsConcat;

      for (let charIndex = 0; charIndex < word.chars.length; charIndex++) {
        const char = word.chars[charIndex];
        const charPath = `${wordPath}.chars[${charIndex}]`;
        if (char.phraseIndex !== phraseIndex || char.wordIndex !== wordIndex) {
          issues.push({ path: charPath, message: "所属するフレーズ番号または単語番号が一致しない" });
        }
        if (char.charIndex !== charIndex) {
          issues.push({ path: `${charPath}.charIndex`, message: "文字番号が走査順と一致しない" });
        }
        if (char.charOrdinal !== expectedCharOrdinal) {
          issues.push({ path: `${charPath}.charOrdinal`, message: "文字通し番号が走査順に0から連続していない" });
        }
        expectedCharOrdinal++;
        const key = `${char.phraseIndex}/${char.wordIndex}/${char.charIndex}`;
        if (seenCharKeys.has(key)) {
          issues.push({ path: charPath, message: "三つ組の識別子が重複している" });
        }
        seenCharKeys.add(key);
        checkChildWithinParent(issues, char, word, charPath);
      }
    }

    if (phraseCharsConcat !== phrase.text) {
      issues.push({ path: phrasePath, message: "全文字の文字列の連結がフレーズの文字列に一致しない" });
    }
  }

  if (timeline.phraseCount !== timeline.phrases.length) {
    issues.push({ path: "phraseCount", message: "フレーズ件数がフレーズ数と一致しない" });
  }
  if (timeline.wordCount !== expectedWordOrdinal) {
    issues.push({ path: "wordCount", message: "単語件数が単語数と一致しない" });
  }
  if (timeline.charCount !== expectedCharOrdinal) {
    issues.push({ path: "charCount", message: "文字件数が文字数と一致しない" });
  }

  return issues;
}

/**
 * 兄弟の単位列が、各単位の時刻が有限の数値であり、終了時刻が開始時刻以上（ゼロ長は許容）であり、
 * 開始時刻が昇順で、時間が重ならないことを検査する。重なりは「次の開始時刻が前の終了時刻より小さい」
 * 場合のみとし、両者が等しい共有境界は重なりとしない。時刻は厳密に比較する（許容誤差を設けない）。
 *
 * 有限性を最初に検査する理由を先に述べる。時刻が有限の数値（数でない値や正負の無限大でない値）でない場合、
 * 以降の大小比較は常に偽になり、壊れた時刻を整合として見逃す。曲プロファイルの検査
 * （src/profiles/schema/validateProfile.ts）も時刻に有限の数値を要求しており、これに揃える。
 */
function checkSiblingTimes(
  issues: LyricsTimelineIssue[],
  units: readonly TimeSpan[],
  basePath: string
): void {
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (!Number.isFinite(unit.startTimeMs)) {
      issues.push({ path: `${basePath}[${i}].startTimeMs`, message: "開始時刻が有限の数値でない" });
    }
    if (!Number.isFinite(unit.endTimeMs)) {
      issues.push({ path: `${basePath}[${i}].endTimeMs`, message: "終了時刻が有限の数値でない" });
    }
    if (unit.endTimeMs < unit.startTimeMs) {
      issues.push({ path: `${basePath}[${i}]`, message: "終了時刻が開始時刻より前になっている" });
    }
    if (i > 0) {
      const previous = units[i - 1];
      if (unit.startTimeMs < previous.startTimeMs) {
        issues.push({ path: `${basePath}[${i}]`, message: "開始時刻が昇順になっていない" });
      } else if (unit.startTimeMs < previous.endTimeMs) {
        issues.push({ path: `${basePath}[${i}]`, message: "前の単位と時間が重なっている" });
      }
    }
  }
}

/** 子の時間範囲が親の時間範囲の内側に収まることを検査する（両端は等しくてよい）。 */
function checkChildWithinParent(
  issues: LyricsTimelineIssue[],
  child: TimeSpan,
  parent: TimeSpan,
  path: string
): void {
  if (child.startTimeMs < parent.startTimeMs || child.endTimeMs > parent.endTimeMs) {
    issues.push({ path, message: "子の時間範囲が親の時間範囲の内側に収まっていない" });
  }
}
