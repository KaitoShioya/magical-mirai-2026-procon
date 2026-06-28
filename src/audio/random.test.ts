import { describe, it, expect } from "vitest";
import { createSeededRandom, generateWhiteNoise } from "./random";

describe("createSeededRandom", () => {
  it("0以上1未満の数を返す", () => {
    const next = createSeededRandom(1234);
    for (let i = 0; i < 1000; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("同じ種では完全に同じ数列を返す（再現性）", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    for (let i = 0; i < 100; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it("異なる種では異なる数列を返す", () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    let anyDifferent = false;
    for (let i = 0; i < 100; i += 1) {
      if (a() !== b()) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});

describe("generateWhiteNoise", () => {
  it("指定した標本数で、各標本が−1以上1未満になる", () => {
    const noise = generateWhiteNoise(500, 7);
    expect(noise.length).toBe(500);
    for (let i = 0; i < noise.length; i += 1) {
      expect(noise[i]).toBeGreaterThanOrEqual(-1);
      expect(noise[i]).toBeLessThan(1);
    }
  });

  it("同じ種では完全に同じ標本列を返す（再現性）", () => {
    const a = generateWhiteNoise(200, 99);
    const b = generateWhiteNoise(200, 99);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it("長さが0以下なら長さ0の配列を返す（例外を出さない）", () => {
    expect(generateWhiteNoise(0, 1).length).toBe(0);
    expect(generateWhiteNoise(-5, 1).length).toBe(0);
  });
});
