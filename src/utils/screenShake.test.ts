import { describe, it, expect } from "vitest";
import {
  createScreenShake,
  resolveBeatAmplitudes,
  inverseScreenPoint,
  isWithinAnyRange,
  BEAT_AMPLITUDE_DOWNBEAT,
  BEAT_AMPLITUDE_OFFBEAT,
  DECAY_ZOOM_TAU_MS,
  GOLDEN_ANGLE_RAD,
  type ScreenTransform,
} from "./screenShake";

// 検証用の十分大きな画面寸法（余白を持たせ、揺れの移動量を観測できるようにする）。
const W = 1000;
const H = 1000;

describe("resolveBeatAmplitudes（小節頭判定）", () => {
  it("拍位置1始まり・最初の小節長3のTAKEOVER構造で小節頭を拾う", () => {
    // 出典 docs/analysis/takeover.songmap.json: 索引0=位置1、索引3で位置が3→1へ戻る。
    const beats = [
      { position: 1 },
      { position: 2 },
      { position: 3 },
      { position: 1 },
      { position: 2 },
      { position: 3 },
      { position: 4 },
    ];
    expect(resolveBeatAmplitudes(beats)).toEqual([
      BEAT_AMPLITUDE_DOWNBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
      BEAT_AMPLITUDE_DOWNBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
    ]);
  });

  it("拍位置0始まりでも同じく小節頭を拾う（起点規約に依存しない）", () => {
    const beats = [{ position: 0 }, { position: 1 }, { position: 2 }, { position: 0 }, { position: 1 }];
    expect(resolveBeatAmplitudes(beats)).toEqual([
      BEAT_AMPLITUDE_DOWNBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
      BEAT_AMPLITUDE_DOWNBEAT,
      BEAT_AMPLITUDE_OFFBEAT,
    ]);
  });

  it("有限でない拍位置は小節頭とみなさず他拍扱いにする（例外を投げない）", () => {
    const beats = [{ position: 1 }, { position: Number.NaN }, { position: 1 }];
    expect(resolveBeatAmplitudes(beats)).toEqual([
      BEAT_AMPLITUDE_DOWNBEAT, // 索引0は常に小節頭
      BEAT_AMPLITUDE_OFFBEAT, // 位置が非有限
      BEAT_AMPLITUDE_OFFBEAT, // 直前の位置が非有限のため減少判定が成立しない
    ]);
  });

  it("空配列では空配列を返す", () => {
    expect(resolveBeatAmplitudes([])).toEqual([]);
  });
});

describe("isWithinAnyRange（サビ区間の判定）", () => {
  // TAKEOVER のサビ区間（コーラス区間）に相当する代表データ。半開区間の境界を確かめる。
  const ranges = [
    { startTimeMs: 1000, endTimeMs: 5000 },
    { startTimeMs: 10000, endTimeMs: 15000 },
  ];

  it("区間の開始時刻は内側とみなす（半開区間の下端を含む）", () => {
    expect(isWithinAnyRange(ranges, 1000)).toBe(true);
  });

  it("区間の終了時刻は内側とみなさない（半開区間の上端を含まない）", () => {
    expect(isWithinAnyRange(ranges, 5000)).toBe(false);
  });

  it("区間の内部の時刻は内側とみなす", () => {
    expect(isWithinAnyRange(ranges, 3000)).toBe(true);
    expect(isWithinAnyRange(ranges, 12000)).toBe(true);
  });

  it("いずれの区間にも属さない時刻は外側とみなす", () => {
    expect(isWithinAnyRange(ranges, 0)).toBe(false);
    expect(isWithinAnyRange(ranges, 7000)).toBe(false);
    expect(isWithinAnyRange(ranges, 20000)).toBe(false);
  });

  it("空配列ではどの時刻も外側とみなす", () => {
    expect(isWithinAnyRange([], 3000)).toBe(false);
  });
});

