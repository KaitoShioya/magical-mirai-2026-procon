// 品質検査ハーネスのクラウド側に登録する、曲プロファイルのJSONスキーマ検査（Issue #96 第1層）。
// 解析先行スキーマ検証ゲート（docs/research/08-quality-assurance.md §3）の「必須項目を全て備える」を、
// GPUも型処理系も無いクラウド経路（純Node・ajv）で検査する。コミット済み成果物
// src/profiles/takeover/takeover.profile.json を対象に、必須項目の存在・型・列挙・数値域・文字列パターン・
// 非空配列を確かめる。
//
// スキーマの値域・整数性・列挙は src/profiles/schema/validateProfile.ts の単一フィールド検査と同一にする。
// 採用理由を先に述べる。validateProfile が同じ単一フィールド制約を課しており、それと一致させれば構造検査が
// 解析データの値域不正を取りこぼさず、かつコミット済み成果物は既にその検査を通っているため過剰制約による
// 誤判定が起きないからである。
//
// フィールド間の関係（連続被覆・時刻昇順非重複・slots↔chords1対1対応・source登録値照合・ncRangesと和音N区間の
// 対応・isClimaxちょうど1つ・スロット数5〜9と全区間同数・tapBudget比率）はJSON Schemaで表現できないため、ここでは
// 表現しない。これらは第2層の validateProfile（src/profiles/takeover/takeoverProfile.gate.test.ts が実行）が担う。
import { fileURLToPath } from "node:url";
import { registerSchema, listRegisteredChecks } from "./schema-check.mjs";

// 3次元座標。trajectoryPosition・camera.position・camera.target で共有する。
const vec3 = {
  type: "object",
  required: ["x", "y", "z"],
  properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
};

const nonNegInt = { type: "integer", minimum: 0 };
const positiveNumber = { type: "number", exclusiveMinimum: 0 };
const unitRange = { type: "number", minimum: 0, maximum: 1 };

