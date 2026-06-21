// TAKEOVER曲プロファイルの組み立て（Issue #46）。
// 音楽地図のダンプ（docs/analysis/takeover.songmap.json を読み込んだ素のオブジェクト）と手動定義から、
// 検証器 validateProfile を通る1つの SongProfile を決定論的に組み立てる純粋関数を提供する。
//
// 依存方針: 解析データから派生フィールドを作る既存の生成関数（src/profiles/generate）と、曲非依存の
// カメラ軌跡評価器（src/utils/cameraTrajectory）、ロード設定（src/config/songs）を取り込む。曲非依存の中核
// （engine 等）は取り込まない（src/profiles/README.md の依存規則）。

import { SONGS } from "../../config/songs";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";
import { resolveNoChordRegions } from "../generate/noChordResolution";
import { generateChordToneSlots, type ResolvedChordRegion } from "../generate/chordToneSlots";
import { generateShowcases } from "../generate/showcases";
import { generateOnsetNotes } from "../generate/onsetNotes";
import { applyNotePatterns } from "../generate/notePatterns";
import { placeNotesOnTrajectory } from "../generate/noteTrajectory";
import { generateTapBudget } from "../generate/tapBudget";
import { lyricDensityWindows } from "../generate/density";
import {
  TAKEOVER_MUSICAL_KEY,
  TAKEOVER_SONG_KEY,
  TAKEOVER_TEMPO_BPM,
  takeoverCameraKeyframes,
  takeoverDiversityLabels,
  takeoverNoChordTreatments,
  takeoverOperationSound,
  takeoverTapColors,
} from "./manualData";
import type {
  Beat,
  Chord,
  ChordToneSlotRegion,
  DiversityRole,
  DiversityZone,
  EmotionPoint,
  LyricChar,
  NcRange,
  Note,
  RepetitiveSegment,
  SongProfile,
} from "../schema/profileSchema";

/** 音楽地図のダンプのうち本組み立てが読むフィールドだけを表す構造。 */
export interface TakeoverSongmap {
  song: { name: string; artist: string; key: string; duration: number };
  beats: {
    index: number;
    position: number;
    startTime: number;
    endTime: number;
    length: number;
    duration: number;
  }[];
  chords: { index: number; name: string; startTime: number; endTime: number; duration: number }[];
  segments: { index: number; startTime: number; endTime: number; duration: number; isChorus: boolean }[];
  phrases: { words: { chars: { startTime: number; endTime: number; text: string }[] }[] }[];
  amplitudeStep: number;
  maxVocalAmplitude: number;
  amplitudeCurve: number[];
  vaCurve: { t: number; v: number; a: number }[];
  valenceArousal: { median: { valence: number; arousal: number } };
}

// コード名のうち無和音を表す記号。
const NO_CHORD_SYMBOL = "N";

// スキーマ版数。現行の検証器が受け付ける版数は1。
const SCHEMA_VERSION = 1;

// 感情曲線の刻み（ミリ秒）。理由を先に述べる。音楽地図の vaCurve は毎秒1点で記録されるため、隣接点の時刻差に
// 一致する1000ミリ秒を刻みとする。
const EMOTION_CURVE_STEP_MS = 1000;

// 歌詞密度の窓幅（ミリ秒）。理由を先に述べる。歌詞密度モジュール（density.ts）の既定窓幅と揃え、数小節を1窓として
// 歌詞の粗密を捉える。毎分175拍では1小節（4拍）が約1372ミリ秒で、10000ミリ秒は約7小節に当たる。
const LYRIC_DENSITY_WINDOW_MS = 10000;

// 多様性逓減の役割を反復区間の時刻順に割り当てる並び。先頭=主題、中央=変奏、末尾=回帰。
const DIVERSITY_ROLES_IN_ORDER: readonly DiversityRole[] = ["theme", "variation", "reprise"];

