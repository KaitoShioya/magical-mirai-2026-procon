import { describe, it, expect } from "vitest";
import { buildDiversityIndex, type DiversityNoteInput } from "./diversityIndex";
import {
  applyDeploy,
  applyTap,
  createObjectiveState,
  DEFAULT_OBJECTIVE_CONFIG,
  DEFAULT_REDUCTION_FACTOR,
  type ObjectiveConfig,
  type ObjectiveContext,
  type ObjectiveToggles,
  type ShowcaseWindow,
  type TapEvent,
} from "./objectiveFunction";
import type { JudgmentResult } from "./types";
import { finalizeScore } from "./scoreAccumulator";

// --- テスト用の素材 ---

// 判定結果を作る補助。既定は両JUST（タイミングも音程も満点）で素点 a=1.0、ゲージ加算あり。
function makeJudgment(
  boundNoteId: string | null,
  overrides: Partial<JudgmentResult> = {},
): JudgmentResult {
  const base: JudgmentResult = {
    boundNoteId,
    isFloor: boundNoteId === null,
    centeredDiffMs: 0,
    timingAccuracy: 1,
    pitchAccuracy: 1,
    timingJust: true,
    pitchJust: true,
  };
  return { ...base, ...overrides };
}

// 床タップ（対応ノーツ無し）。素点0・ゲージ加算0。
function floorJudgment(): JudgmentResult {
  return {
    boundNoteId: null,
    isFloor: true,
    centeredDiffMs: Number.NaN,
    timingAccuracy: 0,
    pitchAccuracy: 0,
    timingJust: false,
    pitchJust: false,
  };
}

function tapEvent(judgment: JudgmentResult, operationSlot0: number, musicTimeMs: number): TapEvent {
  return { judgment, operationSlot0, musicTimeMs };
}

function configWith(toggles: Partial<ObjectiveToggles>): ObjectiveConfig {
  return {
    ...DEFAULT_OBJECTIVE_CONFIG,
    toggles: { ...DEFAULT_OBJECTIVE_CONFIG.toggles, ...toggles },
  };
}

// 区間2件（theme 同じ拍オフセット0に正解スロット1、variation の同じ拍オフセット0に正解スロット2＝変化）。
const diversityNotes: DiversityNoteInput[] = [
  { id: "t0", timeMs: 100, beatIndex: 0, slotIndex: 2 }, // correctSlot0=1, 区間0, 拍オフセット0
  { id: "v0", timeMs: 2100, beatIndex: 100, slotIndex: 3 }, // correctSlot0=2, 区間1, 拍オフセット0
];
const diversityZones = [
  { startTimeMs: 0, endTimeMs: 1000 },
  { startTimeMs: 2000, endTimeMs: 3000 },
];
const showcases: ShowcaseWindow[] = [
  { index: 0, startTimeMs: 0, endTimeMs: 1000, weight: 1 },
  { index: 1, startTimeMs: 2000, endTimeMs: 3000, weight: 1 },
];

function makeContext(tapBudget = 1000): ObjectiveContext {
  return {
    diversityIndex: buildDiversityIndex(diversityNotes, diversityZones),
    showcases,
    tapBudget,
  };
}

// --- 多様性係数 D ---

