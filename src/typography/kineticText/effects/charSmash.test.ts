// Issue #23 1文字1拍スマッシュの決定性テスト。
// 「#29 の契約に基づきビート吸着済みの開始時刻を入力したとき、拍から1フレーム以内に出現し、ビート時刻で山に
// 達し、以後単調に落ち着き、1フレーム遅れでも打撃を保つ」という連鎖を、主語を分けて表明する。
// 受け入れ基準「ビート±1フレーム一致」は、第1に発火が1フレーム以内、第2に山の時刻がビート時刻に数学上あり、
// 遅延描画ではその時刻から経過分だけ進んだ姿で出る、という整理で満たす。

import { describe, it, expect } from "vitest";
import {
  charSmash,
  charSmashScaleAt,
  CHAR_SMASH_PEAK_SCALE,
  CHAR_SMASH_SETTLE_SCALE,
  CHAR_SMASH_SETTLE_FRACTION,
  CHAR_SMASH_DECAY_EXPONENT,
  CHAR_SMASH_DECAY_MS,
} from "./charSmash";
import { validateEffectElement, findContributionIssues } from "../effectElement";
import type { EffectContext, AttributeContribution } from "../effectElement";
import { createBeatScheduler } from "../../../utils/beatScheduler";

// 1フレーム＝1000÷60≒16.67ミリ秒（毎秒60フレーム目標のため）。受け入れ基準の「1フレーム」の単位。
const FRAME_MS = 1000 / 60;

// 評価コンテキストを最小構成で作る。文字単位・1文字。任意フィールドは省略する。
function charCtx(unitStartMs: number, unitEndMs: number, gameTimeMs: number): EffectContext {
  return {
    gameTimeMs,
    unit: "char",
    unitStartMs,
    unitEndMs,
    text: "あ",
    unitGlyphCount: 1,
    phraseIndex: 0,
  };
}

function scaleX(contribution: AttributeContribution | null): number {
  if (!contribution || !contribution.scale) {
    throw new Error("大きさの寄与がありません");
  }
  return contribution.scale.value.x;
}

describe("Issue #23 1文字1拍スマッシュ 契約の保証", () => {
  it("validateEffectElement が不整合ゼロ", () => {
    expect(validateEffectElement(charSmash)).toEqual([]);
  });

  it("findContributionIssues が不整合ゼロ（代表的な進行で寄与が operates の範囲内）", () => {
    const span = 720;
    for (const progress of [0, 0.1, 0.35, 0.5, 1]) {
      const contribution = charSmash.evaluate(charCtx(0, span, progress * span));
      expect(contribution).not.toBeNull();
      expect(findContributionIssues(charSmash.operates, contribution as AttributeContribution)).toEqual([]);
    }
  });

  it("宣言が仕様どおり（文字単位・2拍に1回・大きさと不透明度を操作）", () => {
    expect(charSmash.targetUnit).toBe("char");
    expect(charSmash.startCondition.trigger).toBe("onUnitStart");
    expect(charSmash.startCondition.beatCadence).toBe(2);
    // requiredSignals は持たせない（評価に直接必要な信号が無いため）。
    expect(charSmash.startCondition.requiredSignals).toBeUndefined();
    expect(charSmash.startCondition.selectionHints).toEqual(["beat", "duration", "granularity"]);
    expect(charSmash.operates).toEqual({ scale: "main", opacity: true });
    expect(charSmash.estimateCost({ unitGlyphCount: 1 })).toEqual({
      extraGlyphs: 0,
      gsapTargetsPerFrame: 1,
      troikaSyncs: 1,
      glowTargets: 0,
      duplication: false,
    });
  });
});

