import { describe, it, expect } from "vitest";
import { createSeededRandom } from "./random";
import {
  OPERATION_LANE_COUNT,
  nextDropletParams,
  dropletMaxStopSeconds,
} from "./droplet";

// 設計値（droplet.ts と同じ）。nextDropletParams の出力範囲の期待値を計算するためにここに置く。
const DROPLET_BASE_HZ = 760;
const DROPLET_PITCH_SPREAD_SEMITONES = 4;
const DROPLET_RISE_FACTOR = 1.85;

describe("OPERATION_LANE_COUNT", () => {
  it("操作音が受け持つレーン数は判定系のスロット数（7）と一致する", () => {
    expect(OPERATION_LANE_COUNT).toBe(7);
  });
});

describe("nextDropletParams（タップごとの水滴音の個体差）", () => {
  it("基音は中心の上下4半音の範囲に収まり、チャープの終了周波数は開始より高い（上向き）", () => {
    const random = createSeededRandom(1);
    const lowest = DROPLET_BASE_HZ * 2 ** (-DROPLET_PITCH_SPREAD_SEMITONES / 12);
    const highest = DROPLET_BASE_HZ * 2 ** (DROPLET_PITCH_SPREAD_SEMITONES / 12);
    for (let i = 0; i < 2000; i += 1) {
      const params = nextDropletParams(random);
      // 微小な丸め誤差の余裕を持たせて範囲を確かめる。
      expect(params.baseHz).toBeGreaterThanOrEqual(lowest - 1e-6);
      expect(params.baseHz).toBeLessThanOrEqual(highest + 1e-6);
      // 上向きチャープ: 終了周波数は開始周波数より高い（水滴の決め手。下向きは太鼓に聞こえる）。
      expect(params.riseHz).toBeGreaterThan(params.baseHz);
    }
  });

  it("チャープ量は基準倍率の揺らぎ範囲（0.9〜1.18倍）に収まる", () => {
    const random = createSeededRandom(2);
    const minFactor = DROPLET_RISE_FACTOR * 0.9;
    const maxFactor = DROPLET_RISE_FACTOR * 1.18;
    for (let i = 0; i < 2000; i += 1) {
      const params = nextDropletParams(random);
      const factor = params.riseHz / params.baseHz;
      expect(factor).toBeGreaterThanOrEqual(minFactor - 1e-6);
      expect(factor).toBeLessThanOrEqual(maxFactor + 1e-6);
    }
  });

  it("減衰・チャープ時間・音量・種は妥当な範囲で、種は1音ごとに変わる", () => {
    const random = createSeededRandom(3);
    const seeds = new Set<number>();
    let previousNoiseSeed = -1;
    let distinctSeedRuns = 0;
    for (let i = 0; i < 2000; i += 1) {
      const params = nextDropletParams(random);
      expect(params.decayMs).toBeGreaterThan(0);
      expect(params.chirpMs).toBeGreaterThan(0);
      expect(params.bodyPeak).toBeGreaterThan(0);
      expect(Number.isInteger(params.noiseSeed)).toBe(true);
      expect(params.noiseSeed).toBeGreaterThan(0);
      if (params.includeTick) {
        expect(params.tickGain).toBeGreaterThan(0);
        expect(params.tickHighpassHz).toBeGreaterThan(0);
      }
      seeds.add(params.noiseSeed);
      if (params.noiseSeed !== previousNoiseSeed) {
        distinctSeedRuns += 1;
      }
      previousNoiseSeed = params.noiseSeed;
    }
    // 種が連続で同じになる（相関する）ことはほぼ無い。大多数が直前と異なることを確かめる。
    expect(distinctSeedRuns).toBeGreaterThan(1990);
    expect(seeds.size).toBeGreaterThan(1990);
  });

  it("着水の衝撃は確率的に省かれる（鳴る音と省く音の両方が現れる）", () => {
    const random = createSeededRandom(4);
    let withTick = 0;
    let withoutTick = 0;
    for (let i = 0; i < 2000; i += 1) {
      const params = nextDropletParams(random);
      if (params.includeTick) {
        withTick += 1;
      } else {
        withoutTick += 1;
      }
    }
    expect(withTick).toBeGreaterThan(0);
    expect(withoutTick).toBeGreaterThan(0);
  });
});

describe("dropletMaxStopSeconds", () => {
  it("正の有限値で、基準の減衰時間より長い（揺らぎ最大を含む上限）", () => {
    const max = dropletMaxStopSeconds();
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(0.15);
    expect(max).toBeLessThan(1);
  });

  it("実際に選ばれるどのパラメータの停止時刻も上限以下に収まる", () => {
    const random = createSeededRandom(5);
    const RELEASE_TAIL_MS = 20;
    const DROPLET_BODY_ATTACK_MS = 2;
    const max = dropletMaxStopSeconds();
    for (let i = 0; i < 2000; i += 1) {
      const params = nextDropletParams(random);
      const bodyEndSeconds = (DROPLET_BODY_ATTACK_MS + params.decayMs + RELEASE_TAIL_MS) / 1000;
      expect(bodyEndSeconds).toBeLessThanOrEqual(max + 1e-6);
    }
  });
});