describe("applyTap の多様性係数", () => {
  it("正解が変化したのに操作を前回区間と同じに繰り返すと逓減が発火する（直接の状態差で確認）", () => {
    const context = makeContext();
    // 1打目: theme の t0 を操作スロット1でタップ（区間0の拍オフセット0に操作1を記録）。
    const afterTheme = applyTap(createObjectiveState(context), tapEvent(makeJudgment("t0"), 1, 100), context);
    const baseBefore = afterTheme.score.baseTotal;
    // 2打目: variation の v0 を同じ操作スロット1でタップ。正解は1→2へ変化、操作は1→1で反復 → D=0.7。
    const afterVariation = applyTap(afterTheme, tapEvent(makeJudgment("v0"), 1, 2100), context);
    const delta = afterVariation.score.baseTotal - baseBefore;
    // 素点 a=1.0、M=1.0 のため、この打のbaseは a×D×M=0.7 になる。
    expect(delta).toBeCloseTo(DEFAULT_REDUCTION_FACTOR, 10);
  });

  it("操作を前回区間から変えれば逓減は発火しない", () => {
    const context = makeContext();
    const afterTheme = applyTap(createObjectiveState(context), tapEvent(makeJudgment("t0"), 1, 100), context);
    const baseBefore = afterTheme.score.baseTotal;
    // 2打目の操作を2に変える → 操作反復でないため D=1.0。
    const afterVariation = applyTap(afterTheme, tapEvent(makeJudgment("v0"), 2, 2100), context);
    expect(afterVariation.score.baseTotal - baseBefore).toBeCloseTo(1.0, 10);
  });

  it("多様性逓減を無効にしても操作履歴は記録される", () => {
    const context = makeContext();
    const config = configWith({ diversityReduction: false });
    const afterTheme = applyTap(createObjectiveState(context), tapEvent(makeJudgment("t0"), 4, 100), context, config);
    expect(afterTheme.zoneOperations[0].get(0)).toBe(4);
  });
});

// --- 投下倍率 M ---

describe("applyTap と applyDeploy の投下倍率", () => {
  it("投下後の見せ場区間内タップに倍率が掛かる（直接の状態差で確認）", () => {
    const context = makeContext();
    // ゲージ満タンの状態から、見せ場0の時刻100で投下 → 倍率 1+1×1=2。
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const deployed = applyDeploy(full, 100, context);
    expect(deployed.activeDeploy?.multiplier).toBeCloseTo(2, 10);
    expect(deployed.gaugeValue).toBe(0);
    // 床タップ（D=1.0、a=1.0相当の判定で確認するため両JUSTの未対応ノーツは使えないので、対応ノーツ無しでもaを持つ判定を作る）。
    const judged = makeJudgment(null, { isFloor: false, boundNoteId: null }); // 区間外でD=1.0、a=1.0
    const tapped = applyTap(deployed, tapEvent(judged, 0, 200), context);
    // base = a×D×M = 1×1×2 = 2。
    expect(tapped.score.baseTotal).toBeCloseTo(2, 10);
  });

  it("見せ場終了時刻ちょうどのタップは倍率1.0になり、適用中の投下が消える", () => {
    const context = makeContext();
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const deployed = applyDeploy(full, 100, context); // 見せ場0は [0,1000)
    const judged = makeJudgment(null, { isFloor: false });
    const tapped = applyTap(deployed, tapEvent(judged, 0, 1000), context); // 終了時刻ちょうど
    expect(tapped.score.baseTotal).toBeCloseTo(1, 10); // M=1.0
    expect(tapped.activeDeploy).toBeNull();
  });

  it("投下を無効にすると applyDeploy は状態を変えない", () => {
    const context = makeContext();
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const result = applyDeploy(full, 100, context, configWith({ deployment: false }));
    expect(result).toBe(full);
  });

  it("見せ場外の投下は状態を変えない", () => {
    const context = makeContext();
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const result = applyDeploy(full, 1500, context); // どの見せ場にも入らない
    expect(result).toBe(full);
  });

  it("空ゲージの投下は状態を変えず、適用中の投下を設定しない", () => {
    const context = makeContext();
    const empty = createObjectiveState(context); // gaugeValue=0
    const result = applyDeploy(empty, 100, context);
    expect(result).toBe(empty);
    expect(result.activeDeploy).toBeNull();
  });

  it("適用中の投下があるとき、倍率が1より大きい再投下は上書きされる", () => {
    const context = makeContext();
    const full1 = { ...createObjectiveState(context), gaugeValue: 50 };
    const first = applyDeploy(full1, 100, context); // 見せ場0
    expect(first.activeDeploy?.showcaseIndex).toBe(0);
    // ゲージを再び満タンにして見せ場1で再投下 → 上書き。
    const full2 = { ...first, gaugeValue: 50 };
    const second = applyDeploy(full2, 2100, context); // 見せ場1
    expect(second.activeDeploy?.showcaseIndex).toBe(1);
    expect(second.activeDeploy?.startedAtMusicTimeMs).toBe(2100);
    expect(second.activeDeploy?.endTimeMs).toBe(3000);
  });
});

