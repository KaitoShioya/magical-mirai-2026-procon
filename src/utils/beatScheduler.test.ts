import { describe, it, expect } from "vitest";
import { createBeatScheduler, firstBeatIndexAfter } from "./beatScheduler";

interface BeatEventForTest {
  index: number;
  timeMs: number;
  frameTimeMs: number;
  elapsedSinceBeatMs: number;
}

describe("firstBeatIndexAfter", () => {
  it("指定時刻より厳密に後の最初の拍の添字を返す", () => {
    const beats = [100, 200, 300, 400];
    // 200 ちょうどは「後」に含めない（厳密に後）。次は 300（添字2）。
    expect(firstBeatIndexAfter(beats, 200)).toBe(2);
    // 250 の直後は 300（添字2）。
    expect(firstBeatIndexAfter(beats, 250)).toBe(2);
  });

  it("全ての拍より前の時刻では先頭の添字0を返す", () => {
    expect(firstBeatIndexAfter([100, 200, 300], 50)).toBe(0);
    // 先頭ちょうどより小さい境界。
    expect(firstBeatIndexAfter([100, 200, 300], 99)).toBe(0);
  });

  it("全ての拍以上の時刻では長さ（末尾の次）を返す", () => {
    expect(firstBeatIndexAfter([100, 200, 300], 300)).toBe(3);
    expect(firstBeatIndexAfter([100, 200, 300], 9999)).toBe(3);
  });

  it("空配列では常に0を返す", () => {
    expect(firstBeatIndexAfter([], 0)).toBe(0);
    expect(firstBeatIndexAfter([], 1000)).toBe(0);
  });

  it("同時刻の拍が連続しても、その時刻より後の最初の添字を返す", () => {
    // 200 が2つ。200 ちょうどより後の最初は添字3（300）。
    expect(firstBeatIndexAfter([100, 200, 200, 300], 200)).toBe(3);
    // 150 の直後は最初の 200（添字1）。
    expect(firstBeatIndexAfter([100, 200, 200, 300], 150)).toBe(1);
  });
});

// テスト補助。基準時刻を syncMs に貼ってから frameTimes の各フレームで advance し、発火した拍の添字列を返す。
function fireIndices(
  beatStartTimesMs: readonly number[],
  syncMs: number,
  frameTimes: readonly number[]
): number[] {
  const scheduler = createBeatScheduler(beatStartTimesMs);
  scheduler.syncTo(syncMs);
  const fired: number[] = [];
  for (const t of frameTimes) {
    scheduler.advance(t, (event) => fired.push(event.index));
  }
  return fired;
}

