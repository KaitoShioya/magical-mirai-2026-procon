// 音楽地図ダンプ（songmap JSON）から、各生成関数とスキーマが要求する入力形への変換を1か所に集約する純粋関数群。
// 同じ変換が複数の実データ検証テストに重複して書かれており、生成本体（buildProfile.ts）が別途同じ変換を書くと
// 将来ずれて生成結果とテスト前提が食い違う。本モジュールを変換の唯一の定義とし、生成本体と各テストがここから取り込む。
//
// フィールド名の相違（変換が必要な理由）を先に述べる。songmap は時刻と長さを startTime・endTime・duration、
// ビートの小節内拍数を length、曲メタを song.name・song.duration、感情を vaCurve の {t, v, a} で持つ。
// 一方スキーマと生成関数は startTimeMs・endTimeMs・durationMs、lengthInBar、song.title・song.durationMs、
// emotionCurve.points の {tMs, valence, arousal} を使う。本モジュールはこの差を吸収する。
//
// 依存方針: スキーマの型と生成層の共通型だけを取り込み、中核（engine 等）・rendering・tools・three.js・TextAlive は
// 取り込まない（src/profiles/generate/README.md・docs/decisions/architecture.md §5 の依存規則）。

import type {
  Beat,
  Chord,
  RepetitiveSegment,
  LoudnessCurve,
  EmotionCurve,
  LyricChar,
} from "../schema/profileSchema";
import type { ChorusSegment, ShowcaseInput } from "./types";
import type { OnsetBeat, OnsetInput } from "./onsetNotes";
import type { DensityBeat } from "./density";
import type { TapBudgetInput } from "./tapBudget";

/** 音楽地図ダンプのうち本モジュールが読む項目だけを記述した型。docs/analysis/<曲キー>.songmap.json の構造に一致する。
 *  読まない項目（durationSec など）は省くが、JSON にそれらが含まれていても変換には影響しない。 */
export interface RawSongmap {
  song: {
    name: string;
    artist: string;
    key: string;
    songUrl: string;
    duration: number;
  };
  beats: {
    index: number;
    position: number;
    startTime: number;
    endTime: number;
    length: number;
    duration: number;
  }[];
  chords: {
    index: number;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
  }[];
  segments: {
    index: number;
    startTime: number;
    endTime: number;
    duration: number;
    isChorus: boolean;
  }[];
  phrases: {
    words: {
      chars: {
        startTime: number;
        endTime: number;
        text: string;
      }[];
    }[];
  }[];
  maxVocalAmplitude: number;
  valenceArousal: {
    median: { valence: number; arousal: number };
  };
  amplitudeStep: number;
  amplitudeCurve: number[];
  vaCurve: { t: number; v: number; a: number }[];
}

/** ビート列をスキーマの Beat 型へ変換する。songmap の length をスキーマの lengthInBar に対応づける。 */
export function toBeats(songmap: RawSongmap): Beat[] {
  return songmap.beats.map((b) => ({
    index: b.index,
    position: b.position,
    startTimeMs: b.startTime,
    endTimeMs: b.endTime,
    lengthInBar: b.length,
    durationMs: b.duration,
  }));
}

/** 和音列をスキーマの Chord 型へ変換する。無和音「N」を含む全区間をそのまま返す（除外しない）。 */
export function toChords(songmap: RawSongmap): Chord[] {
  return songmap.chords.map((c) => ({
    index: c.index,
    name: c.name,
    startTimeMs: c.startTime,
    endTimeMs: c.endTime,
    durationMs: c.duration,
  }));
}

/** 繰り返し区間列をスキーマの RepetitiveSegment 型へ変換する。 */
export function toRepetitiveSegments(songmap: RawSongmap): RepetitiveSegment[] {
  return songmap.segments.map((s) => ({
    index: s.index,
    startTimeMs: s.startTime,
    endTimeMs: s.endTime,
    durationMs: s.duration,
    isChorus: s.isChorus,
  }));
}

/** サビ区間を生成関数共通の ChorusSegment 形（startMs・endMs）へ変換する。
 *  繰り返し区間のうち isChorus が真のものだけを採る。生成関数（オンセット・見せ場・密度・タップ上限）は
 *  この形を要求し、スキーマの RepetitiveSegment の startTimeMs・endTimeMs とは別形である。 */
export function toChorusSegments(songmap: RawSongmap): ChorusSegment[] {
  return songmap.segments
    .filter((s) => s.isChorus)
    .map((s) => ({ startMs: s.startTime, endMs: s.endTime }));
}

/** オンセット選択（#38）が要求するビート形（index・startTimeMs）へ変換する。 */
export function toOnsetBeats(songmap: RawSongmap): OnsetBeat[] {
  return songmap.beats.map((b) => ({ index: b.index, startTimeMs: b.startTime }));
}

/** 譜面密度設計（#43）が要求するビート形（index・startMs・endMs）へ変換する。
 *  密度は startMs・endMs を読み、オンセット選択の startTimeMs とは別名である点に注意する。 */
