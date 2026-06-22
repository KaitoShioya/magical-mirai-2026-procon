import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadCalibrationOffsetMs,
  saveCalibrationOffsetMs,
  clearCalibrationOffset,
  CALIBRATION_STORAGE_KEY,
} from "./calibrationStore";
import {
  CALIBRATION_OFFSET_MIN_MS,
  CALIBRATION_OFFSET_MAX_MS,
} from "../config/tuning";

// 端末内保存の擬装。Map で値を保持し、getItem・setItem・removeItem を本物と同じ約束で提供する。
function createMockStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string): string | null => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  };
}

let mock: ReturnType<typeof createMockStorage>;

beforeEach(() => {
  mock = createMockStorage();
  vi.stubGlobal("localStorage", mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("calibrationStore", () => {
  it("保存した値を読み出すと往復で一致する", () => {
    expect(saveCalibrationOffsetMs(30)).toBe(true);
    expect(loadCalibrationOffsetMs()).toBe(30);
  });

  it("範囲外の値は保存時にクランプされ、読み出しもクランプ値になる", () => {
    expect(saveCalibrationOffsetMs(500)).toBe(true);
    expect(loadCalibrationOffsetMs()).toBe(CALIBRATION_OFFSET_MAX_MS);
    expect(saveCalibrationOffsetMs(-300)).toBe(true);
    expect(loadCalibrationOffsetMs()).toBe(CALIBRATION_OFFSET_MIN_MS);
  });

  it("壊れたJSONはフォールバック値を返す", () => {
    mock.setItem(CALIBRATION_STORAGE_KEY, "これはJSONではない");
    expect(loadCalibrationOffsetMs(7)).toBe(7);
  });

  it("形式の版が一致しない保存はフォールバック値を返す", () => {
    mock.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify({ version: 2, offsetMs: 30 }));
    expect(loadCalibrationOffsetMs(7)).toBe(7);
  });

  it("補正値の型が数値でない保存はフォールバック値を返す", () => {
    mock.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify({ version: 1, offsetMs: "x" }));
    expect(loadCalibrationOffsetMs(7)).toBe(7);
  });

  it("補正値が非有限の保存はフォールバック値を返す", () => {
    mock.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify({ version: 1, offsetMs: null }));
    expect(loadCalibrationOffsetMs(7)).toBe(7);
  });

  it("保存が無いときは指定したフォールバック値（既定は0）を返す", () => {
    expect(loadCalibrationOffsetMs()).toBe(0);
    expect(loadCalibrationOffsetMs(15)).toBe(15);
  });

  it("localStorage が無い環境では読みはフォールバック、保存はfalseで例外を投げない", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadCalibrationOffsetMs(7)).toBe(7);
    expect(saveCalibrationOffsetMs(30)).toBe(false);
  });

  it("setItem が例外を投げる環境では保存はfalseを返し握りつぶす", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("容量超過");
      },
      removeItem: () => {},
    });
    expect(saveCalibrationOffsetMs(30)).toBe(false);
  });

  it("非有限の補正値の保存はfalseを返す", () => {
    expect(saveCalibrationOffsetMs(Number.NaN)).toBe(false);
    expect(saveCalibrationOffsetMs(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("消去の後の読み出しはフォールバック値を返す", () => {
    saveCalibrationOffsetMs(30);
    clearCalibrationOffset();
    expect(loadCalibrationOffsetMs(7)).toBe(7);
  });
});