describe("Issue #23 山の時刻の保証（数学上のピークが開始時刻にある）", () => {
  it("開始時刻ちょうど（経過0ミリ秒）で大きさが山倍率に一致し、縦横一律で不透明度1", () => {
    const beatTimeMs = 1000;
    const contribution = charSmash.evaluate(charCtx(beatTimeMs, beatTimeMs + 720, beatTimeMs));
    expect(contribution).not.toBeNull();
    const scale = (contribution as AttributeContribution).scale;
    if (!scale) throw new Error("大きさの寄与がありません");
    expect(scale.value.x).toBeCloseTo(CHAR_SMASH_PEAK_SCALE, 10);
    expect(scale.value.y).toBe(scale.value.x);
    expect(scale.value.z).toBe(scale.value.x);
    expect(scale.layer).toBe("main");
    expect((contribution as AttributeContribution).opacity?.factor).toBe(1);
    // 位置の寄与は返さない（operates から外したため）。
    expect((contribution as AttributeContribution).position).toBeUndefined();
  });
});

describe("Issue #23 曲線の保証（単調減衰・再はね上げなし）", () => {
  it("進行を増やすと大きさが単調に減少し、進行1で落ち着き倍率に一致する", () => {
    const beatTimeMs = 0;
    const span = 720;
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 40; i += 1) {
      const progress = i / 40;
      const scale = scaleX(charSmash.evaluate(charCtx(beatTimeMs, beatTimeMs + span, progress * span)));
      // 浮動小数の許容のため微小量を足して比較する。
      expect(scale).toBeLessThanOrEqual(previous + 1e-9);
      previous = scale;
    }
    const endScale = scaleX(charSmash.evaluate(charCtx(beatTimeMs, beatTimeMs + span, beatTimeMs + span)));
    expect(endScale).toBeCloseTo(CHAR_SMASH_SETTLE_SCALE, 10);
  });
});

describe("Issue #23 スケジューラの保証（出現の遅れが1フレーム以内）", () => {
  // 拍同期スケジューラ #16 を60フレーム毎秒相当で回し、各拍の発火フレームの遅れ（拍からの経過）が
  // 1フレーム以内であることを確認する。これは「出現の遅れの上界」の確認である。
  function maxElapsedOver(beatsMs: readonly number[], startMs: number, endMs: number): number {
    const scheduler = createBeatScheduler(beatsMs);
    let maxElapsed = 0;
    for (let t = startMs; t <= endMs; t += FRAME_MS) {
      scheduler.advance(t, (event) => {
        if (event.elapsedSinceBeatMs > maxElapsed) maxElapsed = event.elapsedSinceBeatMs;
      });
    }
    return maxElapsed;
  }

  it("一定間隔の拍でも出現遅れが1フレーム以内", () => {
    const interval = 360;
    const beats = Array.from({ length: 20 }, (_unused, index) => 500 + index * interval);
    const maxElapsed = maxElapsedOver(beats, beats[0] - 100, beats[beats.length - 1] + interval);
    expect(maxElapsed).toBeLessThanOrEqual(FRAME_MS + 1e-9);
  });

  it("不等間隔の拍でも出現遅れが1フレーム以内（頑健性）", () => {
    const beats = [500, 700, 1050, 1410, 1450, 2000];
    const maxElapsed = maxElapsedOver(beats, 400, 2100);
    expect(maxElapsed).toBeLessThanOrEqual(FRAME_MS + 1e-9);
  });
});

