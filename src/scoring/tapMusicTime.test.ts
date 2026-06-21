import { describe, expect, it } from "vitest";
import { tapMusicTimeMs } from "./tapMusicTime";
import type { FrameTimeSample } from "./types";

function frame(
  musicPositionMs: number,
  frameWallTimeMs: number,
  reliableMusicTime = true
): FrameTimeSample {
  return { musicPositionMs, frameWallTimeMs, reliableMusicTime };
}

describe("tapMusicTimeMs 3時刻分離の変換", () => {
  it("入力がフレーム時刻より後なら音楽時刻も同じだけ進む", () => {
    expect(tapMusicTimeMs(1008, frame(5000, 1000))).toBe(5008);
  });

  it("入力がフレーム時刻より前なら音楽時刻は同じだけ戻る", () => {
    expect(tapMusicTimeMs(995, frame(5000, 1000))).toBe(4995);
  });

  it("入力とフレームが同時ならフレームのゲーム時計に一致", () => {
    expect(tapMusicTimeMs(1000, frame(5000, 1000))).toBe(5000);
  });

  it("入力時刻が非有限ならフレーム内補正をやめゲーム時計を返す", () => {
    expect(tapMusicTimeMs(Number.NaN, frame(5000, 1000))).toBe(5000);
    expect(tapMusicTimeMs(Number.POSITIVE_INFINITY, frame(5000, 1000))).toBe(5000);
  });

  it("フレームのゲーム時計が非有限なら0を返す", () => {
    expect(tapMusicTimeMs(1008, frame(Number.NaN, 1000))).toBe(0);
  });

  it("フレームの実時計が非有限ならフレーム内補正をやめゲーム時計を返す", () => {
    expect(tapMusicTimeMs(1008, frame(5000, Number.NaN))).toBe(5000);
  });
});