describe("createBeatScheduler", () => {
  it("跨いだ拍を時刻の昇順で1回ずつ発火する", () => {
    const beats = [100, 200, 300, 400];
    expect(fireIndices(beats, 0, [150, 250, 350, 450])).toEqual([0, 1, 2, 3]);
  });

  it("フレーム数非依存: 一括前進と分割前進で発火列が一致する", () => {
    const beats = [100, 200, 300, 400, 500];
    const whole = fireIndices(beats, 0, [550]);
    const split = fireIndices(beats, 0, [120, 230, 330, 480, 550]);
    expect(whole).toEqual([0, 1, 2, 3, 4]);
    expect(split).toEqual(whole);
  });

  it("右閉区間: 現在時刻ちょうどの拍は当該フレームで発火する", () => {
    const beats = [100, 200, 300];
    // フレーム終端がちょうど 200。200 は発火する。
    expect(fireIndices(beats, 0, [200])).toEqual([0, 1]);
  });

  it("左開区間: 基準時刻ちょうどの拍は以後発火しない", () => {
    const beats = [100, 200, 300];
    // 基準を 200 に貼る。200 は消費済み扱いで、次フレーム 300 では 300（添字2）のみ。
    expect(fireIndices(beats, 200, [300])).toEqual([2]);
  });

  it("1回だけ: 跨いだ拍はさらに前進しても再発火しない", () => {
    const scheduler = createBeatScheduler([100, 200]);
    scheduler.syncTo(0);
    const fired: number[] = [];
    scheduler.advance(150, (e) => fired.push(e.index)); // 0 を発火
    scheduler.advance(160, (e) => fired.push(e.index)); // 再発火しない
    scheduler.advance(250, (e) => fired.push(e.index)); // 1 を発火
    scheduler.advance(260, (e) => fired.push(e.index)); // 再発火しない
    expect(fired).toEqual([0, 1]);
  });

  it("同一フレームで複数拍を跨ぐと昇順でまとめて発火する", () => {
    const beats = [100, 200, 300];
    const indices: number[] = [];
    const scheduler = createBeatScheduler(beats);
    scheduler.syncTo(0);
    scheduler.advance(350, (e) => indices.push(e.index));
    expect(indices).toEqual([0, 1, 2]);
  });

  it("発火数を戻り値で返す（跨ぎフレームは発火数、その他は0）", () => {
    const scheduler = createBeatScheduler([100, 200, 300]);
    expect(scheduler.advance(50, () => undefined)).toBe(0); // 初回は基準確定のみ
    expect(scheduler.advance(250, () => undefined)).toBe(2); // 100,200 を発火
    expect(scheduler.advance(250, () => undefined)).toBe(0); // 新たな跨ぎなし
    expect(scheduler.advance(350, () => undefined)).toBe(1); // 300 を発火
  });

  it("発火イベントは拍時刻・発火フレーム時刻・拍からの経過を持つ", () => {
    const scheduler = createBeatScheduler([100, 200]);
    scheduler.syncTo(0);
    const events: BeatEventForTest[] = [];
    scheduler.advance(250, (e) =>
      events.push({
        index: e.index,
        timeMs: e.timeMs,
        frameTimeMs: e.frameTimeMs,
        elapsedSinceBeatMs: e.elapsedSinceBeatMs,
      })
    );
    expect(events).toEqual([
      { index: 0, timeMs: 100, frameTimeMs: 250, elapsedSinceBeatMs: 150 },
      { index: 1, timeMs: 200, frameTimeMs: 250, elapsedSinceBeatMs: 50 },
    ]);
  });

  it("初回 advance は基準時刻を確定するだけで発火しない", () => {
    const scheduler = createBeatScheduler([100, 200, 300]);
    const fired: number[] = [];
    scheduler.advance(150, (e) => fired.push(e.index)); // 基準確定のみ。発火しない
    expect(fired).toEqual([]);
    expect(scheduler.lastProcessedMs).toBe(150);
    scheduler.advance(250, (e) => fired.push(e.index)); // (150, 250] の 200 を発火
    expect(fired).toEqual([1]);
  });

  it("syncTo は無発火で基準を貼り直し、飛びでも一括発火しない", () => {
    const scheduler = createBeatScheduler([100, 200, 300, 400, 500]);
    scheduler.syncTo(0);
    const fired: number[] = [];
    scheduler.advance(150, (e) => fired.push(e.index)); // 0 を発火
    scheduler.syncTo(450); // 飛び。1〜3 を遡って発火させない
    scheduler.advance(550, (e) => fired.push(e.index)); // (450, 550] の 500（添字4）のみ
    expect(fired).toEqual([0, 4]);
  });

  it("後退時刻では何も発火せず基準も後退しない", () => {
    const scheduler = createBeatScheduler([100, 200, 300]);
    scheduler.syncTo(0);
    const fired: number[] = [];
    scheduler.advance(250, (e) => fired.push(e.index)); // 0,1 を発火
    expect(fired).toEqual([0, 1]);
    scheduler.advance(120, (e) => fired.push(e.index)); // 後退。無発火・無変化
    expect(fired).toEqual([0, 1]);
    expect(scheduler.lastProcessedMs).toBe(250);
    scheduler.advance(350, (e) => fired.push(e.index)); // (250, 350] の 300（添字2）
    expect(fired).toEqual([0, 1, 2]);
  });

  it("空配列では何も発火しない", () => {
    const scheduler = createBeatScheduler([]);
    scheduler.syncTo(0);
    const fired: number[] = [];
    const count = scheduler.advance(100000, (e) => fired.push(e.index));
    expect(fired).toEqual([]);
    expect(count).toBe(0);
  });

  it("reset で未確定（null）へ戻り、次の advance は基準確定のみになる", () => {
    const scheduler = createBeatScheduler([100, 200]);
    scheduler.syncTo(0);
    const fired: number[] = [];
    scheduler.advance(150, (e) => fired.push(e.index)); // 0 を発火
    expect(fired).toEqual([0]);
    scheduler.reset();
    expect(scheduler.lastProcessedMs).toBe(null);
    scheduler.advance(250, (e) => fired.push(e.index)); // reset 後の初回。基準確定のみで無発火
    expect(fired).toEqual([0]);
    expect(scheduler.lastProcessedMs).toBe(250);
  });

  it("生成後に元の配列を変更しても発火列は変わらない（入力を複製する）", () => {
    const input = [100, 200];
    const scheduler = createBeatScheduler(input);
    scheduler.syncTo(0);
    input[0] = 9999; // 元配列を変更
    input.push(50); // 元配列に要素を追加
    const fired: number[] = [];
    scheduler.advance(250, (e) => fired.push(e.index));
    expect(fired).toEqual([0, 1]); // 100,200 をそのまま発火
  });

  it("有限でない拍時刻を含む入力は生成時に例外を投げる", () => {
    expect(() => createBeatScheduler([Number.NaN])).toThrow();
    expect(() => createBeatScheduler([Number.POSITIVE_INFINITY])).toThrow();
    expect(() => createBeatScheduler([100, Number.NaN, 200])).toThrow();
  });

  it("昇順（非減少）でない入力は生成時に例外を投げる", () => {
    expect(() => createBeatScheduler([100, 90, 200])).toThrow();
  });

  it("有限でない現在時刻の advance は無発火・基準不変で0を返す", () => {
    const scheduler = createBeatScheduler([100, 200]);
    scheduler.syncTo(0);
    const fired: number[] = [];
    expect(scheduler.advance(Number.NaN, (e) => fired.push(e.index))).toBe(0);
    expect(scheduler.advance(Number.POSITIVE_INFINITY, (e) => fired.push(e.index))).toBe(0);
    expect(fired).toEqual([]);
    expect(scheduler.lastProcessedMs).toBe(0); // 基準は変わらない
    scheduler.advance(250, (e) => fired.push(e.index)); // 有限値では正しく発火
    expect(fired).toEqual([0, 1]);
  });

  it("有限でない時刻の syncTo は基準を変えない", () => {
    const scheduler = createBeatScheduler([100, 200]);
    scheduler.syncTo(0);
    scheduler.advance(150, () => undefined); // 基準は 150 になる
    scheduler.syncTo(Number.NaN); // 無視される
    expect(scheduler.lastProcessedMs).toBe(150);
  });
});