describe("Issue #23 遅延描画の保証（1フレーム遅れでも打撃を保つ。ビート一致の実質確認）", () => {
  it("経過1フレームの大きさが計算式どおりで、打撃の品質下限を満たす", () => {
    const span = 720; // 表示時間を2拍ぶん（拍間隔360ミリ秒×2）とする。
    const beatTimeMs = 1000;
    const gameTimeMs = beatTimeMs + FRAME_MS; // 発火が1フレーム遅れた時点。
    // 進行は固定の減衰時間で正規化される（表示窓 span ではない）。期待値も同じ固定時間で算出する。
    const progress = FRAME_MS / CHAR_SMASH_DECAY_MS;
    const scale = scaleX(charSmash.evaluate(charCtx(beatTimeMs, beatTimeMs + span, gameTimeMs)));

    // 式追従の期待値: 係数から導いた式と一致する（係数調整に追従し、暫定値を固定焼き込みしない）。
    expect(scale).toBeCloseTo(charSmashScaleAt(progress), 10);

    // 品質最低保証その1（減衰の形の下限）: 打撃の保持割合は山倍率の絶対値に依存しない。
    // 採用理由: 1フレーム（16.67ミリ秒）は減衰時間300ミリ秒のごく一部であり、打撃の過半を保つのが妥当なため、下限を0.5とする。
    const retention = (scale - CHAR_SMASH_SETTLE_SCALE) / (CHAR_SMASH_PEAK_SCALE - CHAR_SMASH_SETTLE_SCALE);
    expect(retention).toBeGreaterThanOrEqual(0.5);

    // 品質最低保証その2（山が落ち着きより十分大きい）: 山倍率の絶対値の下げ過ぎを検知する。
    // 採用理由: 山が落ち着きの1.3倍未満ではスマッシュの過大表示と読めなくなるため、下限を1.3とする。
    expect(CHAR_SMASH_PEAK_SCALE / CHAR_SMASH_SETTLE_SCALE).toBeGreaterThanOrEqual(1.3);
  });
});

describe("Issue #23 頑健性の保証", () => {
  it("極端に短い表示時間でも有限・山以下落ち着き以上・単調減少", () => {
    const span = 30; // 1フレームより少し長い極端に短い表示時間。
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 10; i += 1) {
      const progress = i / 10;
      const scale = scaleX(charSmash.evaluate(charCtx(0, span, progress * span)));
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeLessThanOrEqual(CHAR_SMASH_PEAK_SCALE + 1e-9);
      expect(scale).toBeGreaterThanOrEqual(CHAR_SMASH_SETTLE_SCALE - 1e-9);
      expect(scale).toBeLessThanOrEqual(previous + 1e-9);
      previous = scale;
    }
  });

  it("表示時間0でも0除算せず有限の大きさを返す", () => {
    const scale = scaleX(charSmash.evaluate(charCtx(500, 500, 500)));
    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeCloseTo(CHAR_SMASH_PEAK_SCALE, 10);
  });
});

describe("Issue #23 係数の想定範囲の保証（将来のミスチューニング検知）", () => {
  // 採用理由: 係数（★暫定）はプレイ検証で調整するため、想定範囲を逸脱した値（落ち着き割合0以下、
  // 落ち着き0、山が落ち着き以下、減衰指数1未満）に変えると、大きさが壊れる、または打撃が消える。
  // 実行時はホットパスにガードを置かず、係数の不変条件をテスト時に検知して早期に失敗させる。
  it("山倍率は落ち着き倍率より大きく、落ち着き倍率は0より大きい", () => {
    expect(CHAR_SMASH_SETTLE_SCALE).toBeGreaterThan(0);
    expect(CHAR_SMASH_PEAK_SCALE).toBeGreaterThan(CHAR_SMASH_SETTLE_SCALE);
  });

  it("落ち着き割合は0より大きく1以下、減衰指数は1以上", () => {
    expect(CHAR_SMASH_SETTLE_FRACTION).toBeGreaterThan(0);
    expect(CHAR_SMASH_SETTLE_FRACTION).toBeLessThanOrEqual(1);
    expect(CHAR_SMASH_DECAY_EXPONENT).toBeGreaterThanOrEqual(1);
  });

  it("進行の全域で大きさが有限かつ山以下落ち着き以上に収まる", () => {
    for (let i = 0; i <= 100; i += 1) {
      const scale = charSmashScaleAt(i / 100);
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeLessThanOrEqual(CHAR_SMASH_PEAK_SCALE + 1e-9);
      expect(scale).toBeGreaterThanOrEqual(CHAR_SMASH_SETTLE_SCALE - 1e-9);
    }
  });
});
