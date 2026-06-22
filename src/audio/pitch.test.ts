import { describe, it, expect } from "vitest";
import { midiToFrequency, overtoneFrequency, slotToMidi, sanitizeSlotPitches } from "./pitch";
import { SYNTH_LOWPASS_HZ } from "./synthConstants";

describe("midiToFrequency", () => {
  it("基準: 音高番号69（A音）が440ヘルツになる", () => {
    expect(midiToFrequency(69)).toBe(440);
  });

  it("既知値: 音高番号60（中央のド）が約261.63ヘルツになる（誤差0.01以内）", () => {
    const hz = midiToFrequency(60);
    expect(hz).not.toBeNull();
    expect(Math.abs((hz as number) - 261.6256)).toBeLessThanOrEqual(0.01);
  });

  it("オクターブ: 音高番号を12上げると周波数が2倍になる", () => {
    const low = midiToFrequency(57) as number;
    const high = midiToFrequency(69) as number;
    expect(Math.abs(high / low - 2)).toBeLessThanOrEqual(1e-9);
  });

  it("診断サンプル最上音: 音高番号84が約1046.5ヘルツで1キロヘルツを超える", () => {
    const hz = midiToFrequency(84) as number;
    expect(Math.abs(hz - 1046.5023)).toBeLessThanOrEqual(0.01);
    expect(hz).toBeGreaterThan(1000);
  });

  it("非有限値は null を返す", () => {
    expect(midiToFrequency(Number.NaN)).toBeNull();
    expect(midiToFrequency(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("overtoneFrequency", () => {
  it("協和のため基本周波数のちょうど2倍を返す", () => {
    expect(overtoneFrequency(440)).toBe(880);
    expect(overtoneFrequency(523.25)).toBe(523.25 * 2);
  });

  it("倍音を基本周波数で割ると正確に整数の2になる", () => {
    const fundamental = 333.3;
    const overtone = overtoneFrequency(fundamental) as number;
    expect(overtone / fundamental).toBe(2);
  });

  it("診断の2和音の全音高で、倍音周波数が低域通過フィルターの遮断周波数未満になる", () => {
    // diagnostics/main.ts の2和音 [65,68,72,75,77,80,84] と [68,72,75,79,80,84,87] の全ユニーク音高。
    const allPitches = [65, 68, 72, 75, 77, 79, 80, 84, 87];
    for (const midiNote of allPitches) {
      const fundamental = midiToFrequency(midiNote) as number;
      const overtone = overtoneFrequency(fundamental) as number;
      expect(overtone).toBeLessThan(SYNTH_LOWPASS_HZ);
    }
  });

  it("非有限値は null を返す", () => {
    expect(overtoneFrequency(Number.NaN)).toBeNull();
    expect(overtoneFrequency(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("slotToMidi", () => {
  const slots = [65, 68, 72, 75, 77, 80, 84];

  it("範囲内のスロット番号で対応する音高を返す", () => {
    expect(slotToMidi(slots, 0)).toBe(65);
    expect(slotToMidi(slots, 6)).toBe(84);
  });

  it("範囲外・負・非整数は null を返す", () => {
    expect(slotToMidi(slots, 7)).toBeNull();
    expect(slotToMidi(slots, -1)).toBeNull();
    expect(slotToMidi(slots, 1.5)).toBeNull();
  });

  it("空配列では常に null を返す", () => {
    expect(slotToMidi([], 0)).toBeNull();
  });

  it("該当位置が非有限値なら null を返す", () => {
    expect(slotToMidi([Number.NaN, 60], 0)).toBeNull();
  });
});

describe("sanitizeSlotPitches", () => {
  it("未設定（null・undefined）は空配列にする", () => {
    expect(sanitizeSlotPitches(null)).toEqual([]);
    expect(sanitizeSlotPitches(undefined)).toEqual([]);
  });

  it("非有限値を取り除き、有限値だけを残す", () => {
    expect(sanitizeSlotPitches([60, Number.NaN, 64, Number.POSITIVE_INFINITY, 67])).toEqual([
      60, 64, 67,
    ]);
  });

  it("正常な配列はそのまま残す", () => {
    expect(sanitizeSlotPitches([65, 68, 72])).toEqual([65, 68, 72]);
  });
});