describe("applyTap と applyDeploy の投下倍率（追加観点）", () => {
  it("投下を無効にしても、期限切れの適用中の投下は消える", () => {
    const context = makeContext();
    // 適用中の投下を持つ状態を直接組み立てる（見せ場0 [0,1000) で発動した想定）。
    const withDeploy = {
      ...createObjectiveState(context),
      activeDeploy: { showcaseIndex: 0, multiplier: 2, startedAtMusicTimeMs: 100, endTimeMs: 1000 },
    };
    // 投下を無効にし、終了時刻を過ぎた時刻でタップする。期限切れ消去はトグルに依らない。
    const tapped = applyTap(
      withDeploy,
      tapEvent(makeJudgment(null, { isFloor: false }), 0, 1500),
      context,
      configWith({ deployment: false }),
    );
    expect(tapped.activeDeploy).toBeNull();
  });

  it("発動時刻より前のタップには倍率が掛からない", () => {
    const context = makeContext();
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const deployed = applyDeploy(full, 500, context); // 見せ場0 [0,1000)、発動時刻500
    // 発動時刻500より前の時刻200でタップ → 倍率1.0、適用中の投下は残る（終了時刻前のため）。
    const tapped = applyTap(deployed, tapEvent(makeJudgment(null, { isFloor: false }), 0, 200), context);
    expect(tapped.score.baseTotal).toBeCloseTo(1, 10); // base = a×D×M = 1×1×1
    expect(tapped.activeDeploy).not.toBeNull();
  });

  it("見せ場重みが0の投下は成立しない", () => {
    const context: ObjectiveContext = {
      diversityIndex: buildDiversityIndex(diversityNotes, diversityZones),
      showcases: [{ index: 0, startTimeMs: 0, endTimeMs: 1000, weight: 0 }],
      tapBudget: 1000,
    };
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const result = applyDeploy(full, 100, context);
    expect(result).toBe(full); // 倍率 1+1×0=1 のため不成立
  });

  it("見せ場重みが負でも投下は成立しない（deploy が0以上1以下へ防御する）", () => {
    const context: ObjectiveContext = {
      diversityIndex: buildDiversityIndex(diversityNotes, diversityZones),
      showcases: [{ index: 0, startTimeMs: 0, endTimeMs: 1000, weight: -1 }],
      tapBudget: 1000,
    };
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const result = applyDeploy(full, 100, context);
    expect(result).toBe(full);
  });

  it("見せ場重みが1を超えても倍率は2で頭打ちになる（deploy が0以上1以下へ防御する）", () => {
    const context: ObjectiveContext = {
      diversityIndex: buildDiversityIndex(diversityNotes, diversityZones),
      showcases: [{ index: 0, startTimeMs: 0, endTimeMs: 1000, weight: 2 }],
      tapBudget: 1000,
    };
    const full = { ...createObjectiveState(context), gaugeValue: 50 };
    const deployed = applyDeploy(full, 100, context);
    // 満タン消費割合1.0 × 重み（1へ頭打ち）= 1。倍率 1+1=2。
    expect(deployed.activeDeploy?.multiplier).toBeCloseTo(2, 10);
  });
});

// --- 一回性（タップ総数上限） ---

describe("applyTap の一回性", () => {
  it("上限を超えたタップは得点・ゲージ・計上・操作履歴を更新しない", () => {
    const context = makeContext(2);
    let state = createObjectiveState(context);
    state = applyTap(state, tapEvent(makeJudgment("t0"), 1, 100), context);
    state = applyTap(state, tapEvent(makeJudgment("v0"), 2, 2100), context);
    expect(state.tapCount).toBe(2);
    const beforeThird = state;
    const afterThird = applyTap(state, tapEvent(makeJudgment("t0"), 1, 110), context);
    expect(afterThird).toBe(beforeThird); // 状態不変（同一参照）
  });

  it("一回性を無効にすると上限を超えても加算される", () => {
    const context = makeContext(2);
    const config = configWith({ oneShotLimit: false });
    let state = createObjectiveState(context);
    state = applyTap(state, tapEvent(makeJudgment("t0"), 1, 100), context, config);
    state = applyTap(state, tapEvent(makeJudgment("v0"), 2, 2100), context, config);
    const afterThird = applyTap(state, tapEvent(makeJudgment(null, { isFloor: false }), 0, 2500), context, config);
    expect(afterThird.tapCount).toBe(3);
    expect(afterThird.score.baseTotal).toBeGreaterThan(state.score.baseTotal);
  });

  it("上限が0以下なら一回性有効時に全タップが不算入になる", () => {
    const context = makeContext(0);
    const state = createObjectiveState(context);
    const after = applyTap(state, tapEvent(makeJudgment("t0"), 1, 100), context);
    expect(after).toBe(state);
  });

  it("上限が非有限値なら0として扱い全タップが不算入になる", () => {
    const context = makeContext(Number.NaN);
    const state = createObjectiveState(context);
    const after = applyTap(state, tapEvent(makeJudgment("t0"), 1, 100), context);
    expect(after).toBe(state);
  });
});

