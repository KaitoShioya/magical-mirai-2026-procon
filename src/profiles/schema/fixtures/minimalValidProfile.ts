// 検証テスト用の小さな正しい曲プロファイル。
// 実TAKEOVERデータ（#46）ではなく、検証関数の合格・不合格を固定するための最小データである。
// 音楽的な妥当性（協和性・被覆率・密度の数値整合）は検査対象でないため、値は形だけ整える。
//
// 設計の要点:
//   - source は src/config/songs.ts の "takeover" 登録値に一致させる（source 照合の合格用）。
//   - 曲長を4000ミリ秒の小ささにする。
//   - chords は0ミリ秒から曲長をわずかに超えて連続被覆する（末尾超過の許容を含む）。
//   - 先頭に無和音区間（"N"）を1つ置き、その無和音区間は調の音階で埋める（先頭は "scale"）。
//   - slots は chords と1対1で境界を共有し、無和音でない区間は和音名を一致させる。

import type { SongProfile } from "../profileSchema";

export const minimalValidProfile: SongProfile = {
  schemaVersion: 1,
  song: {
    key: "takeover",
    title: "TAKEOVER",
    artist: "Twinfield",
    durationMs: 4000,
  },
  source: {
    songKey: "takeover",
    songUrl: "https://piapro.jp/t/E2i3/20251215092113",
    video: {
      beatId: 4827298,
      chordId: 2963759,
      repetitiveSegmentId: 3086266,
      lyricId: 126533,
      lyricDiffId: 28631,
    },
  },
  tempoBpm: 175,
  musicalKey: { tonicPitchClass: 5, mode: "minor" },
  beats: [
    { index: 0, position: 1, startTimeMs: 310, endTimeMs: 653, lengthInBar: 4, durationMs: 343 },
    { index: 1, position: 2, startTimeMs: 653, endTimeMs: 996, lengthInBar: 4, durationMs: 343 },
  ],
  chords: [
    { index: 0, name: "N", startTimeMs: 0, endTimeMs: 1000, durationMs: 1000 },
    { index: 1, name: "Fm", startTimeMs: 1000, endTimeMs: 2500, durationMs: 1500 },
    { index: 2, name: "Ab", startTimeMs: 2500, endTimeMs: 4019, durationMs: 1519 },
  ],
  repetitiveSegments: [
    { index: 0, startTimeMs: 1000, endTimeMs: 2500, durationMs: 1500, isChorus: true },
  ],
  loudnessCurve: {
    stepMs: 200,
    maxAmplitude: 50000,
    // 要素数は ceil(4000 / 200) = 20。
    values: [0, 0, 1200, 8000, 12000, 18000, 21000, 20000, 19000, 22000, 23000, 21000, 18000, 12000, 9000, 6000, 4000, 2000, 1000, 0],
  },
  emotionCurve: {
    stepMs: 1000,
    // 最後の tMs は durationMs - stepMs = 3000 以上で曲全体を覆う。
    points: [
      { tMs: 0, valence: 0.28, arousal: 0.46 },
      { tMs: 1000, valence: 0.3, arousal: 0.5 },
      { tMs: 2000, valence: 0.26, arousal: 0.55 },
      { tMs: 3000, valence: 0.24, arousal: 0.52 },
      { tMs: 4000, valence: 0.22, arousal: 0.48 },
    ],
    median: { valence: 0.25, arousal: 0.47 },
  },
  lyricChars: [
    { startTimeMs: 1000, endTimeMs: 1100, text: "ア" },
    { startTimeMs: 1100, endTimeMs: 1200, text: "ッ" },
    { startTimeMs: 1200, endTimeMs: 1300, text: "プ" },
  ],
  lyricDensity: {
    windowMs: 2000,
    windows: [
      { startTimeMs: 0, endTimeMs: 2000, charsPerSecond: 1.5 },
      { startTimeMs: 2000, endTimeMs: 4000, charsPerSecond: 0.5 },
    ],
  },
  ncRanges: [
    // 先頭の無和音区間。先行和音が無いため "scale" で埋める。
    { startTimeMs: 0, endTimeMs: 1000, treatment: "scale" },
  ],
  showcases: [
    { index: 0, startTimeMs: 1000, endTimeMs: 2000, weight: 0.5, isClimax: false },
    { index: 1, startTimeMs: 2500, endTimeMs: 3500, weight: 1, isClimax: true },
  ],
  slots: [
    // chords と1対1で境界を共有する。先頭は無和音区間で、調（ファのナチュラルマイナー）の音階で埋めた音高を置く。
    { startTimeMs: 0, endTimeMs: 1000, chordName: "Fm", pitches: [53, 56, 60, 65, 68, 72, 77] },
    { startTimeMs: 1000, endTimeMs: 2500, chordName: "Fm", pitches: [53, 56, 60, 65, 68, 72, 77] },
    { startTimeMs: 2500, endTimeMs: 4019, chordName: "Ab", pitches: [56, 60, 63, 68, 72, 75, 80] },
  ],
  notes: [
    { id: "n0", timeMs: 1000, beatIndex: 0, slotIndex: 3, pattern: "single", trajectoryPosition: { x: 0, y: 0, z: 0 } },
    { id: "n1", timeMs: 2500, beatIndex: 1, slotIndex: 5, pattern: "single", trajectoryPosition: { x: 1, y: 0, z: 1 } },
  ],
  camera: [
    { timeMs: 0, position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } },
    { timeMs: 2000, position: { x: 2, y: 5, z: 8 }, target: { x: 0, y: 0, z: 0 } },
    { timeMs: 4019, position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } },
  ],
  colors: {
    xAxisStops: [
      { x: 0, color: "#ff8800" },
      { x: 1, color: "#0088ff" },
    ],
  },
  sfx: {
    normal: {
      waveform: "triangle",
      envelope: { attackMs: 1, decayMs: 50, sustain: 0, releaseMs: 80 },
      bandpassLowHz: 300,
      bandpassHighHz: 4000,
    },
    powerUp: {
      waveform: "sawtooth",
      envelope: { attackMs: 1, decayMs: 60, sustain: 0.1, releaseMs: 100 },
      bandpassLowHz: 300,
      bandpassHighHz: 4000,
    },
  },
  diversityZones: [
    { startTimeMs: 1000, endTimeMs: 1200, role: "theme", label: "主題" },
  ],
  tapBudget: { fullPossible: 100, limit: 60 },
};