// 曲プロファイルのJSONスキーマ（ajv の既定設定 new Ajv({ allErrors: true }) で解釈可能な標準語彙のみ）。
export const SONG_PROFILE_SCHEMA = {
  type: "object",
  required: [
    "schemaVersion",
    "song",
    "source",
    "tempoBpm",
    "musicalKey",
    "beats",
    "chords",
    "repetitiveSegments",
    "loudnessCurve",
    "emotionCurve",
    "lyricChars",
    "lyricDensity",
    "ncRanges",
    "showcases",
    "slots",
    "notes",
    "camera",
    "colors",
    "sfx",
    "diversityZones",
    "tapBudget",
  ],
  properties: {
    // 互換性ゲートとして想定版数を固定する（validateProfile.ts 44〜46・190〜193行）。
    schemaVersion: { const: 1 },

    song: {
      type: "object",
      required: ["key", "title", "artist", "durationMs"],
      properties: {
        key: { type: "string" },
        title: { type: "string" },
        artist: { type: "string" },
        durationMs: positiveNumber,
      },
    },

    // SONGS 登録値との一致照合は第2層。ここでは存在と型だけを見る。
    source: {
      type: "object",
      required: ["songKey", "songUrl", "video"],
      properties: {
        songKey: { type: "string" },
        songUrl: { type: "string" },
        video: {
          type: "object",
          required: ["beatId", "chordId", "repetitiveSegmentId", "lyricId", "lyricDiffId"],
          properties: {
            beatId: { type: "number" },
            chordId: { type: "number" },
            repetitiveSegmentId: { type: "number" },
            lyricId: { type: "number" },
            lyricDiffId: { type: "number" },
          },
        },
      },
    },

    tempoBpm: positiveNumber,

    musicalKey: {
      type: "object",
      required: ["tonicPitchClass", "mode"],
      properties: {
        tonicPitchClass: { type: "integer", minimum: 0, maximum: 11 },
        mode: { enum: ["major", "minor"] },
      },
    },

    beats: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["index", "position", "startTimeMs", "endTimeMs", "lengthInBar", "durationMs"],
        properties: {
          index: nonNegInt,
          position: { type: "number" },
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          lengthInBar: { type: "number" },
          durationMs: { type: "number" },
        },
      },
    },

    chords: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["index", "name", "startTimeMs", "endTimeMs", "durationMs"],
        properties: {
          index: nonNegInt,
          name: { type: "string" },
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          durationMs: { type: "number" },
        },
      },
    },

    repetitiveSegments: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["index", "startTimeMs", "endTimeMs", "durationMs", "isChorus"],
        properties: {
          index: nonNegInt,
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          durationMs: { type: "number" },
          isChorus: { type: "boolean" },
        },
      },
    },

    loudnessCurve: {
      type: "object",
      required: ["stepMs", "maxAmplitude", "values"],
      properties: {
        stepMs: positiveNumber,
        maxAmplitude: positiveNumber,
        // 空の声量曲線は声量解析の欠落を意味するため非空とする（解析先行ゲートが拒むべき状態）。
        values: { type: "array", minItems: 1, items: { type: "number" } },
      },
    },

    emotionCurve: {
      type: "object",
      required: ["stepMs", "points", "median"],
      properties: {
        stepMs: positiveNumber,
        median: {
          type: "object",
          required: ["valence", "arousal"],
          properties: { valence: unitRange, arousal: unitRange },
        },
        points: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["tMs", "valence", "arousal"],
            properties: { tMs: { type: "number" }, valence: unitRange, arousal: unitRange },
          },
        },
      },
    },

    lyricChars: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["startTimeMs", "endTimeMs", "text"],
        properties: {
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          text: { type: "string" },
        },
      },
    },

    lyricDensity: {
      type: "object",
      required: ["windowMs", "windows"],
      properties: {
        windowMs: positiveNumber,
        windows: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["startTimeMs", "endTimeMs", "charsPerSecond"],
            properties: {
              startTimeMs: { type: "number" },
              endTimeMs: { type: "number" },
              charsPerSecond: { type: "number", minimum: 0 },
            },
          },
        },
      },
    },

    // 無和音区間は空が正当な場合があるため非空を課さない（validateProfile.ts 422行は asArray）。
    // 和音のN区間との1対1対応・previous の直前条件は第2層。
    ncRanges: {
      type: "array",
      items: {
        type: "object",
        required: ["startTimeMs", "endTimeMs", "treatment"],
        properties: {
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          treatment: { enum: ["previous", "scale"] },
        },
      },
    },

    // isClimax がちょうど1つかは集計判定のため第2層。
    showcases: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["index", "startTimeMs", "endTimeMs", "weight", "isClimax"],
        properties: {
          index: nonNegInt,
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          weight: unitRange,
          isClimax: { type: "boolean" },
        },
      },
    },

    // スロット数5〜9・全区間同数・和音との1対1対応・無和音名でないことは第2層。
    slots: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["startTimeMs", "endTimeMs", "chordName", "pitches"],
        properties: {
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          chordName: { type: "string" },
          // 空のスロットはY軸音程の欠落を意味するため非空とする。MIDIノート番号は0〜127の整数。
          pitches: { type: "array", minItems: 1, items: { type: "integer", minimum: 0, maximum: 127 } },
        },
      },
    },

    // ノーツは譜面派生であり空が正当な場合があるため非空を課さない（validateProfile.ts 551行は asArray）。
    // beatIndex が拍数未満・slotIndex がスロット数以下かは第2層。
    notes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "timeMs", "beatIndex", "slotIndex", "pattern", "trajectoryPosition"],
        properties: {
          id: { type: "string" },
          timeMs: { type: "number" },
          beatIndex: nonNegInt,
          slotIndex: { type: "integer", minimum: 1 },
          pattern: { type: "string" },
          trajectoryPosition: vec3,
        },
      },
    },

    camera: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["timeMs", "position", "target"],
        properties: { timeMs: { type: "number" }, position: vec3, target: vec3 },
      },
    },

    colors: {
      type: "object",
      required: ["xAxisStops"],
      properties: {
        xAxisStops: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["x", "color"],
            properties: { x: { type: "number" }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } },
          },
        },
      },
    },

    sfx: {
      type: "object",
      required: ["normal", "powerUp"],
      properties: { normal: sfxTimbreSchema(), powerUp: sfxTimbreSchema() },
    },

    // 多様性逓減区間は空が正当な場合があるため非空を課さない（validateProfile.ts 676行は asArray）。
    diversityZones: {
      type: "array",
      items: {
        type: "object",
        required: ["startTimeMs", "endTimeMs", "role", "label"],
        properties: {
          startTimeMs: { type: "number" },
          endTimeMs: { type: "number" },
          role: { enum: ["theme", "variation", "reprise"] },
          label: { type: "string" },
        },
      },
    },

    // 比率0.4〜0.8は第2層。
    tapBudget: {
      type: "object",
      required: ["fullPossible", "limit"],
      properties: {
        fullPossible: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1 },
      },
    },

    // 任意項目。この曲のコミット済みJSONは持たず、保持する場合の内部構造は validateProfile が担うため型のみ。
    typographyChart: { type: "object" },
  },
};