// --- 床タップ ---

describe("applyTap の床タップ", () => {
  it("床タップは計上数を1増やし、ゲージを増やさず、素点0で合成へ流れる", () => {
    const context = makeContext();
    const state = createObjectiveState(context);
    const after = applyTap(state, tapEvent(floorJudgment(), 3, 500), context);
    expect(after.tapCount).toBe(1);
    expect(after.gaugeValue).toBe(0);
    expect(after.score.baseTotal).toBe(0);
  });
});

// --- 不変更新 ---

describe("applyTap の不変更新", () => {
  it("入力状態の操作履歴の写像を破壊的に書き換えない", () => {
    const context = makeContext();
    const state = createObjectiveState(context);
    const originalMap = state.zoneOperations[0];
    expect(originalMap.size).toBe(0);
    const after = applyTap(state, tapEvent(makeJudgment("t0"), 3, 100), context);
    // 元の写像は空のまま。新状態の写像だけが更新される。
    expect(originalMap.size).toBe(0);
    expect(after.zoneOperations[0].get(0)).toBe(3);
    expect(after.zoneOperations[0]).not.toBe(originalMap);
  });
});

// --- 受け入れ基準: 3要素ON/OFFで総合得点が変化する ---

describe("受け入れ基準: 3要素のON/OFFで総合得点が変化する", () => {
  it("多様性逓減のON/OFFで総合得点が変化する", () => {
    const context = makeContext();
    const sequence = [tapEvent(makeJudgment("t0"), 1, 100), tapEvent(makeJudgment("v0"), 1, 2100)];
    const run = (config: ObjectiveConfig) =>
      finalizeScore(
        sequence.reduce((state, event) => applyTap(state, event, context, config), createObjectiveState(context)).score,
        config.score,
      ).total;
    const on = run(configWith({ diversityReduction: true }));
    const off = run(configWith({ diversityReduction: false }));
    expect(on).toBeLessThan(off);
  });

  it("投下のON/OFFで総合得点が変化する", () => {
    const context = makeContext();
    const run = (config: ObjectiveConfig) => {
      let state = { ...createObjectiveState(context), gaugeValue: 50 };
      state = applyDeploy(state, 100, context, config);
      state = applyTap(state, tapEvent(makeJudgment(null, { isFloor: false }), 0, 200), context, config);
      return finalizeScore(state.score, config.score).total;
    };
    const on = run(configWith({ deployment: true }));
    const off = run(configWith({ deployment: false }));
    expect(on).toBeGreaterThan(off);
  });

  it("一回性のON/OFFで総合得点が変化する", () => {
    const context = makeContext(2);
    const events = [
      tapEvent(makeJudgment("t0"), 1, 100),
      tapEvent(makeJudgment("v0"), 2, 2100),
      tapEvent(makeJudgment(null, { isFloor: false }), 0, 2500),
    ];
    const run = (config: ObjectiveConfig) =>
      finalizeScore(
        events.reduce((state, event) => applyTap(state, event, context, config), createObjectiveState(context)).score,
        config.score,
      ).total;
    const on = run(configWith({ oneShotLimit: true }));
    const off = run(configWith({ oneShotLimit: false }));
    expect(on).toBeLessThan(off);
  });
});
