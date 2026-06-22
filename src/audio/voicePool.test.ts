import { describe, it, expect } from "vitest";
import { createVoicePool } from "./voicePool";

describe("voicePool", () => {
  it("発音中を加えると発音中の数と接続中の数がともに増える", () => {
    const pool = createVoicePool();
    expect(pool.soundingCount).toBe(0);
    expect(pool.activeCount).toBe(0);
    pool.add(1, 0);
    pool.add(2, 0.1);
    expect(pool.soundingCount).toBe(2);
    expect(pool.activeCount).toBe(2);
  });

  it("最古の発音中は加えた順で最初の発音中を返す", () => {
    const pool = createVoicePool();
    pool.add(10, 0);
    pool.add(11, 0.1);
    pool.add(12, 0.2);
    expect(pool.oldestSoundingId()).toBe(10);
  });

  it("消音中へ移すと発音中の数は減るが接続中の数は減らず、奪取の対象から外れる", () => {
    const pool = createVoicePool();
    pool.add(10, 0);
    pool.add(11, 0.1);
    pool.markMuting(10);
    expect(pool.soundingCount).toBe(1);
    expect(pool.activeCount).toBe(2);
    // 10は消音中になったため、次の最古の発音中は11になる。
    expect(pool.oldestSoundingId()).toBe(11);
  });

  it("再生終了通知に相当する除去で接続中の数が減る", () => {
    const pool = createVoicePool();
    pool.add(10, 0);
    pool.add(11, 0.1);
    pool.markMuting(10);
    pool.remove(10);
    expect(pool.activeCount).toBe(1);
    expect(pool.soundingCount).toBe(1);
    expect(pool.oldestSoundingId()).toBe(11);
  });

  it("発音中が無ければ最古の発音中は null を返す", () => {
    const pool = createVoicePool();
    expect(pool.oldestSoundingId()).toBeNull();
    pool.add(10, 0);
    pool.markMuting(10);
    expect(pool.oldestSoundingId()).toBeNull();
  });

  it("上限を超える追加では、最古の発音中を消音中へ移しながら発音中の数を上限以下に保てる", () => {
    const pool = createVoicePool();
    const max = 24;
    // 上限まで発音中を加える。
    for (let i = 0; i < max; i += 1) {
      pool.add(i, i * 0.001);
    }
    expect(pool.soundingCount).toBe(max);
    // 上限到達後の新規発音をエンジンの手順で模す: 最古の発音中を消音中へ移してから新規を加える。
    for (let i = max; i < max + 6; i += 1) {
      const oldest = pool.oldestSoundingId();
      expect(oldest).not.toBeNull();
      pool.markMuting(oldest as number);
      pool.add(i, i * 0.001);
      expect(pool.soundingCount).toBe(max);
    }
    // 消音中6音はまだ接続中に残るため、接続中は上限を一時的に超える。
    expect(pool.activeCount).toBe(max + 6);
    // 消音中の6音が再生終了通知で除去されると接続中は上限へ戻る。
    for (let i = 0; i < 6; i += 1) {
      pool.remove(i);
    }
    expect(pool.activeCount).toBe(max);
  });

  it("ids は加えた順の識別子を返す", () => {
    const pool = createVoicePool();
    pool.add(5, 0);
    pool.add(7, 0.1);
    pool.add(9, 0.2);
    expect(pool.ids()).toEqual([5, 7, 9]);
  });

  it("clear はすべての音を取り除き、発音中の数も接続中の数も0にする（消音中も含めて空にする）", () => {
    const pool = createVoicePool();
    pool.add(1, 0);
    pool.add(2, 0.1);
    pool.markMuting(1);
    expect(pool.activeCount).toBe(2);
    pool.clear();
    expect(pool.soundingCount).toBe(0);
    expect(pool.activeCount).toBe(0);
    expect(pool.ids()).toEqual([]);
    expect(pool.oldestSoundingId()).toBeNull();
  });
});
