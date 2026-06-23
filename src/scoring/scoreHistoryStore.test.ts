import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  recordPlay,
  loadBestScore,
  loadScoreHistory,
  clearScoreHistory,
  scoreHistoryKey,
  SCORE_HISTORY_RECENT_MAX,
  SCORE_HISTORY_VERSION,
} from "./scoreHistoryStore";
import type { ScoreResult } from "./scoreResult";
import type { Rank } from "./rank";

// 端末内保存の擬装。Map で値を保持し、getItem・setItem・removeItem を本物と同じ約束で提供する。
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

// 最小の ScoreResult を組む。bounds・percentileBasis は保存されないため妥当な値で埋める。
function makeResult(
  totalScore: number,
  options: { percentile?: number; rank?: Rank } = {}
): ScoreResult {
  return {
    totalScore,
    percentile: options.percentile ?? 50,
    rank: options.rank ?? "B",
    bounds: { min: 0, max: 1000 },
    percentileBasis: "fixed-uniform",
  };
}

const SONG = "takeover";

let mock: ReturnType<typeof createMockStorage>;

beforeEach(() => {
  mock = createMockStorage();
  vi.stubGlobal("localStorage", mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("scoreHistoryStore", () => {
  it("保存した記録を読み出すと往復で一致する（記録時刻も含む）", () => {
    recordPlay(SONG, makeResult(100, { percentile: 40, rank: "B" }), 1000);
    const history = loadScoreHistory(SONG);
    expect(history).not.toBeNull();
    expect(history!.best).toEqual({
      totalScore: 100,
      percentile: 40,
      rank: "B",
      recordedAtMs: 1000,
    });
    expect(history!.recent).toHaveLength(1);
    expect(history!.recent[0].recordedAtMs).toBe(1000);
  });

  it("初回の記録は自己ベスト更新で、前回の自己ベストは無い", () => {
    const outcome = recordPlay(SONG, makeResult(100), 1000);
    expect(outcome.isNewBest).toBe(true);
    expect(outcome.previousBest).toBeNull();
    expect(outcome.persisted).toBe(true);
  });

  it("厳密に上回ると自己ベストが更新される", () => {
    recordPlay(SONG, makeResult(100), 1000);
    const outcome = recordPlay(SONG, makeResult(200), 2000);
    expect(outcome.isNewBest).toBe(true);
    expect(outcome.previousBest?.totalScore).toBe(100);
    expect(loadBestScore(SONG)?.totalScore).toBe(200);
  });

  it("より低い得点では自己ベストが更新されない", () => {
    recordPlay(SONG, makeResult(200), 1000);
    const outcome = recordPlay(SONG, makeResult(150), 2000);
    expect(outcome.isNewBest).toBe(false);
    expect(outcome.previousBest?.totalScore).toBe(200);
    expect(loadBestScore(SONG)?.totalScore).toBe(200);
    expect(loadScoreHistory(SONG)!.recent[0].totalScore).toBe(150);
  });

  it("同点では自己ベストが更新されない（自己ベストの時刻は初回のまま）", () => {
    recordPlay(SONG, makeResult(200), 1000);
    const outcome = recordPlay(SONG, makeResult(200), 2000);
    expect(outcome.isNewBest).toBe(false);
    expect(loadBestScore(SONG)?.recordedAtMs).toBe(1000);
  });

  it("直近履歴が新しい順に並ぶ", () => {
    recordPlay(SONG, makeResult(1), 1000);
    recordPlay(SONG, makeResult(2), 2000);
    recordPlay(SONG, makeResult(3), 3000);
    expect(loadScoreHistory(SONG)!.recent.map((r) => r.totalScore)).toEqual([3, 2, 1]);
  });

  it("上限で直近履歴が切り詰められ、最古から退避する", () => {
    for (let i = 0; i < SCORE_HISTORY_RECENT_MAX + 5; i += 1) {
      // 得点を一定にして自己ベストの影響を切り離し、直近履歴の退避だけを見る。
      recordPlay(SONG, makeResult(100), 1000 + i);
    }
    const recent = loadScoreHistory(SONG)!.recent;
    expect(recent).toHaveLength(SCORE_HISTORY_RECENT_MAX);
    // 先頭は最新（最大の時刻）、末尾は退避後に残る最古。
    expect(recent[0].recordedAtMs).toBe(1000 + SCORE_HISTORY_RECENT_MAX + 4);
    expect(recent[recent.length - 1].recordedAtMs).toBe(1000 + 5);
  });

  it("上限を超える件数を記録しても自己ベストが残る", () => {
    recordPlay(SONG, makeResult(9999), 500);
    for (let i = 0; i < SCORE_HISTORY_RECENT_MAX + 5; i += 1) {
      recordPlay(SONG, makeResult(10), 1000 + i);
    }
    // 9999 は直近履歴からは退避しているが自己ベストは残る。
    expect(loadBestScore(SONG)?.totalScore).toBe(9999);
    expect(loadScoreHistory(SONG)!.recent.some((r) => r.totalScore === 9999)).toBe(false);
  });

  it("曲キーごとに独立し、片方の初期化が他方に影響しない", () => {
    recordPlay("takeover", makeResult(100), 1000);
    recordPlay("after-the-curtain", makeResult(200), 1000);
    expect(loadBestScore("takeover")?.totalScore).toBe(100);
    expect(loadBestScore("after-the-curtain")?.totalScore).toBe(200);
    clearScoreHistory("takeover");
    expect(loadScoreHistory("takeover")).toBeNull();
    expect(loadBestScore("after-the-curtain")?.totalScore).toBe(200);
  });

  it("記録が無いとき読出は null", () => {
    expect(loadScoreHistory(SONG)).toBeNull();
    expect(loadBestScore(SONG)).toBeNull();
  });

  it("壊れたJSONは null を返す", () => {
    mock.setItem(scoreHistoryKey(SONG), "これはJSONではない");
    expect(loadScoreHistory(SONG)).toBeNull();
    expect(loadBestScore(SONG)).toBeNull();
  });

  it("形式の版が一致しない保存は null を返す", () => {
    mock.setItem(
      scoreHistoryKey(SONG),
      JSON.stringify({
        version: 2,
        best: { totalScore: 100, percentile: 50, rank: "B", recordedAtMs: 1000 },
        recent: [],
      })
    );
    expect(loadScoreHistory(SONG)).toBeNull();
  });

  it("物体でない・null の保存は null を返す", () => {
    mock.setItem(scoreHistoryKey(SONG), JSON.stringify(42));
    expect(loadScoreHistory(SONG)).toBeNull();
    mock.setItem(scoreHistoryKey(SONG), JSON.stringify(null));
    expect(loadScoreHistory(SONG)).toBeNull();
  });

  it("自己ベストが欠落・型不正なら null を返す", () => {
    mock.setItem(
      scoreHistoryKey(SONG),
      JSON.stringify({ version: SCORE_HISTORY_VERSION, recent: [] })
    );
    expect(loadScoreHistory(SONG)).toBeNull();
    mock.setItem(
      scoreHistoryKey(SONG),
      JSON.stringify({
        version: SCORE_HISTORY_VERSION,
        best: { totalScore: "x", percentile: 50, rank: "B", recordedAtMs: 1000 },
        recent: [],
      })
    );
    expect(loadScoreHistory(SONG)).toBeNull();
  });

  it("自己ベストの数値欄が非有限なら null を返す", () => {
    for (const broken of [
      { totalScore: null, percentile: 50, rank: "B", recordedAtMs: 1000 },
      { totalScore: 100, percentile: Number.POSITIVE_INFINITY, rank: "B", recordedAtMs: 1000 },
      { totalScore: 100, percentile: 50, rank: "B", recordedAtMs: Number.NaN },
    ]) {
      mock.setItem(
        scoreHistoryKey(SONG),
        JSON.stringify({ version: SCORE_HISTORY_VERSION, best: broken, recent: [] })
      );
      expect(loadScoreHistory(SONG)).toBeNull();
    }
  });

  it("自己ベストのランクが集合外なら null を返す", () => {
    mock.setItem(
      scoreHistoryKey(SONG),
      JSON.stringify({
        version: SCORE_HISTORY_VERSION,
        best: { totalScore: 100, percentile: 50, rank: "X", recordedAtMs: 1000 },
        recent: [],
      })
    );
    expect(loadScoreHistory(SONG)).toBeNull();
  });

  it("直近履歴が配列でないなら null を返す", () => {
    mock.setItem(
      scoreHistoryKey(SONG),
      JSON.stringify({
        version: SCORE_HISTORY_VERSION,
        best: { totalScore: 100, percentile: 50, rank: "B", recordedAtMs: 1000 },
        recent: "配列ではない",
      })
    );
    expect(loadScoreHistory(SONG)).toBeNull();
  });

  it("直近履歴の不正要素だけ落とし健全分を残す", () => {
    mock.setItem(
      scoreHistoryKey(SONG),
      JSON.stringify({
        version: SCORE_HISTORY_VERSION,
        best: { totalScore: 200, percentile: 60, rank: "A", recordedAtMs: 2000 },
        recent: [
          { totalScore: 200, percentile: 60, rank: "A", recordedAtMs: 2000 },
          { totalScore: 100, percentile: 50, rank: "Z", recordedAtMs: 1000 }, // ランク不正
          { totalScore: 50, percentile: 30, rank: "C", recordedAtMs: 500 },
        ],
      })
    );
    const history = loadScoreHistory(SONG);
    expect(history).not.toBeNull();
    expect(history!.recent.map((r) => r.totalScore)).toEqual([200, 50]);
  });

  it("上限を超える保存済み直近履歴は読出で上限へ切り詰める", () => {
    const recent = Array.from({ length: SCORE_HISTORY_RECENT_MAX + 10 }, (_unused, i) => ({
      totalScore: 100,
      percentile: 50,
      rank: "B" as Rank,
      recordedAtMs: 1000 + i,
    }));
    mock.setItem(
      scoreHistoryKey(SONG),
      JSON.stringify({
        version: SCORE_HISTORY_VERSION,
        best: { totalScore: 100, percentile: 50, rank: "B", recordedAtMs: 1000 },
        recent,
      })
    );
    expect(loadScoreHistory(SONG)!.recent).toHaveLength(SCORE_HISTORY_RECENT_MAX);
  });

  it("ローカルストレージ非対応で読出は null・記録は例外を投げず保存できない", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadScoreHistory(SONG)).toBeNull();
    expect(loadBestScore(SONG)).toBeNull();
    const outcome = recordPlay(SONG, makeResult(100), 1000);
    expect(outcome.persisted).toBe(false);
    expect(outcome.isNewBest).toBe(true);
    expect(outcome.previousBest).toBeNull();
  });

  it("保存が例外を投げる環境（容量超過）でも記録は例外を投げず保存できない", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("容量超過");
      },
      removeItem: () => {},
    });
    const outcome = recordPlay(SONG, makeResult(100), 1000);
    expect(outcome.persisted).toBe(false);
  });

  it("読出が例外を投げる環境でも null を返す", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("読出失敗");
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(loadScoreHistory(SONG)).toBeNull();
  });

  it("初期化の後の読出は null、消去が例外を投げる環境でも初期化は例外を投げない", () => {
    recordPlay(SONG, makeResult(100), 1000);
    clearScoreHistory(SONG);
    expect(loadScoreHistory(SONG)).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("消去失敗");
      },
    });
    expect(() => clearScoreHistory(SONG)).not.toThrow();
  });

  it("記録時刻を省略すると現在時刻が入る", () => {
    vi.useFakeTimers();
    vi.setSystemTime(123456);
    recordPlay(SONG, makeResult(100));
    expect(loadBestScore(SONG)?.recordedAtMs).toBe(123456);
  });

  it("書込キーが曲キーから作る保存キーに一致する", () => {
    recordPlay("takeover", makeResult(100), 1000);
    expect(mock.map.has("mm2026.scoreHistory.takeover")).toBe(true);
    expect(scoreHistoryKey("takeover")).toBe("mm2026.scoreHistory.takeover");
  });

  it("非有限の総合得点を初回に記録しても保存されず読出は null", () => {
    const outcome = recordPlay(SONG, makeResult(Number.NaN), 1000);
    expect(outcome.persisted).toBe(false);
    expect(outcome.isNewBest).toBe(false);
    expect(outcome.previousBest).toBeNull();
    expect(loadScoreHistory(SONG)).toBeNull();
  });

  it("非有限の総合得点の記録は既存の自己ベストを壊さない", () => {
    recordPlay(SONG, makeResult(200), 1000);
    const outcome = recordPlay(SONG, makeResult(Number.POSITIVE_INFINITY), 2000);
    expect(outcome.persisted).toBe(false);
    expect(outcome.isNewBest).toBe(false);
    expect(outcome.previousBest?.totalScore).toBe(200);
    expect(loadBestScore(SONG)?.totalScore).toBe(200);
    expect(loadScoreHistory(SONG)!.recent.map((r) => r.totalScore)).toEqual([200]);
  });

  it("非有限の記録時刻の記録は保存されない", () => {
    recordPlay(SONG, makeResult(200), 1000);
    const outcome = recordPlay(SONG, makeResult(300), Number.POSITIVE_INFINITY);
    expect(outcome.persisted).toBe(false);
    expect(loadBestScore(SONG)?.totalScore).toBe(200);
  });
});
