// プレイ進行セッション（Issue #59）の単体検証。副作用の出口（操作音・反応光点・フレーム時刻標本・較正値）を
// 注入で擬似化し、ブラウザを使わず決定的に検証する。曲データは検証用の最小プロファイル（minimalValidProfile）を
// 基に、各シナリオで必要なフィールドだけを上書きして用いる。

import { describe, it, expect, vi } from "vitest";
import { createPlaySession, type PlaySessionDeps, type ReactionLightInput } from "./playSession";
import { minimalValidProfile } from "../profiles/schema/fixtures/minimalValidProfile";
import { createCameraTrajectory } from "../utils/cameraTrajectory";
import { DEFAULT_OBJECTIVE_CONFIG, DEFAULT_GAUGE_CONFIG } from "../scoring";
import type { SongProfile } from "../profiles/schema";
import type { Reaction } from "../input";
import type { FrameTimeSample } from "../scoring";

function makeReaction(
  slotIndex: number,
  options: { eventTimeMs?: number; normalizedX?: number; normalizedY?: number } = {},
): Reaction {
  return {
    source: "touch",
    pointerId: 1,
    normalizedX: options.normalizedX ?? 0.5,
    normalizedY: options.normalizedY ?? 0.5,
    slotIndex,
    slotCount: 7,
    colorX01: 0.5,
    eventTimeMs: options.eventTimeMs ?? 0,
  };
}

function makeFrame(musicPositionMs: number, reliableMusicTime = true): FrameTimeSample {
  // frameWallTimeMs=0 かつ Reaction.eventTimeMs=0 のとき tapMusicTimeMs は musicPositionMs に一致する。
  return { musicPositionMs, frameWallTimeMs: 0, reliableMusicTime };
}

interface Harness {
  deps: PlaySessionDeps;
  setFrame(frame: FrameTimeSample): void;
  setSlotPitches: ReturnType<typeof vi.fn>;
  playSlot: ReturnType<typeof vi.fn>;
  setDeployTimbre: ReturnType<typeof vi.fn>;
  spawn: ReturnType<typeof vi.fn>;
}

function makeHarness(profile: SongProfile, config = DEFAULT_OBJECTIVE_CONFIG): Harness {
  let frame: FrameTimeSample = makeFrame(0);
  const setSlotPitches = vi.fn<(midiNotes: readonly number[] | null) => void>();
  const playSlot = vi.fn<(slotIndex: number) => void>();
  const setDeployTimbre = vi.fn<(active: boolean) => void>();
  const spawn = vi.fn<(input: ReactionLightInput) => void>();
  const deps: PlaySessionDeps = {
    profile,
    cameraTrajectory: createCameraTrajectory(profile.camera),
    operationSound: { setSlotPitches, playSlot, setDeployTimbre },
    spawnReactionLight: spawn,
    getFrameSample: () => frame,
    getCalibrationOffsetMs: () => 0,
    config,
  };
  return {
    deps,
    setFrame: (next) => {
      frame = next;
    },
    setSlotPitches,
    playSlot,
    setDeployTimbre,
    spawn,
  };
}

