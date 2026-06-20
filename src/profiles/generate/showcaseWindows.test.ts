import { describe, expect, it } from "vitest";
import {
  beatsUsable,
  buildBeatWindow,
  extendClimaxWindow,
  nearestBeatIndex,
  OverlappingImmutableWindowsError,
  resolveWindows,
  WindowTooShortError,
} from "./showcaseWindows";
import type { ShowcaseWindow } from "./types";

describe("beatsUsable", () => {
  it("2要素以上かつ狭義単調増加なら真", () => {
    expect(beatsUsable([0, 100, 200])).toBe(true);
  });
  it("空・要素2未満は偽", () => {
    expect(beatsUsable([])).toBe(false);
    expect(beatsUsable([100])).toBe(false);
  });
  it("等値（同時刻の重複）や逆順は偽", () => {
    expect(beatsUsable([0, 100, 100, 200])).toBe(false);
    expect(beatsUsable([0, 200, 100])).toBe(false);
  });
});

describe("nearestBeatIndex", () => {
  it("最も近い拍の番号を返す", () => {
    expect(nearestBeatIndex([0, 1000, 2000], 1100)).toBe(1);
    expect(nearestBeatIndex([0, 1000, 2000], 1600)).toBe(2);
  });
  it("同距離なら早い拍", () => {
    expect(nearestBeatIndex([0, 1000], 500)).toBe(0);
  });
});

describe("buildBeatWindow", () => {
  it("代表時刻の拍から片側16拍前後を数える", () => {
    // 等間隔343msの拍を100個。代表時刻 17150ms ≒ 拍50。
    const beats = Array.from({ length: 100 }, (_, i) => i * 343);
    const rep = 50 * 343;
    const w = buildBeatWindow(rep, beats, 16, 5500);
    expect(w.startMs).toBe(beats[34]); // 50-16
    expect(w.endMs).toBe(beats[66]); // 50+16
  });
  it("拍番号が配列端を外れるときはクランプ", () => {
    const beats = Array.from({ length: 10 }, (_, i) => i * 1000);
    const w = buildBeatWindow(0, beats, 16, 5500); // 拍0から-16 → 先頭、+16 → 末尾
    expect(w.startMs).toBe(beats[0]);
    expect(w.endMs).toBe(beats[9]);
  });
  it("拍が使えないときは代表時刻の前後 fallback 幅", () => {
    const w = buildBeatWindow(60000, [], 16, 5500);
    expect(w).toEqual({ startMs: 54500, endMs: 65500 });
  });
});

describe("extendClimaxWindow", () => {
  it("終端をアンカーまで延長（アンカーが区間終端より後）", () => {
    const w = extendClimaxWindow({ startMs: 165674.6, endMs: 187874.6 }, 189000, 237250, null);
    expect(w.startMs).toBeCloseTo(165674.6, 1);
    expect(w.endMs).toBe(189000);
  });
  it("区間終端がアンカーより後なら延長しない", () => {
    const w = extendClimaxWindow({ startMs: 100000, endMs: 195000 }, 189000, 237250, null);
    expect(w.endMs).toBe(195000);
  });
  it("アンカーが曲長を超える曲では延長しない", () => {
    const w = extendClimaxWindow({ startMs: 100000, endMs: 160000 }, 189000, 170000, null);
    expect(w.endMs).toBe(160000);
  });
  it("次chorus開始で頭打ちにする", () => {
    const w = extendClimaxWindow({ startMs: 100000, endMs: 120000 }, 189000, 237250, 130000);
    expect(w.endMs).toBe(130000);
  });
});

function chorus(startMs: number, endMs: number, isClimax = false): ShowcaseWindow {
  return { startMs, endMs, representativeMs: (startMs + endMs) / 2, source: "chorus", isClimax };
}
function nonChorus(startMs: number, endMs: number, representativeMs: number): ShowcaseWindow {
  return { startMs, endMs, representativeMs, source: "nonChorus", isClimax: false };
}

describe("resolveWindows", () => {
  it("非chorus窓が不変窓へ食い込む場合は不変窓の境界へ寄せる（chorus境界は不変）", () => {
    const ch = chorus(20000, 42000);
    const nc = nonChorus(15000, 26000, 21000); // 右端がchorusに食い込む
    const out = resolveWindows([ch, nc], 237250, 2000);
    const resolvedChorus = out.find((w) => w.source === "chorus")!;
    const resolvedNon = out.find((w) => w.source === "nonChorus")!;
    expect(resolvedChorus.startMs).toBe(20000); // chorus不変
    expect(resolvedChorus.endMs).toBe(42000);
    expect(resolvedNon.endMs).toBe(20000); // chorus開始へ切り詰め
  });
  it("非chorus窓どうしは代表時刻の中点で分ける", () => {
    const a = nonChorus(10000, 30000, 20000);
    const b = nonChorus(25000, 45000, 40000);
    const out = resolveWindows([a, b], 237250, 2000);
    const mid = (20000 + 40000) / 2; // 30000
    expect(out[0].endMs).toBe(mid);
    expect(out[1].startMs).toBe(mid);
  });
  it("3つ以上の連鎖した非chorus窓を左から右へ決定論的に分割", () => {
    const a = nonChorus(0, 25000, 10000);
    const b = nonChorus(15000, 40000, 25000);
    const c = nonChorus(30000, 55000, 45000);
    const out = resolveWindows([c, a, b], 237250, 2000); // 順不同で渡す
    expect(out.map((w) => w.representativeMs)).toEqual([10000, 25000, 45000]);
    expect(out[0].endMs).toBe((10000 + 25000) / 2); // 17500
    expect(out[1].startMs).toBe((10000 + 25000) / 2);
    expect(out[1].endMs).toBe((25000 + 45000) / 2); // 35000
    expect(out[2].startMs).toBe((25000 + 45000) / 2);
  });
  it("曲長を超える窓は[0,durationMs]へ収める", () => {
    const nc = nonChorus(-1000, 240000, 120000);
    const out = resolveWindows([nc], 237250, 2000);
    expect(out[0].startMs).toBe(0);
    expect(out[0].endMs).toBe(237250);
  });
  it("切り詰めで minWindowMs 未満になるとエラー", () => {
    const ch = chorus(20000, 42000);
    const nc = nonChorus(19000, 21000, 19500); // chorusへ寄せると長さ1000ms<2000ms
    expect(() => resolveWindows([ch, nc], 237250, 2000)).toThrow(WindowTooShortError);
  });
  it("不変窓どうしが重なるとエラー", () => {
    const a = chorus(10000, 30000);
    const b = chorus(25000, 45000, true);
    expect(() => resolveWindows([a, b], 237250, 2000)).toThrow(OverlappingImmutableWindowsError);
  });
});
