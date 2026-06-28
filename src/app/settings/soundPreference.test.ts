import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadSoundVolume,
  saveSoundVolume,
  SOUND_VOLUME_KEY,
  SOUND_VOLUME_DEFAULT,
} from "./soundPreference";

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
  it("記録が無いときは既定（最大100）", () => {
    vi.stubGlobal("localStorage", createMockStorage());
    expect(loadSoundVolume()).toBe(SOUND_VOLUME_DEFAULT);
    expect(SOUND_VOLUME_DEFAULT).toBe(100);
  });

  it("音量を保存すると読み出しで同じ値になる", () => {
    const mock = createMockStorage();
    vi.stubGlobal("localStorage", mock);
    saveSoundVolume(40);
    expect(loadSoundVolume()).toBe(40);
    expect(mock.map.get(SOUND_VOLUME_KEY)).toBe("40");
  });

  it("0を保存すると無音（0）として読み出せる", () => {
    vi.stubGlobal("localStorage", createMockStorage());
    saveSoundVolume(0);
    expect(loadSoundVolume()).toBe(0);
  });

  it("範囲外の値は0以上100以下へ丸めて保存・読出する", () => {
    vi.stubGlobal("localStorage", createMockStorage());
    saveSoundVolume(140);
    expect(loadSoundVolume()).toBe(100);
    saveSoundVolume(-20);
    expect(loadSoundVolume()).toBe(0);
  });

  it("小数は整数へ丸めて保存する", () => {
    const mock = createMockStorage();
    vi.stubGlobal("localStorage", mock);
    saveSoundVolume(63.7);
    expect(mock.map.get(SOUND_VOLUME_KEY)).toBe("64");
  });

  it("壊れた値・非有限の保存値は既定（100）として読み出す", () => {
    const mock = createMockStorage();
    vi.stubGlobal("localStorage", mock);
    mock.map.set(SOUND_VOLUME_KEY, "こわれた値");
    expect(loadSoundVolume()).toBe(SOUND_VOLUME_DEFAULT);
  });

  it("localStorage が無い環境では既定（100）", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadSoundVolume()).toBe(SOUND_VOLUME_DEFAULT);
  });

  it("保存が例外を投げる環境でも saveSoundVolume は例外を投げない", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("容量超過");
      },
      removeItem: () => {},
    });
    expect(() => saveSoundVolume(50)).not.toThrow();
  });
});
