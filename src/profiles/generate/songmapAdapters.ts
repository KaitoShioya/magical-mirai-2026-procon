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

/** オンセット選択（#38）が要求するビート形へ変換する。
 *  小節内拍位置（position）と小節内拍数（lengthInBar）も写す理由を先に述べる。再設計（不満①③）の強調選別は
 *  強拍（小節頭）を弱拍より優先するため、小節内拍位置が要るためである。songmap の length を lengthInBar に対応づける。 */
export function toOnsetBeats(songmap: RawSongmap): OnsetBeat[] {
  return songmap.beats.map((b) => ({
    index: b.index,
    startTimeMs: b.startTime,
    position: b.position,
    lengthInBar: b.length,
  }));
}

/** 各フレーズ先頭文字の開始時刻の配列を返す（昇順想定）。番号割当（#39再設計）の跳躍優先順位の第1条件
 *  （フレーズ先頭）に使う。
 *  フレーズ単位の取得は phrase.words[].chars[] を辿る（CLAUDE.md の linked list の罠を避けるため .next を使わない）。
 *  文字を1つも持たないフレーズや空の単語があり得るため、先頭文字が得られないフレーズは飛ばす（不正な時刻を作らない防御）。 */
export function toPhraseOnsetsMs(songmap: RawSongmap): number[] {
  const onsets: number[] = [];
  for (const phrase of songmap.phrases) {
    let firstCharTime: number | undefined;
    for (const word of phrase.words) {
      if (word.chars.length > 0) {
        firstCharTime = word.chars[0].startTime;
        break;
      }
    }
    if (firstCharTime !== undefined) onsets.push(firstCharTime);
  }
  return onsets;
}

/** 各コード区間の開始時刻の配列を返す（昇順想定）。番号割当のコード境界跳躍と、選別のコード変化近接に使う。
 *  無和音「N」を含む全区間の開始時刻をそのまま返す（コードの音高集合が変わる境界はどの区間境界でも生じるため）。 */