export function toDensityBeats(songmap: RawSongmap): DensityBeat[] {
  return songmap.beats.map((b) => ({ index: b.index, startMs: b.startTime, endMs: b.endTime }));
}

/** タップ総数上限（#44）と見せ場（#41）が要求する、拍開始時刻の平坦配列へ変換する。 */
export function toBeatsMs(songmap: RawSongmap): number[] {
  return songmap.beats.map((b) => b.startTime);
}

/** 声量曲線をスキーマの LoudnessCurve 型へ変換する。
 *  刻みは amplitudeStep、最大値は maxVocalAmplitude、サンプル列は amplitudeCurve をそのまま使う。 */
export function toLoudnessCurve(songmap: RawSongmap): LoudnessCurve {
  return {
    stepMs: songmap.amplitudeStep,
    maxAmplitude: songmap.maxVocalAmplitude,
    values: songmap.amplitudeCurve,
  };
}

/** 感情曲線の刻み（ミリ秒）を vaCurve の隣接2点の時刻差から求める。
 *  隣接差から求める理由を先に述べる。vaCurve は等間隔の時系列であり、その間隔がそのまま刻みである。
 *  値を固定値で埋めず実データから導くことでデータドリブンの原則（CLAUDE.md）に従い、曲を替えても正しい刻みになる。
 *  2点未満や差が正でない場合は刻みを定義できないため、文脈付きの例外で失敗させる。 */
function deriveEmotionStepMs(vaCurve: RawSongmap["vaCurve"]): number {
  if (vaCurve.length < 2) {
    throw new Error(`感情曲線の刻みを求めるには vaCurve が2点以上必要ですが ${vaCurve.length} 点でした`);
  }
  const step = vaCurve[1].t - vaCurve[0].t;
  if (!(step > 0)) {
    throw new Error(`感情曲線の刻みが正ではありません（vaCurve の先頭2点の時刻差 ${step}）`);
  }
  return step;
}

/** 感情曲線をスキーマの EmotionCurve 型へ変換する。各点を {tMs, valence, arousal} へ写し、中央値は valenceArousal.median を使う。 */
export function toEmotionCurve(songmap: RawSongmap): EmotionCurve {
  return {
    stepMs: deriveEmotionStepMs(songmap.vaCurve),
    points: songmap.vaCurve.map((p) => ({ tMs: p.t, valence: p.v, arousal: p.a })),
    median: songmap.valenceArousal.median,
  };
}

/** 歌詞文字をスキーマの LyricChar 型へ平坦化する。フレーズ→単語→文字の入れ子を畳み、時刻名を付け替える。 */
export function toLyricChars(songmap: RawSongmap): LyricChar[] {
  const chars: LyricChar[] = [];
  for (const phrase of songmap.phrases) {
    for (const word of phrase.words) {
      for (const char of word.chars) {
        chars.push({ startTimeMs: char.startTime, endTimeMs: char.endTime, text: char.text });
      }
    }
  }
  return chars;
}

/** 歌詞の各文字の開始時刻の平坦配列を返す。見せ場（#41）と密度（#43）の歌詞密度の素に使う。 */
export function toLyricCharOnsetsMs(songmap: RawSongmap): number[] {
  const onsets: number[] = [];
  for (const phrase of songmap.phrases) {
    for (const word of phrase.words) {
      for (const char of word.chars) {
        onsets.push(char.startTime);
      }
    }
  }
  return onsets;
}

// ── 利用側ごとの入力をまとめて作る合成アダプタ ──
// 個々のフィールド変換を組み合わせて、各生成関数が要求する入力オブジェクトを1つの関数で作る。
// 生成本体（buildProfile.ts）と各実データ検証テストが同じ関数を使うことで、入力の作り方のずれを無くす。

/** オンセット選択（#38）の入力を songmap から作る。 */
export function toOnsetInput(songmap: RawSongmap): OnsetInput {
  return {
    beats: toOnsetBeats(songmap),
    chorusSegments: toChorusSegments(songmap),
  };
}

/** タップ総数上限（#44）の入力を songmap から作る。 */
export function toTapBudgetInput(songmap: RawSongmap): TapBudgetInput {
  return {
    beatsMs: toBeatsMs(songmap),
    chorusSegments: toChorusSegments(songmap),
  };
}

/** 見せ場（#41）の入力を songmap から作る。曲長・声量サンプル列・声量サンプル間隔・歌詞文字開始時刻・サビ区間・拍開始時刻を集める。 */
export function toShowcaseInput(songmap: RawSongmap): ShowcaseInput {
  return {
    durationMs: songmap.song.duration,
    amplitudeCurve: songmap.amplitudeCurve,
    amplitudeStepMs: songmap.amplitudeStep,
    lyricCharOnsetsMs: toLyricCharOnsetsMs(songmap),
    chorusSegments: toChorusSegments(songmap),
    beatsMs: toBeatsMs(songmap),
  };
}
