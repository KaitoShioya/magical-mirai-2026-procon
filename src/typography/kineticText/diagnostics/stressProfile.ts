// 診断ストレスの出現計画（純粋関数）。実測再現と最大負荷の2種類を持つ。
// 実測再現は合否判定に、最大負荷は余力確認に使う（混同を避けるため分ける）。

/** 短音と判定する継続時間の上限（ミリ秒）。出典 docs/analysis/song-insights.md の短音の定義（150ミリ秒以下）。 */
const SHORT_NOTE_MAX_MS = 150;

/**
 * 最大負荷で単一文字を生かし続ける時間（ミリ秒）。
 * 採用理由: 計測区間（数十秒未満を想定）の全体で同時上限の文字が共存し続けるよう、計測区間より十分長い値を採る。
 */
const MAX_LOAD_LIFETIME_MS = 10_000;

export interface CharOnset {
  readonly char: string;
  readonly startTimeMs: number;
  readonly durationMs: number;
}

export interface SpawnEvent {
  readonly char: string;
  readonly atMs: number;
  readonly lifetimeMs: number;
}

export interface ReplayProfile {
  readonly events: readonly SpawnEvent[];
  readonly total: number;
  readonly shortRatio: number;
}

export interface MaxLoadProfile {
  readonly singleEvents: readonly SpawnEvent[];
  readonly batchedPhraseLength: number;
}

interface SongmapCharLike {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
}
interface SongmapLike {
  readonly phrases: ReadonlyArray<{
    readonly words: ReadonlyArray<{ readonly chars: ReadonlyArray<SongmapCharLike> }>;
  }>;
}

/**
 * songmap の木構造（フレーズ→単語→文字）から文字の開始時刻列を取り出す。
 * フレーズ内の子（words・chars）だけを辿り、next 連結は使わない
 * （next はフレーズ境界を越えて重複する既知の罠があるため。CLAUDE.md 開発ガイドライン）。
 */
export function extractCharOnsets(songmap: SongmapLike): CharOnset[] {
  const onsets: CharOnset[] = [];
  for (const phrase of songmap.phrases) {
    for (const word of phrase.words) {
      for (const char of word.chars) {
        onsets.push({
          char: char.text,
          startTimeMs: char.startTime,
          durationMs: char.endTime - char.startTime,
        });
      }
    }
  }
  return onsets;
}

/** 出現する一意な文字を並べた文字列。暖めとサブセットの対象。 */
export function uniqueCharsOf(onsets: readonly CharOnset[]): string {
  const set = new Set<string>();
  for (const onset of onsets) {
    set.add(onset.char);
  }
  return [...set].join("");
}

/**
 * 実測再現プロファイル。songmap の文字開始時刻をそのまま再生する。
 * residenceMs は文字を表示し続ける残存時間で、合否計測の固定条件として与える。
 */
export function buildRealReplayProfile(
  onsets: readonly CharOnset[],
  residenceMs: number
): ReplayProfile {
  const events: SpawnEvent[] = onsets
    .map((onset) => ({ char: onset.char, atMs: onset.startTimeMs, lifetimeMs: residenceMs }))
    .sort((a, b) => a.atMs - b.atMs);
  const total = onsets.length;
  const shortCount = onsets.filter((onset) => onset.durationMs <= SHORT_NOTE_MAX_MS).length;
  const shortRatio = total === 0 ? 0 : shortCount / total;
  return { events, total, shortRatio };
}

/**
 * 最大負荷プロファイル。単一文字層を同時上限まで同時刻で出し、一括文字層は上限文字数のフレーズにする。
 * 合否には使わず、余力確認のみに使う。
 */
export function buildMaxLoadProfile(options: {
  singleLimit: number;
  batchedLimit: number;
  charSample: string;
}): MaxLoadProfile {
  const { singleLimit, batchedLimit, charSample } = options;
  const sample = charSample.length > 0 ? charSample : "あ";
  const singleEvents: SpawnEvent[] = [];
  for (let index = 0; index < singleLimit; index += 1) {
    singleEvents.push({
      char: sample[index % sample.length],
      atMs: 0,
      lifetimeMs: MAX_LOAD_LIFETIME_MS,
    });
  }
  return { singleEvents, batchedPhraseLength: batchedLimit };
}