export function toChordChangeTimesMs(songmap: RawSongmap): number[] {
  return songmap.chords.map((c) => c.startTime);
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

/** 0以上1以下へ丸める。理由を先に述べる。TextAlive の感情値（valence・arousal）はモデルの出力で、わずかに0未満や1超の
 *  値になることがある（本曲は arousal が最小マイナス0.132）。スキーマは0以上1以下を要求し、感情値は色・動きへの写像の入力で
 *  あって、範囲外の極値を境界へ丸めても写像の連続性を損なわないため、境界へクランプする。 */
function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 感情曲線をスキーマの EmotionCurve 型へ変換する。各点を {tMs, valence, arousal} へ写し、中央値は valenceArousal.median を使う。
 *  valence・arousal は0以上1以下へクランプする（範囲外になり得る理由は clampUnit の注記に述べる）。 */
export function toEmotionCurve(songmap: RawSongmap): EmotionCurve {
  return {
    stepMs: deriveEmotionStepMs(songmap.vaCurve),
    points: songmap.vaCurve.map((p) => ({ tMs: p.t, valence: clampUnit(p.v), arousal: clampUnit(p.a) })),
    median: {
      valence: clampUnit(songmap.valenceArousal.median.valence),
      arousal: clampUnit(songmap.valenceArousal.median.arousal),
    },
  };
}

/** 歌詞文字の時刻の重なり・逆順を前向き走査で直し、開始時刻が昇順かつ前の文字の終了時刻をまたがない列にする。
 *  採用理由を先に述べる。検証関数 validateProfile は lyricChars に「開始時刻が昇順」かつ「前の文字の終了時刻を
 *  またがない」ことを要求する（validateProfile.ts の checkAscendingNonOverlap）。一方 TextAlive の歌詞は、同時に
 *  発声する2文字が同一開始時刻・終了時刻のまたぎで返ることがあり（世界最後の音楽隊で前の文字を約235ミリ秒またぐ
 *  箇所が1つある）、そのままでは検証に落ちる。ここで整える lyricChars は歌詞密度と歌詞オンセット近接の素データで
 *  あり（実際の表示時刻は実行時に TextAlive 自身の文字時刻を使う）、重なりを境界で詰めても密度・近接の意味は保たれる。
 *
 *  許容（TIME_TOLERANCE_MS と同じ1ミリ秒）を採用する理由を先に述べる。検証は前の文字の終了を許容ぶんだけまたぐ
 *  重なりは認める（checkAscendingNonOverlap は r.start < prev.end - 許容 のときだけ不合格にする）。修復もこの許容に
 *  合わせ、許容を超える重なり・逆順だけを直す。こうすると、許容内のわずかなまたぎ（TextAlive が返す1ミリ秒未満の差で、
 *  検証は認める）には手を加えず、既に検証を通っている曲の生成物を1ビットも変えない。
 *
 *  直し方の理由を先に述べる。直前の文字の確定後の終了時刻 previousEndMs を保ち、開始がそれを許容を超えて下回るなら
 *  開始を previousEndMs へ繰り上げ、終了が開始を許容を超えて下回るなら終了を開始へ繰り上げる。これにより順序と
 *  非重なりを最小の移動で満たす。決定的な純粋関数である。 */
function repairAscendingNonOverlap(chars: readonly LyricChar[]): LyricChar[] {
  // 検証関数 checkAscendingNonOverlap と同じ許容（1ミリ秒）。修復の発火条件を検証の不合格条件に一致させるため、
  // 同じ値を用いる。
  const TIME_TOLERANCE_MS = 1;
  let previousEndMs = Number.NEGATIVE_INFINITY;
  return chars.map((c) => {
    const startTimeMs = c.startTimeMs < previousEndMs - TIME_TOLERANCE_MS ? previousEndMs : c.startTimeMs;
    const endTimeMs = c.endTimeMs < startTimeMs - TIME_TOLERANCE_MS ? startTimeMs : c.endTimeMs;
    previousEndMs = endTimeMs;
    return { startTimeMs, endTimeMs, text: c.text };
  });
}

/** 歌詞文字をスキーマの LyricChar 型へ平坦化する。フレーズ→単語→文字の入れ子を畳み、時刻名を付け替える。
 *  畳んだ後、時刻の重なり・逆順を repairAscendingNonOverlap で直して検証の要求（昇順・非重なり）を満たす。 */
export function toLyricChars(songmap: RawSongmap): LyricChar[] {
  const chars: LyricChar[] = [];
  for (const phrase of songmap.phrases) {
    for (const word of phrase.words) {
      for (const char of word.chars) {
        chars.push({ startTimeMs: char.startTime, endTimeMs: char.endTime, text: char.text });
      }
    }
  }
  return repairAscendingNonOverlap(chars);
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

/** オンセット選択（#38再設計）の入力を songmap と密度プラン由来の部品から作る。
 *  密度プランの区間・区間別目標数・見せ場信号は songmap だけからは導けないため、第2引数で受け取り、songmap 由来の
 *  部品（拍・サビ区間・コード変化時刻・歌詞オンセット・声量）とまとめて1つの OnsetInput にする。 */
export function toOnsetInput(
  songmap: RawSongmap,
  densityParts: {
    regions: OnsetInput["regions"];
    regionTargets: OnsetInput["regionTargets"];
    selectionSignal: OnsetInput["selectionSignal"];
  },
): OnsetInput {
  const loudnessCurve = toLoudnessCurve(songmap);
  return {
    beats: toOnsetBeats(songmap),
    chorusSegments: toChorusSegments(songmap),
    regions: densityParts.regions,
    regionTargets: densityParts.regionTargets,
    chordChangeTimesMs: toChordChangeTimesMs(songmap),
    lyricCharOnsetsMs: toLyricCharOnsetsMs(songmap),
    loudness: {
      stepMs: loudnessCurve.stepMs,
      maxAmplitude: loudnessCurve.maxAmplitude,
      values: loudnessCurve.values,
    },
    selectionSignal: densityParts.selectionSignal,
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
