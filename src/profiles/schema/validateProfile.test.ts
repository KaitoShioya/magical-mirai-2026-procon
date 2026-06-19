import { describe, it, expect } from "vitest";
import { validateProfile } from "./validateProfile";
import { minimalValidProfile } from "./fixtures/minimalValidProfile";
import type { SongProfile } from "./profileSchema";

// クローンして壊すための補助。実例は変更しない。
function clone(): SongProfile {
  return structuredClone(minimalValidProfile);
}

function expectInvalid(profile: unknown): void {
  const result = validateProfile(profile);
  expect(result.ok).toBe(false);
}

describe("validateProfile 合格", () => {
  it("正しい最小プロファイルは合格する", () => {
    const result = validateProfile(minimalValidProfile);
    expect(result.ok).toBe(true);
  });

  it("オブジェクトでない入力は不合格になる", () => {
    expectInvalid(null);
    expectInvalid(42);
    expectInvalid("文字列");
    expectInvalid([]);
  });
});

describe("validateProfile 必須項目の欠落", () => {
  const requiredKeys = [
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
  ];

  for (const key of requiredKeys) {
    it(`必須項目 ${key} を欠くと、欠落箇所を示して不合格になる`, () => {
      const p = clone() as unknown as Record<string, unknown>;
      delete p[key];
      const result = validateProfile(p);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.path.includes(key))).toBe(true);
      }
    });
  }
});

