// 曲プロファイルの実行時バリデータ。
// 解析済みのオブジェクト（JSONを JSON.parse したもの）を入力に取り、合格か、欠落・不正の一覧を返す。
// ファイル操作・プロセス・ブラウザの文書要素に依存しない純関数であり、Node.js（CIの#96ゲート）と
// ブラウザ（読込時）の双方から呼べる。例外を投げず全てのエラーを集める（#96が一括報告できるため）。
//
// 段階的検査（docs/research/08-quality-assurance.md §3、本Issueの確定）:
//   第1層（必須・厳密）= メタ・ロード元・調・解析の必須項目の存在と構造。
//   第2層（譜面派生・基本不変条件）= 譜面派生フィールドの存在と基本不変条件、および下流が前提とする構造対応。
//   協和性・被覆率・密度の数値整合の妥当性は#36・#46の責務であり、ここでは検査しない。

import {
  PITCH_SLOT_COUNT_MIN,
  PITCH_SLOT_COUNT_MAX,
  TAP_LIMIT_RATIO_MIN,
  TAP_LIMIT_RATIO_MAX,
} from "../../config/tuning";
import { SONGS } from "../../config/songs";
import type { SongProfile } from "./profileSchema";

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; profile: SongProfile }
  | { ok: false; errors: ValidationError[] };

// 連続被覆の許容誤差（ミリ秒）。理由を先に述べると、音楽地図の時刻は浮動小数点で末尾に微小な揺れが
// あり（実例 1371.6999999999998）、隣接区間の完全一致を課すと正しいデータを落とす。1ミリ秒は16分音符の
// 86ミリ秒・1拍の343ミリ秒よりはるかに小さく、実在する隙間を見逃さない。
const TIME_TOLERANCE_MS = 1;

// 末尾の許容超過（ミリ秒）。理由を先に述べると、コード区間は曲長をわずかに超えて記録されることがあり
// （TAKEOVERでは19ミリ秒）これを許容する必要がある一方、上限が無いと数秒以上の破損を見逃す。毎分175拍では
// 1小節（4拍）が約1372ミリ秒であり、末尾1単位の鳴り切りを確実に含み、数秒以上の明白な誤りを排除するため
// 2000ミリ秒とする。★暫定。
const END_OVERSHOOT_TOLERANCE_MS = 2000;

// X軸の停止点の端点の許容誤差。理由を先に述べると、x は0〜1の割合であり端点は0と1ちょうどを意図するが、
// 浮動小数点の微小な誤差を許す。割合に対する誤差のため1e-6とする。
const COLOR_X_TOLERANCE = 1e-6;

// 現行のスキーマ契約の版数。理由を先に述べると、互換性ゲートとして想定版数と異なるプロファイルを
// 拒否する必要があるため、現行版数を1つに固定する。契約に破壊的変更が入ったときにこの値を増やす。
const SCHEMA_VERSION = 1;

const MIDI_MIN = 0;
const MIDI_MAX = 127;

const WAVEFORMS = new Set(["sine", "square", "sawtooth", "triangle"]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const VIDEO_KEYS = ["beatId", "chordId", "repetitiveSegmentId", "lyricId", "lyricDiffId"] as const;

type Bag = Record<string, unknown>;
type Range = { start: number; end: number; path: string };

const isObject = (v: unknown): v is Bag =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function asObject(errors: ValidationError[], v: unknown, path: string): Bag | undefined {
  if (!isObject(v)) {
    errors.push({ path, message: "オブジェクトである必要がある" });
    return undefined;
  }
  return v;
}

function asArray(errors: ValidationError[], v: unknown, path: string): unknown[] | undefined {
  if (!Array.isArray(v)) {
    errors.push({ path, message: "配列である必要がある" });
    return undefined;
  }
  return v;
}

function asNonEmptyArray(errors: ValidationError[], v: unknown, path: string): unknown[] | undefined {
  const arr = asArray(errors, v, path);
  if (arr && arr.length === 0) {
    errors.push({ path, message: "空であってはならない" });
  }
  return arr;
}

function asNumber(errors: ValidationError[], v: unknown, path: string): number | undefined {
  if (!isFiniteNumber(v)) {
    errors.push({ path, message: "有限の数値である必要がある" });
    return undefined;
  }
  return v;
}

function asNonNegInt(errors: ValidationError[], v: unknown, path: string): number | undefined {
  if (!isFiniteNumber(v) || !Number.isInteger(v) || v < 0) {
    errors.push({ path, message: "非負の整数である必要がある" });
    return undefined;
  }
  return v;
}

function asString(errors: ValidationError[], v: unknown, path: string): string | undefined {
  if (typeof v !== "string") {
    errors.push({ path, message: "文字列である必要がある" });
    return undefined;
  }
  return v;
}

function asBoolean(errors: ValidationError[], v: unknown, path: string): boolean | undefined {
  if (typeof v !== "boolean") {
    errors.push({ path, message: "真偽値である必要がある" });
    return undefined;
  }
  return v;
}

function checkInRange(errors: ValidationError[], v: number | undefined, lo: number, hi: number, path: string): void {
  if (v !== undefined && (v < lo || v > hi)) {
    errors.push({ path, message: `${lo}〜${hi}の範囲である必要がある` });
  }
}

function checkVec3(errors: ValidationError[], v: unknown, path: string): void {
  const o = asObject(errors, v, path);
  if (!o) return;
  asNumber(errors, o["x"], `${path}.x`);
  asNumber(errors, o["y"], `${path}.y`);
  asNumber(errors, o["z"], `${path}.z`);
}

// 時刻昇順かつ区間が重ならないことを検査する。
function checkAscendingNonOverlap(errors: ValidationError[], ranges: Range[]): void {
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.end < r.start - TIME_TOLERANCE_MS) {
      errors.push({ path: r.path, message: "終了時刻が開始時刻より前になっている" });
    }
    if (i > 0) {
      const prev = ranges[i - 1];
      if (r.start < prev.start - TIME_TOLERANCE_MS) {
        errors.push({ path: r.path, message: "時刻が昇順になっていない" });
      } else if (r.start < prev.end - TIME_TOLERANCE_MS) {
        errors.push({ path: r.path, message: "前の区間と重なっている" });
      }
    }
  }
}