/** 音楽地図のダンプから TAKEOVER の完成プロファイルを組み立てる。 */
export function buildTakeoverProfile(songmap: TakeoverSongmap): SongProfile {
  const durationMs = songmap.song.duration;

  const registered = SONGS.find((s) => s.key === TAKEOVER_SONG_KEY);
  if (!registered) {
    throw new Error(`ロード設定 SONGS に ${TAKEOVER_SONG_KEY} が存在しない`);
  }

  // --- 解析由来の基礎フィールド（音楽地図の素のフィールドからスキーマの形へ写す） ---
  const beats: Beat[] = songmap.beats.map((b) => ({
    index: b.index,
    position: b.position,
    startTimeMs: b.startTime,
    endTimeMs: b.endTime,
    lengthInBar: b.length,
    durationMs: b.duration,
  }));
  const beatsMs = beats.map((b) => b.startTimeMs);

  // コード区間の終了を曲長で頭打ちにする理由を先に述べる。音楽地図のコードは曲長をわずかに超えて記録されることが
  // あり（TAKEOVERでは末尾コードが曲長＋19ミリ秒）、検証器はコード区間の末尾超過を2000ミリ秒まで許すが、無和音区間
  // （ncRanges）には1ミリ秒しか許さない。末尾のコードが無和音区間のとき両者の許容差の食い違いで検証に失敗するため、
  // 曲を超えて鳴らない事実に合わせてコード終了を曲長で頭打ちにし、長さも合わせて取り直す。
  const chords: Chord[] = songmap.chords.map((c) => {
    const endTimeMs = Math.min(c.endTime, durationMs);
    return {
      index: c.index,
      name: c.name,
      startTimeMs: c.startTime,
      endTimeMs,
      durationMs: endTimeMs - c.startTime,
    };
  });

  const repetitiveSegments: RepetitiveSegment[] = songmap.segments.map((s) => ({
    index: s.index,
    startTimeMs: s.startTime,
    endTimeMs: s.endTime,
    durationMs: s.duration,
    isChorus: s.isChorus,
  }));
  const chorusSegments = repetitiveSegments
    .filter((s) => s.isChorus)
    .map((s) => ({ startMs: s.startTimeMs, endMs: s.endTimeMs }));

  const lyricChars: LyricChar[] = [];
  for (const phrase of songmap.phrases) {
    for (const word of phrase.words) {
      for (const ch of word.chars) {
        lyricChars.push({ startTimeMs: ch.startTime, endTimeMs: ch.endTime, text: ch.text });
      }
    }
  }
  const lyricCharOnsetsMs = lyricChars.map((c) => c.startTimeMs);

  const loudnessCurve = {
    stepMs: songmap.amplitudeStep,
    maxAmplitude: songmap.maxVocalAmplitude,
    values: songmap.amplitudeCurve,
  };

  const emotionPoints: EmotionPoint[] = songmap.vaCurve.map((p) => ({
    tMs: p.t,
    valence: p.v,
    arousal: p.a,
  }));
  const emotionCurve = {
    stepMs: EMOTION_CURVE_STEP_MS,
    points: emotionPoints,
    median: songmap.valenceArousal.median,
  };

  const lyricDensity = {
    windowMs: LYRIC_DENSITY_WINDOW_MS,
    windows: lyricDensityWindows(lyricCharOnsetsMs, durationMs, LYRIC_DENSITY_WINDOW_MS),
  };

  // --- 無和音区間の解決（#37） ---
  const ncRanges: NcRange[] = chords
    .filter((c) => c.name === NO_CHORD_SYMBOL)
    .map((c) => {
      const treatment = takeoverNoChordTreatments[c.index];
      if (treatment === undefined) {
        throw new Error(`無和音区間 索引${c.index} の埋め方が手動定義に無い`);
      }
      return { startTimeMs: c.startTimeMs, endTimeMs: c.endTimeMs, treatment };
    });
  const resolutions = resolveNoChordRegions(chords, ncRanges, TAKEOVER_MUSICAL_KEY);
  const resolvedNameByIndex = new Map(resolutions.map((r) => [r.chordIndex, r.resolvedChordName]));

  // --- コードトーン格子（#36）。全210区間で、無和音区間は解決名を用いる ---
  const resolvedRegions: ResolvedChordRegion[] = chords.map((c) => {
    if (c.name !== NO_CHORD_SYMBOL) {
      return { startTimeMs: c.startTimeMs, endTimeMs: c.endTimeMs, chordName: c.name };
    }
    const resolved = resolvedNameByIndex.get(c.index);
    if (resolved === undefined) {
      throw new Error(`無和音区間 索引${c.index} の解決名が得られない`);
    }
    return { startTimeMs: c.startTimeMs, endTimeMs: c.endTimeMs, chordName: resolved };
  });
  const slots: ChordToneSlotRegion[] = generateChordToneSlots(resolvedRegions);

  // --- 見せ場（#41）・タップ上限（#44） ---
  const showcases = generateShowcases({
    durationMs,
    amplitudeCurve: songmap.amplitudeCurve,
    amplitudeStepMs: songmap.amplitudeStep,
    lyricCharOnsetsMs,
    chorusSegments,
    beatsMs,
  });
  const tapBudget = generateTapBudget({ beatsMs, chorusSegments });

  // --- ノーツ（#38→#39→#40） ---
  const onsetNotes = generateOnsetNotes({
    beats: beats.map((b) => ({ index: b.index, startTimeMs: b.startTimeMs })),
    chorusSegments,
  });
  const patternedNotes = applyNotePatterns({
    notes: onsetNotes,
    slots,
    loudness: loudnessCurve,
    emotion: emotionCurve,
  });
  const trajectory = createCameraTrajectory(takeoverCameraKeyframes);
  const placements = placeNotesOnTrajectory(
    onsetNotes.map((n) => ({ id: n.id, timeMs: n.timeMs })),
    trajectory,
  );
  const positionById = new Map(placements.map((p) => [p.id, p.trajectoryPosition]));
  const notes: Note[] = patternedNotes.map((n) => {
    const trajectoryPosition = positionById.get(n.id);
    if (trajectoryPosition === undefined) {
      throw new Error(`ノーツ ${n.id} の軌跡上位置が得られない`);
    }
    return {
      id: n.id,
      timeMs: n.timeMs,
      beatIndex: n.beatIndex,
      slotIndex: n.slotIndex,
      pattern: n.pattern,
      trajectoryPosition,
    };
  });

  // --- 多様性逓減区間（手動。境界は反復区間そのもの、役割とラベルだけを与える） ---
  const diversityZones = buildDiversityZones(repetitiveSegments);

  return {
    schemaVersion: SCHEMA_VERSION,
    song: {
      key: songmap.song.key,
      title: songmap.song.name,
      artist: songmap.song.artist,
      durationMs,
    },
    source: { songKey: TAKEOVER_SONG_KEY, songUrl: registered.songUrl, video: registered.video },
    tempoBpm: TAKEOVER_TEMPO_BPM,
    musicalKey: TAKEOVER_MUSICAL_KEY,
    beats,
    chords,
    repetitiveSegments,
    loudnessCurve,
    emotionCurve,
    lyricChars,
    lyricDensity,
    ncRanges,
    showcases,
    slots,
    notes,
    camera: takeoverCameraKeyframes,
    colors: takeoverTapColors,
    sfx: takeoverOperationSound,
    diversityZones,
    tapBudget,
  };
}

/** 反復区間（サビ）を時刻順に主題・変奏・回帰へ割り当てて多様性逓減区間を作る。 */
function buildDiversityZones(repetitiveSegments: RepetitiveSegment[]): DiversityZone[] {
  const chorus = repetitiveSegments
    .filter((s) => s.isChorus)
    .slice()
    .sort((a, b) => a.startTimeMs - b.startTimeMs);
  if (chorus.length !== DIVERSITY_ROLES_IN_ORDER.length) {
    throw new Error(
      `多様性逓減区間はサビ区間${DIVERSITY_ROLES_IN_ORDER.length}個に揃えるが、サビ区間が${chorus.length}個ある`,
    );
  }
  return chorus.map((s, i) => {
    const role = DIVERSITY_ROLES_IN_ORDER[i];
    return {
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      role,
      label: takeoverDiversityLabels[role],
    };
  });
}