describe("createScreenShake（拡大の減衰）", () => {
  it("拍未発火・初期状態では恒等変換を返す", () => {
    const shake = createScreenShake();
    expect(shake.evaluate(0, W, H, false)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("時定数で拡大強度が1/eへ下がる（指数減衰）", () => {
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 0);
    const at0 = shake.evaluate(0, W, H, false).scale - 1;
    const atTau = shake.evaluate(DECAY_ZOOM_TAU_MS, W, H, false).scale - 1;
    const at2Tau = shake.evaluate(2 * DECAY_ZOOM_TAU_MS, W, H, false).scale - 1;
    expect(at0).toBeCloseTo(BEAT_AMPLITUDE_DOWNBEAT, 4);
    expect(atTau / at0).toBeCloseTo(Math.exp(-1), 2);
    expect(at2Tau / at0).toBeCloseTo(Math.exp(-2), 2);
  });

  it("拡大基準に拍開始時刻を用いる（遅延補償）", () => {
    // 拍開始100ミリ秒、発火フレーム150ミリ秒（50ミリ秒遅れ）でも、減衰は拍開始からの経過で進む。
    const shake = createScreenShake();
    shake.trigger(100, BEAT_AMPLITUDE_DOWNBEAT, 0);
    const value = shake.evaluate(150, W, H, false).scale - 1;
    expect(value).toBeCloseTo(BEAT_AMPLITUDE_DOWNBEAT * Math.exp(-50 / DECAY_ZOOM_TAU_MS), 4);
  });

  it("拡大は最大値で更新する（強拍直後の弱拍で下がらない）", () => {
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 0); // 強拍
    shake.trigger(0, BEAT_AMPLITUDE_OFFBEAT, 1); // 同時刻の弱拍
    // 強拍の拡大量0.09が保たれる（弱拍0.05へ下がらない）。
    expect(shake.evaluate(0, W, H, false).scale - 1).toBeCloseTo(BEAT_AMPLITUDE_DOWNBEAT, 4);
  });

  it("強拍の後の弱拍では基準だけ最新拍へ進み、拡大の減衰曲線が不連続に増減しない", () => {
    // 強拍のみの減衰曲線を基準にする。
    const strongOnly = createScreenShake();
    strongOnly.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 0);
    const strong150 = strongOnly.evaluate(150, W, H, false).scale - 1;

    // 強拍の100ミリ秒後に弱拍を打つ。基準は弱拍の時刻へ進むが、その時刻の残存強度が弱拍の振幅を上回るため、
    // 拡大の山は残存強度のまま保たれる（弱拍の振幅へ下がらない）。
    const strongThenWeak = createScreenShake();
    strongThenWeak.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 0);
    strongThenWeak.trigger(100, BEAT_AMPLITUDE_OFFBEAT, 1);

    // 弱拍の時刻で、強拍の残存強度を保ち弱拍の振幅へ低下しない（不連続な低下がない）。
    const residualAt100 = BEAT_AMPLITUDE_DOWNBEAT * Math.exp(-100 / DECAY_ZOOM_TAU_MS);
    expect(strongThenWeak.evaluate(100, W, H, false).scale - 1).toBeCloseTo(residualAt100, 4);

    // 以降の減衰も強拍のみの曲線と一致する（弱拍が曲線を持ち上げも下げもしない）。
    const weak150 = strongThenWeak.evaluate(150, W, H, false).scale - 1;
    expect(weak150).toBeCloseTo(strong150, 4);
  });

  it("動きを減らす設定では拍発火後も恒等変換を返す", () => {
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 0);
    expect(shake.evaluate(0, W, H, true)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("拡大がほぼ消えた領域は恒等へ吸着する", () => {
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_OFFBEAT, 1);
    // 2000ミリ秒後は強度 0.05 * exp(-8) ≒ 1.7e-5 で恒等近傍。
    expect(shake.evaluate(2000, W, H, false)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("倍率は小数4桁・移動量は小数1桁に丸める", () => {
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 3);
    const t = shake.evaluate(40, W, H, false);
    expect(t.scale).toBeCloseTo(Math.round(t.scale * 1e4) / 1e4, 10);
    expect(t.offsetX).toBeCloseTo(Math.round(t.offsetX * 10) / 10, 10);
    expect(t.offsetY).toBeCloseTo(Math.round(t.offsetY * 10) / 10, 10);
  });
});

describe("createScreenShake（揺れの減衰と余白内拘束）", () => {
  it("揺れの移動量は常に画面外余白の内側に収まる（隙間なし）", () => {
    const shake = createScreenShake();
    // 複数の拍索引・経過時刻で境界を確かめる。
    for (const index of [0, 1, 2, 3, 7, 11, 16]) {
      const local = createScreenShake();
      local.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, index);
      for (let t = 0; t <= 200; t += 5) {
        const tr = local.evaluate(t, W, H, false);
        const marginX = ((tr.scale - 1) / 2) * W;
        const marginY = ((tr.scale - 1) / 2) * H;
        expect(Math.abs(tr.offsetX)).toBeLessThanOrEqual(marginX + 1e-9);
        expect(Math.abs(tr.offsetY)).toBeLessThanOrEqual(marginY + 1e-9);
      }
    }
    void shake;
  });

  it("丸めの後でも余白内拘束が境界（恒等吸着の直上）で成り立つ", () => {
    // 拡大強度が吸着閾値の直上になる時刻帯（最も小さな余白）で、移動量が余白を超えないことを確かめる。
    // 画面寸法は携帯の代表値390×390にして余白を最も小さくし、丸めと余白の関係を最も厳しい条件で検証する。
    const vw = 390;
    const vh = 390;
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 7);
    for (let t = 1100; t <= 1400; t += 1) {
      const tr = shake.evaluate(t, vw, vh, false);
      const marginX = ((tr.scale - 1) / 2) * vw;
      const marginY = ((tr.scale - 1) / 2) * vh;
      expect(Math.abs(tr.offsetX)).toBeLessThanOrEqual(marginX + 1e-9);
      expect(Math.abs(tr.offsetY)).toBeLessThanOrEqual(marginY + 1e-9);
    }
  });

  it("二段減衰: 150ミリ秒で拡大は約0.55残り、揺れは視認上消える", () => {
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 2);
    const zoom0 = shake.evaluate(0, W, H, false).scale - 1;
    const zoom150 = shake.evaluate(150, W, H, false).scale - 1;
    // 拡大は時定数250ミリ秒で exp(-150/250)=exp(-0.6)≒0.549 残る。
    expect(zoom150 / zoom0).toBeCloseTo(Math.exp(-150 / 250), 2);

    // 揺れの早期の最大移動量に対し、150ミリ秒近傍の移動量は十分小さい。
    let earlyMax = 0;
    for (let t = 0; t <= 30; t += 1) {
      earlyMax = Math.max(earlyMax, Math.abs(shake.evaluate(t, W, H, false).offsetX));
    }
    let lateMax = 0;
    for (let t = 140; t <= 160; t += 1) {
      lateMax = Math.max(lateMax, Math.abs(shake.evaluate(t, W, H, false).offsetX));
    }
    expect(lateMax).toBeLessThan(earlyMax * 0.1);
  });

  it("同一フレームの複数拍では揺れが最新の拍に従う", () => {
    const shake = createScreenShake();
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 0); // 先の拍
    shake.trigger(0, BEAT_AMPLITUDE_DOWNBEAT, 8); // 後の拍（最新）
    // 振動の山（経過12.5ミリ秒で sin が1）で移動方向の比を見る。
    const tr = shake.evaluate(12.5, W, H, false);
    const expectedX = Math.cos(8 * GOLDEN_ANGLE_RAD);
    const expectedY = Math.sin(8 * GOLDEN_ANGLE_RAD);
    // W===H のため offsetX:offsetY は方向ベクトル cos:sin に一致する。
    // 移動量は0.1画素に丸めるため、比の許容は小数1桁とする。
    expect(tr.offsetX / tr.offsetY).toBeCloseTo(expectedX / expectedY, 1);
  });
});

describe("inverseScreenPoint（操作同期の逆変換）", () => {
  it("順変換と往復して元の座標へ戻る", () => {
    const transform: ScreenTransform = { scale: 1.1, offsetX: 30, offsetY: -20 };
    const points = [
      { x: 200, y: 300 },
      { x: 0, y: 0 },
      { x: 1000, y: 800 },
      { x: 640, y: 360 },
    ];
    const vw = 1000;
    const vh = 800;
    for (const p of points) {
      // 順変換: 画面位置 = 中心 + 倍率×(canvas位置 - 中心) + 移動。
      const screenX = vw / 2 + transform.scale * (p.x - vw / 2) + transform.offsetX;
      const screenY = vh / 2 + transform.scale * (p.y - vh / 2) + transform.offsetY;
      const back = inverseScreenPoint(transform, screenX, screenY, vw, vh);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it("恒等変換では逆変換が入力をそのまま返す", () => {
    const identity: ScreenTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const back = inverseScreenPoint(identity, 123, 456, 1000, 800);
    expect(back.x).toBeCloseTo(123, 6);
    expect(back.y).toBeCloseTo(456, 6);
  });
});
