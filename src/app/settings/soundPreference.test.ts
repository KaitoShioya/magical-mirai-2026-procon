import { describe, it, expect, vi, afterEach } from "vitest";
import { loadSoundEnabled, saveSoundEnabled, SOUND_PREFERENCE_KEY } from "./soundPreference";

// 端末内保存の擬装。Map で値を保持し、getItem・setItem を本物と同じ約束で提供する（calibrationStore のテストと同じ様式）。
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("soundPreference", () => {
  it("記録が無いときは既定で鳴らす（true）", () => {
    vi.stubGlobal("localStorage", createMockStorage());
    expect(loadSoundEnabled()).toBe(true);
  });

  it("OFF を保存すると読み出しが false になり、値は \"false\" で保存される", () => {
    const mock = createMockStorage();
    vi.stubGlobal("localStorage", mock);
    saveSoundEnabled(false);
    expect(loadSoundEnabled()).toBe(false);
    expect(mock.map.get(SOUND_PREFERENCE_KEY)).toBe("false");
  });

  it("ON を保存すると読み出しが true になる", () => {
    vi.stubGlobal("localStorage", createMockStorage());
    saveSoundEnabled(false);
    saveSoundEnabled(true);
    expect(loadSoundEnabled()).toBe(true);
  });

  it("localStorage が無い環境では既定で鳴らす（true）", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadSoundEnabled()).toBe(true);
  });

  it("保存が例外を投げる環境でも saveSoundEnabled は例外を投げない", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("容量超過");
      },
      removeItem: () => {},
    });
    expect(() => saveSoundEnabled(false)).not.toThrow();
  });
});