// 操作音の音色スキーマ。normal と powerUp で同形のため関数で生成する。
// 下限が上限未満かは第2層（フィールド間の関係のため）。
function sfxTimbreSchema() {
  return {
    type: "object",
    required: ["waveform", "envelope", "bandpassLowHz", "bandpassHighHz"],
    properties: {
      waveform: { enum: ["sine", "square", "sawtooth", "triangle"] },
      envelope: {
        type: "object",
        required: ["attackMs", "decayMs", "sustain", "releaseMs"],
        properties: {
          attackMs: { type: "number", minimum: 0 },
          decayMs: { type: "number", minimum: 0 },
          sustain: unitRange,
          releaseMs: { type: "number", minimum: 0 },
        },
      },
      bandpassLowHz: positiveNumber,
      bandpassHighHz: positiveNumber,
    },
  };
}

// 検査対象のコミット済み成果物への絶対パス。
// 採用理由を先に述べる。schema-check.mjs の runOneCheck は file をそのまま readFile するため（同ファイル86行）、
// 作業ディレクトリに依存しない絶対パスにして、起動位置の違いで取りこぼさないようにする。
export const TAKEOVER_PROFILE_PATH = fileURLToPath(
  new URL("../../src/profiles/takeover/takeover.profile.json", import.meta.url)
);

// 曲プロファイルの検査キー。横展開（M8）で各曲が自分の検査を登録できるよう曲キーを含める。
export const TAKEOVER_PROFILE_CHECK_KEY = "song-profile-takeover";

// 「こたえて」のコミット済み成果物への絶対パスと検査キー（横展開）。スキーマ本体 SONG_PROFILE_SCHEMA は曲非依存で
// 全曲が共有する。
export const KOTAETE_PROFILE_PATH = fileURLToPath(
  new URL("../../src/profiles/kotaete/kotaete.profile.json", import.meta.url)
);
export const KOTAETE_PROFILE_CHECK_KEY = "song-profile-kotaete";

// 曲プロファイルの検査を登録簿へ登録する（冪等）。
// 採用理由を先に述べる。registerSchema は無条件に登録簿へ追加するため（schema-check.mjs 22〜24行）、複数回呼ぶと
// 重複する。同一プロセス内での重複登録を避けるため、各曲キーの存在で前置きする。
export function registerProfileSchemas() {
  const entries = [
    { key: TAKEOVER_PROFILE_CHECK_KEY, file: TAKEOVER_PROFILE_PATH },
    { key: KOTAETE_PROFILE_CHECK_KEY, file: KOTAETE_PROFILE_PATH },
  ];
  const registered = new Set(listRegisteredChecks().map((c) => c.key));
  for (const entry of entries) {
    if (registered.has(entry.key)) {
      continue;
    }
    registerSchema(entry.key, {
      file: entry.file,
      schema: SONG_PROFILE_SCHEMA,
    });
  }
}