describe("createPlaySession", () => {
  describe("スロット番号の起点変換", () => {
    it("1始まりのノーツのスロットに対し、0始まりへ変換したタップで音程一致（JUST）になり得点が増える", () => {
      // n0 は beatIndex 0（拍格子時刻 310）・slotIndex 3（1始まり）。判定の slot0 は 3-1=2。
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(310));
      session.onReaction(makeReaction(2, { eventTimeMs: 0 }));
      // 得点が正になる（JUST 一致でスコアが積まれる）。
      expect(session.finalResult().totalScore).toBeGreaterThan(0);
    });

    it("音程がずれたタップ（誤った slot0）では音程一致せず、JUST一致より得点が低い", () => {
      const just = makeHarness(minimalValidProfile);
      const justSession = createPlaySession(just.deps);
      justSession.reset();
      just.setFrame(makeFrame(310));
      justSession.onReaction(makeReaction(2));

      const off = makeHarness(minimalValidProfile);
      const offSession = createPlaySession(off.deps);
      offSession.reset();
      off.setFrame(makeFrame(310));
      offSession.onReaction(makeReaction(0));

      expect(justSession.finalResult().totalScore).toBeGreaterThan(
        offSession.finalResult().totalScore,
      );
    });
  });

  describe("失敗のない床", () => {
    it("判定窓外のタップでも例外なく協和音と光点を1回ずつ生む", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      // どのノーツ（拍格子時刻 310・653）からも判定窓外端90ミリ秒を超えて離れた時刻。
      h.setFrame(makeFrame(5000));
      expect(() => session.onReaction(makeReaction(4))).not.toThrow();
      expect(h.playSlot).toHaveBeenCalledTimes(1);
      expect(h.spawn).toHaveBeenCalledTimes(1);
    });

    it("再生位置が信頼できないフレームのタップでも例外なく協和音と光点を生む", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(310, false));
      expect(() => session.onReaction(makeReaction(2))).not.toThrow();
      expect(h.playSlot).toHaveBeenCalledTimes(1);
      expect(h.spawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("協和音のスロット音高", () => {
    it("プレイ開始直後にフレーム更新を経ずタップが来ても、スロット音高は反映済みで発音される", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      // reset の時点のフレーム時刻のスロット音高を反映する。時刻1500は区間 [1000,2500) で pitches=[53..]。
      h.setFrame(makeFrame(1500));
      session.reset();
      expect(h.setSlotPitches).toHaveBeenCalledWith([53, 56, 60, 65, 68, 72, 77]);
      // フレーム更新を経ずにタップ。音高は反映済みで発音される。
      session.onReaction(makeReaction(3));
      expect(h.playSlot).toHaveBeenCalledTimes(1);
    });

    it("フレームの時刻がスロット区間を跨ぐと、その区間の音高へ更新する", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      h.setFrame(makeFrame(0));
      session.reset();
      h.setSlotPitches.mockClear();
      // 区間 [0,1000) → [2500,4019) へ跨ぐと、後者の pitches=[56,60,63,68,72,75,80] へ更新する。
      session.updateFrame(3000);
      expect(h.setSlotPitches).toHaveBeenCalledWith([56, 60, 63, 68, 72, 75, 80]);
    });
  });

  describe("採点と一回性", () => {
    it("タップ総数上限を超えたタップは算入しない", () => {
      const profile: SongProfile = {
        ...minimalValidProfile,
        tapBudget: { fullPossible: 100, limit: 1 },
      };
      const h = makeHarness(profile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(310));
      session.onReaction(makeReaction(2));
      session.onReaction(makeReaction(2));
      expect(session.diagnostics().tapCount).toBe(1);
    });

    it("JUST一致タップを重ねると百分位は減らず、最終得点は増える", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(310));
      session.onReaction(makeReaction(2));
      const afterOne = session.rankGaugeState().percentile;
      const scoreOne = session.finalResult().totalScore;
      // n1（拍格子時刻 653・slotIndex 5→slot0 4）にも JUST 一致。
      h.setFrame(makeFrame(653));
      session.onReaction(makeReaction(4));
      expect(session.rankGaugeState().percentile).toBeGreaterThanOrEqual(afterOne);
      expect(session.finalResult().totalScore).toBeGreaterThan(scoreOne);
    });
  });

  describe("拍格子の範囲防御", () => {
    it("beatIndex が beats の範囲外のプロファイルは生成時に明示エラーで止まる", () => {
      const profile: SongProfile = {
        ...minimalValidProfile,
        notes: [
          {
            id: "bad",
            timeMs: 1000,
            beatIndex: 99,
            slotIndex: 3,
            pattern: "single",
            trajectoryPosition: { x: 0, y: 0, z: 0 },
          },
        ],
      };
      const h = makeHarness(profile);
      expect(() => createPlaySession(h.deps)).toThrow(/beatIndex/);
    });
  });

  describe("投下の自動発動", () => {
    // 見せ場 [1000,2000) 内の拍格子時刻1200に JUST 一致するノーツを持つプロファイル。容量1で1タップで満タンになる。
    const deployProfile: SongProfile = {
      ...minimalValidProfile,
      beats: [{ index: 0, position: 1, startTimeMs: 1200, endTimeMs: 1500, lengthInBar: 4, durationMs: 300 }],
      notes: [
        { id: "d0", timeMs: 1200, beatIndex: 0, slotIndex: 3, pattern: "single", trajectoryPosition: { x: 0, y: 0, z: 0 } },
      ],
      showcases: [{ index: 0, startTimeMs: 1000, endTimeMs: 2000, weight: 1, isClimax: true }],
      diversityZones: [],
    };
    const tinyGaugeConfig = {
      ...DEFAULT_OBJECTIVE_CONFIG,
      gauge: { ...DEFAULT_GAUGE_CONFIG, fullCapacity: 1 },
    };

    it("ゲージ満タン後、見せ場区間内のタップで投下が自動発動する", () => {
      const h = makeHarness(deployProfile, tinyGaugeConfig);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(1200));
      session.onReaction(makeReaction(2));
      expect(session.diagnostics().deployActive).toBe(true);
    });

    it("見せ場区間外で満タンになっても発動せず、ゲージを持ち越す", () => {
      // 拍格子時刻500（見せ場 [1000,2000) の外）で満タンにする。
      const outsideProfile: SongProfile = {
        ...deployProfile,
        beats: [{ index: 0, position: 1, startTimeMs: 500, endTimeMs: 800, lengthInBar: 4, durationMs: 300 }],
        notes: [
          { id: "d0", timeMs: 500, beatIndex: 0, slotIndex: 3, pattern: "single", trajectoryPosition: { x: 0, y: 0, z: 0 } },
        ],
      };
      const h = makeHarness(outsideProfile, tinyGaugeConfig);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(500));
      session.onReaction(makeReaction(2));
      expect(session.diagnostics().deployActive).toBe(false);
      expect(session.diagnostics().gaugeValue).toBe(1);
      // 見せ場区間へ入るとフレーム更新で自動発動する。
      session.updateFrame(1500);
      expect(session.diagnostics().deployActive).toBe(true);
    });

    it("適用中の投下があるあいだは、再び満タンになっても投下を再適用しない（ゲージを再消費しない）", () => {
      const h = makeHarness(deployProfile, tinyGaugeConfig);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(1200));
      session.onReaction(makeReaction(2)); // 発動。発動でゲージは0へ消費される。
      expect(session.diagnostics().deployActive).toBe(true);
      session.onReaction(makeReaction(2)); // 再び満タンへ。適用中のため再適用しない。
      expect(session.diagnostics().deployActive).toBe(true);
      // 再消費されていないため満タンのまま持ち越す。
      expect(session.diagnostics().gaugeValue).toBe(1);
    });

    it("投下区間を過ぎた時刻のタップは旧投下を解消し、満タンを保てば次の見せ場で再発動する", () => {
      // 見せ場 [1000,2000) と [2100,2500) の2つを持ち、それぞれ区間内の拍格子時刻（1200・2100）に JUST 一致する
      // ノーツを持つプロファイル。容量1で各 JUST タップ1回が満タンになる。
      const reDeployProfile: SongProfile = {
        ...deployProfile,
        beats: [
          { index: 0, position: 1, startTimeMs: 1200, endTimeMs: 1500, lengthInBar: 4, durationMs: 300 },
          { index: 1, position: 2, startTimeMs: 2100, endTimeMs: 2400, lengthInBar: 4, durationMs: 300 },
        ],
        notes: [
          { id: "d0", timeMs: 1200, beatIndex: 0, slotIndex: 3, pattern: "single", trajectoryPosition: { x: 0, y: 0, z: 0 } },
          { id: "d1", timeMs: 2100, beatIndex: 1, slotIndex: 3, pattern: "single", trajectoryPosition: { x: 0, y: 0, z: 0 } },
        ],
        showcases: [
          { index: 0, startTimeMs: 1000, endTimeMs: 2000, weight: 1, isClimax: true },
          { index: 1, startTimeMs: 2100, endTimeMs: 2500, weight: 1, isClimax: false },
        ],
      };
      const h = makeHarness(reDeployProfile, tinyGaugeConfig);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(1200));
      session.onReaction(makeReaction(2)); // 見せ場0で発動。発動でゲージは0へ消費される。
      expect(session.diagnostics().deployActive).toBe(true);
      expect(session.diagnostics().gaugeValue).toBe(0);
      // 区間 [1200,2000) を過ぎた時刻2100のタップ。旧投下が解消され、満タン後に見せ場1で再発動する。
      // 再発動はゲージを再消費するため、ゲージが0であることが「旧投下が残らず新規発動した」ことの証拠になる
      //（旧投下が残ったままなら再発動できず、満タンの1のまま持ち越すため）。
      h.setFrame(makeFrame(2100));
      session.onReaction(makeReaction(2));
      expect(session.diagnostics().deployActive).toBe(true);
      expect(session.diagnostics().gaugeValue).toBe(0);
    });

    it("投下区間内では投下音色を有効、区間を抜けると無効にする", () => {
      const h = makeHarness(deployProfile, tinyGaugeConfig);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(1200));
      session.onReaction(makeReaction(2)); // 発動（区間 [1200,2000)）。
      h.setDeployTimbre.mockClear();
      session.updateFrame(1500); // 区間内。
      expect(h.setDeployTimbre).toHaveBeenLastCalledWith(true);
      session.updateFrame(2000); // 区間の終了時刻（半開区間のため区間外）。
      expect(h.setDeployTimbre).toHaveBeenLastCalledWith(false);
    });
  });
});