// 各区間が [0, durationMs] の内側にあることを検査する。
function checkWithinDuration(errors: ValidationError[], ranges: Range[], durationMs: number): void {
  for (const r of ranges) {
    if (r.start < -TIME_TOLERANCE_MS) {
      errors.push({ path: r.path, message: "開始時刻が負になっている" });
    }
    if (r.end > durationMs + TIME_TOLERANCE_MS) {
      errors.push({ path: r.path, message: "終了時刻が曲長を超えている" });
    }
  }
}

// 0ミリ秒から曲長まで切れ目なく被覆し、末尾が曲長以上・曲長＋許容超過以内であることを検査する。
function checkContiguousCoverage(errors: ValidationError[], ranges: Range[], path: string, durationMs: number): void {
  if (ranges.length === 0) return;
  if (Math.abs(ranges[0].start - 0) > TIME_TOLERANCE_MS) {
    errors.push({ path: ranges[0].path, message: "先頭が0ミリ秒から始まっていない" });
  }
  for (let i = 1; i < ranges.length; i++) {
    if (Math.abs(ranges[i].start - ranges[i - 1].end) > TIME_TOLERANCE_MS) {
      errors.push({ path: ranges[i].path, message: "前の区間との間に隙間がある" });
    }
  }
  const last = ranges[ranges.length - 1].end;
  if (last < durationMs - TIME_TOLERANCE_MS) {
    errors.push({ path, message: "末尾が曲長に届いていない" });
  } else if (last > durationMs + END_OVERSHOOT_TOLERANCE_MS) {
    errors.push({ path, message: "末尾が曲長＋許容超過を超えている" });
  }
}