describe("validateProfile 値と構造の不正", () => {
  it("数値が非数なら不合格", () => {
    const p = clone();
    p.song.durationMs = Number.NaN;
    expectInvalid(p);
  });

  it("数値が無限大なら不合格", () => {
    const p = clone();
    p.notes[0].timeMs = Number.POSITIVE_INFINITY;
    expectInvalid(p);
  });

  it("索引が非整数なら不合格", () => {
    const p = clone();
    p.beats[0].index = 0.5;
    expectInvalid(p);
  });

  it("song.key と source.songKey が不一致なら不合格", () => {
    const p = clone();
    p.song.key = "kotaete";
    expectInvalid(p);
  });

  it("source がロード設定 SONGS と不一致なら不合格", () => {
    const p = clone();
    p.source.songUrl = "https://piapro.jp/t/XXXX/1";
    expectInvalid(p);
  });

  it("拍の長さが時刻差と一致しないなら不合格", () => {
    const p = clone();
    p.beats[0].durationMs = 999;
    expectInvalid(p);
  });

  it("コード進行が降順なら不合格", () => {
    const p = clone();
    p.chords = [p.chords[2], p.chords[1], p.chords[0]];
    expectInvalid(p);
  });

  it("コード進行の末尾が曲長未満なら不合格", () => {
    const p = clone();
    p.chords[2].endTimeMs = 3000;
    p.chords[2].durationMs = 500;
    p.slots[2].endTimeMs = 3000;
    expectInvalid(p);
  });

  it("コード進行の末尾が曲長＋許容超過を超えるなら不合格", () => {
    const p = clone();
    p.chords[2].endTimeMs = 7000;
    p.chords[2].durationMs = 4500;
    p.slots[2].endTimeMs = 7000;
    expectInvalid(p);
  });

  it("無和音区間の埋め方が既定の2種以外なら不合格", () => {
    const p = clone();
    (p.ncRanges[0] as { treatment: string }).treatment = "bogus";
    expectInvalid(p);
  });

  it("先頭の無和音区間が直前和音保持なら不合格", () => {
    const p = clone();
    p.ncRanges[0].treatment = "previous";
    expectInvalid(p);
  });

  it("無和音区間が和音の無和音区間に対応しないなら不合格", () => {
    const p = clone();
    // 和音 "Fm" の区間（1000〜2500）を無和音区間として記すのは不正。
    p.ncRanges.push({ startTimeMs: 1000, endTimeMs: 2500, treatment: "scale" });
    expectInvalid(p);
  });

  it("スロットが和音区間と1対1で対応しないなら不合格", () => {
    const p = clone();
    p.slots.pop();
    expectInvalid(p);
  });

  it("無和音でない区間でスロットの和音名が和音と一致しないなら不合格", () => {
    const p = clone();
    p.slots[1].chordName = "Cmaj";
    expectInvalid(p);
  });

  it("スロットの音高数が範囲外なら不合格", () => {
    const p = clone();
    p.slots[0].pitches = [1, 2, 3, 4];
    expectInvalid(p);
  });

  it("ノーツの音程スロット索引が範囲外なら不合格", () => {
    const p = clone();
    p.notes[0].slotIndex = 0;
    expectInvalid(p);
  });

  it("ノーツの拍索引が範囲外なら不合格", () => {
    const p = clone();
    p.notes[0].beatIndex = 99;
    expectInvalid(p);
  });

  it("ノーツの識別子が重複するなら不合格", () => {
    const p = clone();
    p.notes[1].id = "n0";
    expectInvalid(p);
  });

  it("見せ場の最終地点が無いなら不合格", () => {
    const p = clone();
    for (const s of p.showcases) s.isClimax = false;
    expectInvalid(p);
  });

  it("見せ場の最終地点が2つ以上なら不合格", () => {
    const p = clone();
    p.showcases[0].isClimax = true;
    expectInvalid(p);
  });

  it("色の停止点が端点0と1を覆わないなら不合格", () => {
    const p = clone();
    p.colors.xAxisStops[0].x = 0.1;
    expectInvalid(p);
  });

  it("色の形式が不正なら不合格", () => {
    const p = clone();
    p.colors.xAxisStops[0].color = "#ggg";
    expectInvalid(p);
  });

  it("操作音の波形が基本4種以外なら不合格", () => {
    const p = clone();
    (p.sfx.normal as { waveform: string }).waveform = "noise";
    expectInvalid(p);
  });

  it("操作音の保持量が範囲外なら不合格", () => {
    const p = clone();
    p.sfx.normal.envelope.sustain = 1.5;
    expectInvalid(p);
  });

  it("タップ上限比率が範囲外なら不合格", () => {
    const p = clone();
    p.tapBudget.limit = 90;
    expectInvalid(p);
  });

  it("感情曲線の時刻がミリ秒尺度でなく曲全体を覆わないなら不合格", () => {
    const p = clone();
    p.emotionCurve.points = [
      { tMs: 0, valence: 0.28, arousal: 0.46 },
      { tMs: 1, valence: 0.3, arousal: 0.5 },
      { tMs: 2, valence: 0.26, arousal: 0.55 },
      { tMs: 3, valence: 0.24, arousal: 0.52 },
      { tMs: 4, valence: 0.22, arousal: 0.48 },
    ];
    expectInvalid(p);
  });

  it("声量曲線の要素数が曲長と刻みに合わないなら不合格", () => {
    const p = clone();
    p.loudnessCurve.values = [1, 2, 3];
    expectInvalid(p);
  });

  it("多様性逓減区間の役割が既定の3種以外なら不合格", () => {
    const p = clone();
    (p.diversityZones[0] as { role: string }).role = "bridge";
    expectInvalid(p);
  });

  it("カメラ軌跡が曲全体を覆わないなら不合格", () => {
    const p = clone();
    p.camera.pop();
    p.camera[p.camera.length - 1].timeMs = 2000;
    expectInvalid(p);
  });

  it("スキーマ版数が想定値以外なら不合格", () => {
    const p = clone();
    p.schemaVersion = 2;
    expectInvalid(p);
  });

  it("無和音区間のスロット和音名が無和音記号のままなら不合格", () => {
    const p = clone();
    // slots[0] は無和音区間（chords[0].name === "N"）に対応する。解決後の和音名でなく "N" のままは不正。
    p.slots[0].chordName = "N";
    expectInvalid(p);
  });

  it("source の音楽地図識別子が SONGS と不一致なら不合格", () => {
    const p = clone();
    p.source.video.beatId = 99999999;
    expectInvalid(p);
  });

  it("色の停止点の末尾が x=1 でないなら不合格", () => {
    const p = clone();
    p.colors.xAxisStops[1].x = 0.9;
    expectInvalid(p);
  });
});

describe("validateProfile 譜面派生項目の欠落", () => {
  // バリデータは譜面派生項目の存在も検査する（第2層）。退行防止のため各項目の欠落を固定する。
  const derivedKeys = ["slots", "notes", "camera", "colors", "sfx", "diversityZones", "tapBudget"];

  for (const key of derivedKeys) {
    it(`譜面派生項目 ${key} を欠くと、欠落箇所を示して不合格になる`, () => {
      const p = clone() as unknown as Record<string, unknown>;
      delete p[key];
      const result = validateProfile(p);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.path.includes(key))).toBe(true);
      }
    });
  }
});
