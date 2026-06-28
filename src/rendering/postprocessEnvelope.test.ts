// 後処理の駆動強度（包絡）の検証。減衰・契機探索・シーク再現性を表明する。

import { describe, it, expect } from "vitest";
import { decayEnvelope, pulseEnvelopeAt } from "./postprocessEnvelope";

describe("減衰の包絡", () => {
  it("契機直後で1、持続の終わりで0、外側で0", () => {
    expect(decayEnvelope(0, 200)).toBe(1);
    expect(decayEnvelope(100, 200)).toBeCloseTo(0.5, 9);
    expect(decayEnvelope(200, 200)).toBe(0);
    expect(decayEnvelope(300, 200)).toBe(0);
    expect(decayEnvelope(-10, 200)).toBe(1);
  });

  it("持続0以下では0（0除算を避ける）", () => {
    expect(decayEnvelope(0, 0)).toBe(0);
    expect(decayEnvelope(0, -5)).toBe(0);
  });

  it("指数減衰は直線より序盤に速く落ちる（端点は同じ）", () => {
    expect(decayEnvelope(0, 200, "exp")).toBe(1);
    expect(decayEnvelope(200, 200, "exp")).toBe(0);
    // 中間では指数の方が小さい（速く落ちる）。
    expect(decayEnvelope(100, 200, "exp")).toBeLessThan(decayEnvelope(100, 200, "linear"));
  });
});

describe("契機列からの包絡", () => {
  const pulses = [500, 1000, 1500];

  it("直前の契機からの減衰を返す", () => {
    expect(pulseEnvelopeAt(500, pulses, 200)).toBe(1); // 契機ちょうど
    expect(pulseEnvelopeAt(600, pulses, 200)).toBeCloseTo(0.5, 9); // 契機から100ミリ秒
    expect(pulseEnvelopeAt(750, pulses, 200)).toBe(0); // 契機から250ミリ秒（持続超過）
  });

  it("最初の契機より前は0", () => {
    expect(pulseEnvelopeAt(100, pulses, 200)).toBe(0);
  });

  it("複数契機のうち直前のものを選ぶ", () => {
    expect(pulseEnvelopeAt(1050, pulses, 200)).toBeCloseTo(0.75, 9); // 1000から50ミリ秒
  });

  it("同じ時刻へ戻ると同じ強度（シーク再現性）", () => {
    const at = pulseEnvelopeAt(1100, pulses, 300);
    pulseEnvelopeAt(1400, pulses, 300);
    expect(pulseEnvelopeAt(1100, pulses, 300)).toBe(at);
  });

  it("数百件の昇順契機列でも直前の契機を正しく選ぶ（二分探索）", () => {
    // 拍は曲全体で数百件になりうるため、大きな昇順列で二分探索が直前の契機を正しく選ぶことを検証する。
    // 等間隔200ミリ秒・600件（0,200,…,119800）を作り、契機のちょうど中間で1つ前の契機が選ばれることを確かめる。
    const many: number[] = [];
    for (let i = 0; i < 600; i += 1) {
      many.push(i * 200);
    }
    // 60100ミリ秒は契機 60000（添字300）と 60200 の中間で、直前の契機は 60000。持続200ミリ秒で経過100ミリ秒なので0.5。
    expect(pulseEnvelopeAt(60100, many, 200)).toBeCloseTo(0.5, 9);
    // 最後の契機 119800 ちょうどは1。
    expect(pulseEnvelopeAt(119800, many, 200)).toBe(1);
    // 最初の契機 0 より前（負）は0。
    expect(pulseEnvelopeAt(-1, many, 200)).toBe(0);
  });
});