export function validateProfile(value: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (!isObject(value)) {
    return { ok: false, errors: [{ path: "", message: "プロファイルはオブジェクトである必要がある" }] };
  }
  const p = value;

  const version = asNonNegInt(errors, p["schemaVersion"], "schemaVersion");
  if (version !== undefined && version !== SCHEMA_VERSION) {
    errors.push({ path: "schemaVersion", message: `スキーマ版数は${SCHEMA_VERSION}である必要がある` });
  }

  // --- song ---
  let durationMs: number | undefined;
  let songKey: string | undefined;
  const song = asObject(errors, p["song"], "song");
  if (song) {
    songKey = asString(errors, song["key"], "song.key");
    asString(errors, song["title"], "song.title");
    asString(errors, song["artist"], "song.artist");
    durationMs = asNumber(errors, song["durationMs"], "song.durationMs");
    if (durationMs !== undefined && durationMs <= 0) {
      errors.push({ path: "song.durationMs", message: "曲長は正である必要がある" });
      durationMs = undefined;
    }
  }

  // --- source（ロード設定 SONGS と照合） ---
  let sourceSongKey: string | undefined;
  const source = asObject(errors, p["source"], "source");
  if (source) {
    sourceSongKey = asString(errors, source["songKey"], "source.songKey");
    const songUrl = asString(errors, source["songUrl"], "source.songUrl");
    const video = asObject(errors, source["video"], "source.video");
    if (sourceSongKey !== undefined) {
      const registered = SONGS.find((s) => s.key === sourceSongKey);
      if (!registered) {
        errors.push({ path: "source.songKey", message: "ロード設定 SONGS に存在しないキー" });
      } else {
        if (songUrl !== undefined && songUrl !== registered.songUrl) {
          errors.push({ path: "source.songUrl", message: "SONGS の登録URLと一致しない" });
        }
        if (video) {
          for (const k of VIDEO_KEYS) {
            if (video[k] !== registered.video[k]) {
              errors.push({ path: `source.video.${k}`, message: "SONGS の登録値と一致しない" });
            }
          }
        }
      }
    }
  }

  if (songKey !== undefined && sourceSongKey !== undefined && songKey !== sourceSongKey) {
    errors.push({ path: "song.key", message: "song.key と source.songKey が一致していない" });
  }

  // --- tempoBpm ---
  const tempo = asNumber(errors, p["tempoBpm"], "tempoBpm");
  if (tempo !== undefined && tempo <= 0) {
    errors.push({ path: "tempoBpm", message: "テンポは正である必要がある" });
  }

  // --- musicalKey ---
  const musicalKey = asObject(errors, p["musicalKey"], "musicalKey");
  if (musicalKey) {
    const tpc = asNonNegInt(errors, musicalKey["tonicPitchClass"], "musicalKey.tonicPitchClass");
    checkInRange(errors, tpc, 0, 11, "musicalKey.tonicPitchClass");
    const mode = musicalKey["mode"];
    if (mode !== "major" && mode !== "minor") {
      errors.push({ path: "musicalKey.mode", message: "major か minor である必要がある" });
    }
  }

  // --- beats ---
  let beatsCount = 0;
  const beatsRaw = asNonEmptyArray(errors, p["beats"], "beats");
  if (beatsRaw) {
    beatsCount = beatsRaw.length;
    const ranges: Range[] = [];
    beatsRaw.forEach((b, i) => {
      const o = asObject(errors, b, `beats[${i}]`);
      if (!o) return;
      asNonNegInt(errors, o["index"], `beats[${i}].index`);
      asNumber(errors, o["position"], `beats[${i}].position`);
      const s = asNumber(errors, o["startTimeMs"], `beats[${i}].startTimeMs`);
      const e = asNumber(errors, o["endTimeMs"], `beats[${i}].endTimeMs`);
      asNumber(errors, o["lengthInBar"], `beats[${i}].lengthInBar`);
      const d = asNumber(errors, o["durationMs"], `beats[${i}].durationMs`);
      if (s !== undefined && e !== undefined && d !== undefined) {
        if (Math.abs(d - (e - s)) > TIME_TOLERANCE_MS) {
          errors.push({ path: `beats[${i}].durationMs`, message: "長さが時刻差と一致しない" });
        }
        ranges.push({ start: s, end: e, path: `beats[${i}]` });
      }
    });
    checkAscendingNonOverlap(errors, ranges);
  }

  // --- chords（後段の slots・ncRanges 対応検査のため名前と時刻を保持する） ---
  const chords: { name: string; start: number; end: number }[] = [];
  const chordsRaw = asNonEmptyArray(errors, p["chords"], "chords");
  if (chordsRaw) {
    const ranges: Range[] = [];
    chordsRaw.forEach((c, i) => {
      const o = asObject(errors, c, `chords[${i}]`);
      if (!o) return;
      asNonNegInt(errors, o["index"], `chords[${i}].index`);
      const name = asString(errors, o["name"], `chords[${i}].name`);
      const s = asNumber(errors, o["startTimeMs"], `chords[${i}].startTimeMs`);
      const e = asNumber(errors, o["endTimeMs"], `chords[${i}].endTimeMs`);
      const d = asNumber(errors, o["durationMs"], `chords[${i}].durationMs`);
      if (s !== undefined && e !== undefined && d !== undefined && Math.abs(d - (e - s)) > TIME_TOLERANCE_MS) {
        errors.push({ path: `chords[${i}].durationMs`, message: "長さが時刻差と一致しない" });
      }
      if (name !== undefined && s !== undefined && e !== undefined) {
        chords.push({ name, start: s, end: e });
        ranges.push({ start: s, end: e, path: `chords[${i}]` });
      }
    });
    checkAscendingNonOverlap(errors, ranges);
    if (durationMs !== undefined) checkContiguousCoverage(errors, ranges, "chords", durationMs);
  }

  // --- repetitiveSegments ---
  const segRaw = asNonEmptyArray(errors, p["repetitiveSegments"], "repetitiveSegments");
  if (segRaw) {
    const ranges: Range[] = [];
    segRaw.forEach((seg, i) => {
      const o = asObject(errors, seg, `repetitiveSegments[${i}]`);
      if (!o) return;
      asNonNegInt(errors, o["index"], `repetitiveSegments[${i}].index`);
      const s = asNumber(errors, o["startTimeMs"], `repetitiveSegments[${i}].startTimeMs`);
      const e = asNumber(errors, o["endTimeMs"], `repetitiveSegments[${i}].endTimeMs`);
      asNumber(errors, o["durationMs"], `repetitiveSegments[${i}].durationMs`);
      asBoolean(errors, o["isChorus"], `repetitiveSegments[${i}].isChorus`);
      if (s !== undefined && e !== undefined) ranges.push({ start: s, end: e, path: `repetitiveSegments[${i}]` });
    });
    checkAscendingNonOverlap(errors, ranges);
    if (durationMs !== undefined) checkWithinDuration(errors, ranges, durationMs);
  }

  // --- loudnessCurve ---
  const lc = asObject(errors, p["loudnessCurve"], "loudnessCurve");
  if (lc) {
    const step = asNumber(errors, lc["stepMs"], "loudnessCurve.stepMs");
    if (step !== undefined && step <= 0) errors.push({ path: "loudnessCurve.stepMs", message: "刻みは正である必要がある" });
    const maxA = asNumber(errors, lc["maxAmplitude"], "loudnessCurve.maxAmplitude");
    if (maxA !== undefined && maxA <= 0) errors.push({ path: "loudnessCurve.maxAmplitude", message: "最大値は正である必要がある" });
    const vals = asArray(errors, lc["values"], "loudnessCurve.values");
    if (vals) {
      vals.forEach((v, i) => {
        if (!isFiniteNumber(v)) errors.push({ path: `loudnessCurve.values[${i}]`, message: "有限の数値である必要がある" });
      });
      if (step !== undefined && step > 0 && durationMs !== undefined) {
        const expected = Math.ceil(durationMs / step);
        if (Math.abs(vals.length - expected) > 1) {
          errors.push({ path: "loudnessCurve.values", message: "要素数が曲長と刻みに合っていない" });
        }
      }
    }
  }

  // --- emotionCurve ---
  const ec = asObject(errors, p["emotionCurve"], "emotionCurve");
  if (ec) {
    const step = asNumber(errors, ec["stepMs"], "emotionCurve.stepMs");
    if (step !== undefined && step <= 0) errors.push({ path: "emotionCurve.stepMs", message: "刻みは正である必要がある" });
    const median = asObject(errors, ec["median"], "emotionCurve.median");
    if (median) {
      checkInRange(errors, asNumber(errors, median["valence"], "emotionCurve.median.valence"), 0, 1, "emotionCurve.median.valence");
      checkInRange(errors, asNumber(errors, median["arousal"], "emotionCurve.median.arousal"), 0, 1, "emotionCurve.median.arousal");
    }
    const pts = asNonEmptyArray(errors, ec["points"], "emotionCurve.points");
    if (pts) {
      let prevT: number | undefined;
      let lastT: number | undefined;
      pts.forEach((pt, i) => {
        const o = asObject(errors, pt, `emotionCurve.points[${i}]`);
        if (!o) return;
        const t = asNumber(errors, o["tMs"], `emotionCurve.points[${i}].tMs`);
        checkInRange(errors, asNumber(errors, o["valence"], `emotionCurve.points[${i}].valence`), 0, 1, `emotionCurve.points[${i}].valence`);
        checkInRange(errors, asNumber(errors, o["arousal"], `emotionCurve.points[${i}].arousal`), 0, 1, `emotionCurve.points[${i}].arousal`);
        if (t !== undefined) {
          if (prevT !== undefined && t < prevT - TIME_TOLERANCE_MS) {
            errors.push({ path: `emotionCurve.points[${i}].tMs`, message: "時刻が昇順になっていない" });
          }
          prevT = t;
          lastT = t;
        }
      });
      if (durationMs !== undefined && step !== undefined && step > 0 && lastT !== undefined) {
        if (lastT < durationMs - step - TIME_TOLERANCE_MS) {
          errors.push({ path: "emotionCurve.points", message: "曲全体を覆っていない（時刻の尺度がミリ秒か確認する）" });
        }
      }
    }
  }

  // --- lyricChars ---
  const lyricRaw = asNonEmptyArray(errors, p["lyricChars"], "lyricChars");
  if (lyricRaw) {
    const ranges: Range[] = [];
    lyricRaw.forEach((c, i) => {
      const o = asObject(errors, c, `lyricChars[${i}]`);
      if (!o) return;
      const s = asNumber(errors, o["startTimeMs"], `lyricChars[${i}].startTimeMs`);
      const e = asNumber(errors, o["endTimeMs"], `lyricChars[${i}].endTimeMs`);
      asString(errors, o["text"], `lyricChars[${i}].text`);
      if (s !== undefined && e !== undefined) ranges.push({ start: s, end: e, path: `lyricChars[${i}]` });
    });
    checkAscendingNonOverlap(errors, ranges);
    if (durationMs !== undefined) checkWithinDuration(errors, ranges, durationMs);
  }

  // --- lyricDensity ---
  const ld = asObject(errors, p["lyricDensity"], "lyricDensity");
  if (ld) {
    const win = asNumber(errors, ld["windowMs"], "lyricDensity.windowMs");
    if (win !== undefined && win <= 0) errors.push({ path: "lyricDensity.windowMs", message: "窓の長さは正である必要がある" });
    const windows = asNonEmptyArray(errors, ld["windows"], "lyricDensity.windows");
    if (windows) {
      const ranges: Range[] = [];
      windows.forEach((w, i) => {
        const o = asObject(errors, w, `lyricDensity.windows[${i}]`);
        if (!o) return;
        const s = asNumber(errors, o["startTimeMs"], `lyricDensity.windows[${i}].startTimeMs`);
        const e = asNumber(errors, o["endTimeMs"], `lyricDensity.windows[${i}].endTimeMs`);
        const cps = asNumber(errors, o["charsPerSecond"], `lyricDensity.windows[${i}].charsPerSecond`);
        if (cps !== undefined && cps < 0) errors.push({ path: `lyricDensity.windows[${i}].charsPerSecond`, message: "非負である必要がある" });
        if (s !== undefined && e !== undefined) ranges.push({ start: s, end: e, path: `lyricDensity.windows[${i}]` });
      });
      checkAscendingNonOverlap(errors, ranges);
      if (durationMs !== undefined) checkContiguousCoverage(errors, ranges, "lyricDensity.windows", durationMs);
    }
  }

  // --- ncRanges ---
  const ncRanges: { start: number; end: number; treatment: string; path: string }[] = [];
  const ncRaw = asArray(errors, p["ncRanges"], "ncRanges");
  if (ncRaw) {
    const ranges: Range[] = [];
    ncRaw.forEach((n, i) => {
      const o = asObject(errors, n, `ncRanges[${i}]`);
      if (!o) return;
      const s = asNumber(errors, o["startTimeMs"], `ncRanges[${i}].startTimeMs`);
      const e = asNumber(errors, o["endTimeMs"], `ncRanges[${i}].endTimeMs`);
      const t = o["treatment"];
      if (t !== "previous" && t !== "scale") {
        errors.push({ path: `ncRanges[${i}].treatment`, message: "previous か scale である必要がある" });
      }
      if (s !== undefined && e !== undefined && typeof t === "string") {
        ncRanges.push({ start: s, end: e, treatment: t, path: `ncRanges[${i}]` });
        ranges.push({ start: s, end: e, path: `ncRanges[${i}]` });
      }
    });
    checkAscendingNonOverlap(errors, ranges);
    if (durationMs !== undefined) checkWithinDuration(errors, ranges, durationMs);
  }

  // 無和音区間と和音の "N" 区間の対応（構造契約）。
  if (chords.length > 0 && ncRaw) {
    const nRegions = chords.filter((c) => c.name === "N");
    for (const nr of nRegions) {
      const matched = ncRanges.some((x) => Math.abs(x.start - nr.start) <= TIME_TOLERANCE_MS && Math.abs(x.end - nr.end) <= TIME_TOLERANCE_MS);
      if (!matched) {
        errors.push({ path: "ncRanges", message: `和音の無和音区間（${nr.start}〜${nr.end}ミリ秒）に対応する無和音区間が無い` });
      }
    }
    for (const x of ncRanges) {
      const matched = nRegions.some((nr) => Math.abs(x.start - nr.start) <= TIME_TOLERANCE_MS && Math.abs(x.end - nr.end) <= TIME_TOLERANCE_MS);
      if (!matched) {
        errors.push({ path: x.path, message: "対応する和音の無和音区間が無い" });
      }
      if (x.treatment === "previous") {
        const preceded = chords.some((c) => c.name !== "N" && Math.abs(c.end - x.start) <= TIME_TOLERANCE_MS);
        if (!preceded) {
          errors.push({ path: x.path, message: "直前に無和音でない和音区間が無いため previous を使えない" });
        }
      }
    }
  }

  // --- showcases ---
  const shRaw = asNonEmptyArray(errors, p["showcases"], "showcases");
  if (shRaw) {
    const ranges: Range[] = [];
    let climaxCount = 0;
    shRaw.forEach((s, i) => {
      const o = asObject(errors, s, `showcases[${i}]`);
      if (!o) return;
      asNonNegInt(errors, o["index"], `showcases[${i}].index`);
      const st = asNumber(errors, o["startTimeMs"], `showcases[${i}].startTimeMs`);
      const en = asNumber(errors, o["endTimeMs"], `showcases[${i}].endTimeMs`);
      checkInRange(errors, asNumber(errors, o["weight"], `showcases[${i}].weight`), 0, 1, `showcases[${i}].weight`);
      const cl = asBoolean(errors, o["isClimax"], `showcases[${i}].isClimax`);
      if (cl === true) climaxCount++;
      if (st !== undefined && en !== undefined) ranges.push({ start: st, end: en, path: `showcases[${i}]` });
    });
    checkAscendingNonOverlap(errors, ranges);
    if (durationMs !== undefined) checkWithinDuration(errors, ranges, durationMs);
    if (climaxCount !== 1) {
      errors.push({ path: "showcases", message: "最終見せ場（isClimax が真）はちょうど1つである必要がある" });
    }
  }

  // --- slots（chords と1対1で対応する） ---
  const slots: { start: number; end: number; chordName: string; pitchesLength: number | undefined; path: string }[] = [];
  let slotCount: number | undefined;
  const slotsRaw = asNonEmptyArray(errors, p["slots"], "slots");
  if (slotsRaw) {
    const ranges: Range[] = [];
    slotsRaw.forEach((s, i) => {
      const o = asObject(errors, s, `slots[${i}]`);
      if (!o) return;
      const st = asNumber(errors, o["startTimeMs"], `slots[${i}].startTimeMs`);
      const en = asNumber(errors, o["endTimeMs"], `slots[${i}].endTimeMs`);
      const cn = asString(errors, o["chordName"], `slots[${i}].chordName`);
      const pitches = asArray(errors, o["pitches"], `slots[${i}].pitches`);
      let plen: number | undefined;
      if (pitches) {
        plen = pitches.length;
        pitches.forEach((pp, j) => {
          if (!isFiniteNumber(pp) || !Number.isInteger(pp) || pp < MIDI_MIN || pp > MIDI_MAX) {
            errors.push({ path: `slots[${i}].pitches[${j}]`, message: "MIDIノート番号（0〜127の整数）である必要がある" });
          }
        });
      }
      if (st !== undefined && en !== undefined && cn !== undefined) {
        slots.push({ start: st, end: en, chordName: cn, pitchesLength: plen, path: `slots[${i}]` });
        ranges.push({ start: st, end: en, path: `slots[${i}]` });
      }
    });
    const lengths = slots.map((s) => s.pitchesLength).filter((l): l is number => l !== undefined);
    if (lengths.length > 0) {
      slotCount = lengths[0];
      if (lengths.some((l) => l !== slotCount)) {
        errors.push({ path: "slots", message: "全区間でスロット数が同一である必要がある" });
      }
      if (slotCount < PITCH_SLOT_COUNT_MIN || slotCount > PITCH_SLOT_COUNT_MAX) {
        errors.push({ path: "slots", message: `スロット数は${PITCH_SLOT_COUNT_MIN}〜${PITCH_SLOT_COUNT_MAX}である必要がある` });
      }
    }
    checkAscendingNonOverlap(errors, ranges);
    if (durationMs !== undefined) checkContiguousCoverage(errors, ranges, "slots", durationMs);

    if (chords.length > 0) {
      if (slots.length !== chords.length) {
        errors.push({ path: "slots", message: "和音区間と区間数が一致しない（1対1で対応する必要がある）" });
      } else {
        for (let i = 0; i < slots.length; i++) {
          if (Math.abs(slots[i].start - chords[i].start) > TIME_TOLERANCE_MS || Math.abs(slots[i].end - chords[i].end) > TIME_TOLERANCE_MS) {
            errors.push({ path: slots[i].path, message: "和音区間と境界が一致しない" });
          }
          if (chords[i].name === "N") {
            // 無和音区間のスロットは解決後の和音名または調の音階を表し、無和音記号のままであってはならない。
            if (slots[i].chordName === "N") {
              errors.push({ path: `${slots[i].path}.chordName`, message: "無和音区間では解決後の和音名または調の音階を表し、無和音記号のままであってはならない" });
            }
          } else if (slots[i].chordName !== chords[i].name) {
            errors.push({ path: `${slots[i].path}.chordName`, message: "無和音でない区間で和音名が和音区間と一致しない" });
          }
        }
      }
    }
  }

  // --- notes ---
  const notesRaw = asArray(errors, p["notes"], "notes");
  if (notesRaw) {
    const ids = new Set<string>();
    notesRaw.forEach((n, i) => {
      const o = asObject(errors, n, `notes[${i}]`);
      if (!o) return;
      const id = asString(errors, o["id"], `notes[${i}].id`);
      if (id !== undefined) {
        if (ids.has(id)) errors.push({ path: `notes[${i}].id`, message: "識別子が重複している" });
        ids.add(id);
      }
      const t = asNumber(errors, o["timeMs"], `notes[${i}].timeMs`);
      if (t !== undefined && durationMs !== undefined && (t < 0 || t > durationMs)) {
        errors.push({ path: `notes[${i}].timeMs`, message: "時刻が曲の範囲を外れている" });
      }
      const bi = asNonNegInt(errors, o["beatIndex"], `notes[${i}].beatIndex`);
      if (bi !== undefined && bi >= beatsCount) {
        errors.push({ path: `notes[${i}].beatIndex`, message: "拍格子の有効な索引でない" });
      }
      const si = asNonNegInt(errors, o["slotIndex"], `notes[${i}].slotIndex`);
      if (si !== undefined) {
        if (si < 1) {
          errors.push({ path: `notes[${i}].slotIndex`, message: "1以上である必要がある" });
        } else if (slotCount !== undefined && si > slotCount) {
          errors.push({ path: `notes[${i}].slotIndex`, message: "スロット数を超えている" });
        }
      }
      asString(errors, o["pattern"], `notes[${i}].pattern`);
      checkVec3(errors, o["trajectoryPosition"], `notes[${i}].trajectoryPosition`);
    });
  }

  // --- camera ---
  const camRaw = asNonEmptyArray(errors, p["camera"], "camera");
  if (camRaw) {
    const times: number[] = [];
    let prevT: number | undefined;
    camRaw.forEach((c, i) => {
      const o = asObject(errors, c, `camera[${i}]`);
      if (!o) return;
      const t = asNumber(errors, o["timeMs"], `camera[${i}].timeMs`);
      checkVec3(errors, o["position"], `camera[${i}].position`);
      checkVec3(errors, o["target"], `camera[${i}].target`);
      if (t !== undefined) {
        if (prevT !== undefined && t < prevT - TIME_TOLERANCE_MS) {
          errors.push({ path: `camera[${i}].timeMs`, message: "時刻が昇順になっていない" });
        }
        prevT = t;
        times.push(t);
      }
    });
    if (durationMs !== undefined && times.length > 0) {
      if (Math.abs(times[0] - 0) > TIME_TOLERANCE_MS) {
        errors.push({ path: "camera", message: "先頭が0ミリ秒から始まっていない" });
      }
      const last = times[times.length - 1];
      if (last < durationMs - TIME_TOLERANCE_MS) {
        errors.push({ path: "camera", message: "末尾が曲長に届いていない" });
      } else if (last > durationMs + END_OVERSHOOT_TOLERANCE_MS) {
        errors.push({ path: "camera", message: "末尾が曲長＋許容超過を超えている" });
      }
    }
  }

  // --- colors ---
  const colors = asObject(errors, p["colors"], "colors");
  if (colors) {
    const stops = asNonEmptyArray(errors, colors["xAxisStops"], "colors.xAxisStops");
    if (stops) {
      const xs: number[] = [];
      stops.forEach((s, i) => {
        const o = asObject(errors, s, `colors.xAxisStops[${i}]`);
        if (!o) return;
        const x = asNumber(errors, o["x"], `colors.xAxisStops[${i}].x`);
        const col = o["color"];
        if (typeof col !== "string" || !HEX_COLOR.test(col)) {
          errors.push({ path: `colors.xAxisStops[${i}].color`, message: "#RRGGBB 形式である必要がある" });
        }
        if (x !== undefined) xs.push(x);
      });
      if (xs.length > 0) {
        if (Math.abs(xs[0] - 0) > COLOR_X_TOLERANCE) {
          errors.push({ path: "colors.xAxisStops", message: "先頭の停止点が x=0 でない" });
        }
        if (Math.abs(xs[xs.length - 1] - 1) > COLOR_X_TOLERANCE) {
          errors.push({ path: "colors.xAxisStops", message: "末尾の停止点が x=1 でない" });
        }
        for (let i = 1; i < xs.length; i++) {
          if (xs[i] < xs[i - 1] - COLOR_X_TOLERANCE) {
            errors.push({ path: `colors.xAxisStops[${i}].x`, message: "x が昇順になっていない" });
          }
        }
      }
    }
  }

  // --- sfx ---
  const sfx = asObject(errors, p["sfx"], "sfx");
  if (sfx) {
    for (const key of ["normal", "powerUp"] as const) {
      const tb = asObject(errors, sfx[key], `sfx.${key}`);
      if (!tb) continue;
      const wf = tb["waveform"];
      if (typeof wf !== "string" || !WAVEFORMS.has(wf)) {
        errors.push({ path: `sfx.${key}.waveform`, message: "sine・square・sawtooth・triangle のいずれかである必要がある" });
      }
      const env = asObject(errors, tb["envelope"], `sfx.${key}.envelope`);
      if (env) {
        for (const t of ["attackMs", "decayMs", "releaseMs"] as const) {
          const v = asNumber(errors, env[t], `sfx.${key}.envelope.${t}`);
          if (v !== undefined && v < 0) errors.push({ path: `sfx.${key}.envelope.${t}`, message: "非負である必要がある" });
        }
        checkInRange(errors, asNumber(errors, env["sustain"], `sfx.${key}.envelope.sustain`), 0, 1, `sfx.${key}.envelope.sustain`);
      }
      const low = asNumber(errors, tb["bandpassLowHz"], `sfx.${key}.bandpassLowHz`);
      const high = asNumber(errors, tb["bandpassHighHz"], `sfx.${key}.bandpassHighHz`);
      if (low !== undefined && low <= 0) errors.push({ path: `sfx.${key}.bandpassLowHz`, message: "正である必要がある" });
      if (high !== undefined && high <= 0) errors.push({ path: `sfx.${key}.bandpassHighHz`, message: "正である必要がある" });
      if (low !== undefined && high !== undefined && low >= high) {
        errors.push({ path: `sfx.${key}.bandpassHighHz`, message: "下限より大きい必要がある" });
      }
    }
  }

  // --- diversityZones ---
  const dzRaw = asArray(errors, p["diversityZones"], "diversityZones");
  if (dzRaw) {
    const ranges: Range[] = [];
    dzRaw.forEach((d, i) => {
      const o = asObject(errors, d, `diversityZones[${i}]`);
      if (!o) return;
      const s = asNumber(errors, o["startTimeMs"], `diversityZones[${i}].startTimeMs`);
      const e = asNumber(errors, o["endTimeMs"], `diversityZones[${i}].endTimeMs`);
      const role = o["role"];
      if (role !== "theme" && role !== "variation" && role !== "reprise") {
        errors.push({ path: `diversityZones[${i}].role`, message: "theme・variation・reprise のいずれかである必要がある" });
      }
      asString(errors, o["label"], `diversityZones[${i}].label`);
      if (s !== undefined && e !== undefined) ranges.push({ start: s, end: e, path: `diversityZones[${i}]` });
    });
    checkAscendingNonOverlap(errors, ranges);
    if (durationMs !== undefined) checkWithinDuration(errors, ranges, durationMs);
  }

  // --- tapBudget ---
  const tb = asObject(errors, p["tapBudget"], "tapBudget");
  if (tb) {
    const full = asNonNegInt(errors, tb["fullPossible"], "tapBudget.fullPossible");
    if (full !== undefined && full <= 0) errors.push({ path: "tapBudget.fullPossible", message: "正である必要がある" });
    const lim = asNonNegInt(errors, tb["limit"], "tapBudget.limit");
    if (lim !== undefined && lim <= 0) errors.push({ path: "tapBudget.limit", message: "正である必要がある" });
    if (full !== undefined && full > 0 && lim !== undefined) {
      const ratio = lim / full;
      if (ratio < TAP_LIMIT_RATIO_MIN || ratio > TAP_LIMIT_RATIO_MAX) {
        errors.push({ path: "tapBudget", message: `タップ上限比率は${TAP_LIMIT_RATIO_MIN}〜${TAP_LIMIT_RATIO_MAX}である必要がある` });
      }
    }
  }

  // --- typographyChart（任意項目。存在するときのみ検査する。Issue #33） ---
  // 演出識別名が「既知の EFFECT_ID か」「実行時に登録済みか」の検査はここで行わない。理由を先に述べる。
  // これらの判定は演出割付規則（src/typography/kineticText）の知識を要し、profiles から typography を
  // 取り込むと依存の向きが逆転するためである。これらは駆動部の解決時とスモーク検証で確かめる。
  // 想定表示寸法が最小表示寸法以上かの判定もここでは行わない。最小表示寸法は可読性処理（typography）が持つ
  // 値であり、駆動部の配置時に確かめる。ここでは構造・型・値域（正であること、割合が範囲内であること）に限る。
  if (p["typographyChart"] !== undefined) {
    const tc = asObject(errors, p["typographyChart"], "typographyChart");
    if (tc) {
      const overrides = asArray(errors, tc["effectOverrides"], "typographyChart.effectOverrides");
      if (overrides) {
        overrides.forEach((ov, i) => {
          const base = `typographyChart.effectOverrides[${i}]`;
          const o = asObject(errors, ov, base);
          if (!o) return;
          asNonNegInt(errors, o["phraseIndex"], `${base}.phraseIndex`);
          const decision = o["decision"];
          const decisionOk =
            decision === "adoptDefault" || decision === "disableDefault" || decision === "addSongSpecific";
          if (!decisionOk) {
            errors.push({ path: `${base}.decision`, message: "adoptDefault・disableDefault・addSongSpecific のいずれかである必要がある" });
          }
          // 演出識別名は disableDefault・addSongSpecific のとき必須。adoptDefault のときは省略可。
          if (decision === "disableDefault" || decision === "addSongSpecific") {
            const eid = asString(errors, o["effectId"], `${base}.effectId`);
            if (eid !== undefined && eid.length === 0) {
              errors.push({ path: `${base}.effectId`, message: "空であってはならない" });
            }
          } else if (o["effectId"] !== undefined) {
            asString(errors, o["effectId"], `${base}.effectId`);
          }
          if (o["range"] !== undefined) {
            const r = asObject(errors, o["range"], `${base}.range`);
            if (r) {
              const sw = asNonNegInt(errors, r["startWordIndex"], `${base}.range.startWordIndex`);
              const sc = asNonNegInt(errors, r["startCharIndex"], `${base}.range.startCharIndex`);
              const ew = asNonNegInt(errors, r["endWordIndex"], `${base}.range.endWordIndex`);
              const ec = asNonNegInt(errors, r["endCharIndex"], `${base}.range.endCharIndex`);
              if (sw !== undefined && sc !== undefined && ew !== undefined && ec !== undefined) {
                if (ew < sw || (ew === sw && ec < sc)) {
                  errors.push({ path: `${base}.range`, message: "終了位置が開始位置より前になっている" });
                }
              }
            }
          }
          if (o["startCondition"] !== undefined) {
            const scObj = asObject(errors, o["startCondition"], `${base}.startCondition`);
            if (scObj && scObj["beatCadence"] !== undefined && scObj["beatCadence"] !== null) {
              const bc = asNumber(errors, scObj["beatCadence"], `${base}.startCondition.beatCadence`);
              if (bc !== undefined && (!Number.isInteger(bc) || bc <= 0)) {
                errors.push({ path: `${base}.startCondition.beatCadence`, message: "正の整数である必要がある" });
              }
            }
          }
          if (o["finalPriority"] !== undefined) {
            asNumber(errors, o["finalPriority"], `${base}.finalPriority`);
          }
        });
      }

      const placements = asArray(errors, tc["readingPlacements"], "typographyChart.readingPlacements");
      if (placements) {
        const seenPhrase = new Set<number>();
        placements.forEach((pl, i) => {
          const base = `typographyChart.readingPlacements[${i}]`;
          const o = asObject(errors, pl, base);
          if (!o) return;
          const pi = asNonNegInt(errors, o["phraseIndex"], `${base}.phraseIndex`);
          if (pi !== undefined) {
            if (seenPhrase.has(pi)) {
              errors.push({ path: `${base}.phraseIndex`, message: "フレーズ番号が重複している（読ませる役の配置は1フレーズに1つ）" });
            }
            seenPhrase.add(pi);
          }
          const unit = o["unit"];
          if (unit !== "phrase" && unit !== "word" && unit !== "chunk") {
            errors.push({ path: `${base}.unit`, message: "phrase・word・chunk のいずれかである必要がある" });
          }
          const tph = asNumber(errors, o["targetPixelHeight"], `${base}.targetPixelHeight`);
          if (tph !== undefined && tph <= 0) {
            errors.push({ path: `${base}.targetPixelHeight`, message: "正である必要がある" });
          }
          const region = asObject(errors, o["region"], `${base}.region`);
          if (region) {
            checkInRange(errors, asNumber(errors, region["centerXRatio"], `${base}.region.centerXRatio`), 0, 1, `${base}.region.centerXRatio`);
            checkInRange(errors, asNumber(errors, region["centerYRatio"], `${base}.region.centerYRatio`), 0, 1, `${base}.region.centerYRatio`);
            const w = asNumber(errors, region["widthRatio"], `${base}.region.widthRatio`);
            if (w !== undefined && (w <= 0 || w > 1)) {
              errors.push({ path: `${base}.region.widthRatio`, message: "0より大きく1以下である必要がある" });
            }
            const h = asNumber(errors, region["heightRatio"], `${base}.region.heightRatio`);
            if (h !== undefined && (h <= 0 || h > 1)) {
              errors.push({ path: `${base}.region.heightRatio`, message: "0より大きく1以下である必要がある" });
            }
          }
        });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, profile: value as unknown as SongProfile };
}
