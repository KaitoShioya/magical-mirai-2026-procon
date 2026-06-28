// プレイ進行セッション（Issue #59）の単体検証。副作用の出口（操作音・反応光点・フレーム時刻標本・較正値）を
// 注入で擬似化し、ブラウザを使わず決定的に検証する。曲データは検証用の最小プロファイル（minimalValidProfile）を
// 基に、各シナリオで必要なフィールドだけを上書きして用いる。

import { describe, it, expect, vi } from "vitest";
import { createPlaySession, type PlaySessionDeps, type PlaceLanternInput } from "./playSession";
import { minimalValidProfile } from "../profiles/schema/fixtures/minimalValidProfile";
import { createCameraTrajectory } from "../utils/cameraTrajectory";
import { DEFAULT_OBJECTIVE_CONFIG, DEFAULT_GAUGE_CONFIG } from "../scoring";
import { LANTERN_BUTTERFLY_FORWARD_OFFSET, LANTERN_SUNFLOWER_RADIUS_MAX } from "../config/tuning";
import type { SongProfile } from "../profiles/schema";
import type { Reaction } from "../input";
import type { FrameTimeSample } from "../scoring";

// フィクスチャ（minimalValidProfile）の固定値を直書きすると、フィクスチャ変更時に各テストが分かりにくく壊れる。
// これを避けるため、JUST 一致の基準値をフィクスチャから導出する。判定基準時刻は各ノーツの拍格子時刻
// beats[note.beatIndex].startTimeMs、判定スロット（slot0）は note.slotIndex - 1（判定の slot0 は0始まり、プロファイルの
// slotIndex は1始まり）。前提が崩れたら一目で分かるよう、これらが従来の前提値と一致することを下の確認テストで固定する。
const FIXTURE_NOTE_0 = minimalValidProfile.notes[0];
const FIXTURE_NOTE_1 = minimalValidProfile.notes[1];
const N0_JUST_TIME_MS = minimalValidProfile.beats[FIXTURE_NOTE_0.beatIndex].startTimeMs;
const N0_JUST_SLOT0 = FIXTURE_NOTE_0.slotIndex - 1;
const N1_JUST_TIME_MS = minimalValidProfile.beats[FIXTURE_NOTE_1.beatIndex].startTimeMs;
const N1_JUST_SLOT0 = FIXTURE_NOTE_1.slotIndex - 1;
// 音程がずれる（JUST 不一致の）スロット番号。n0 のスロットと必ず異なるレーンにする。
const OFF_SLOT0 = N0_JUST_SLOT0 === 0 ? 1 : 0;
// どのノーツの判定窓（外端は拍格子時刻の前後90ミリ秒）からも十分に離れた時刻。空打ち（素点0）を作るために用いる。
const NO_NOTE_TIME_MS = 5000;

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
  playSlot: ReturnType<typeof vi.fn>;
  setDeployTimbre: ReturnType<typeof vi.fn>;
  placeLantern: ReturnType<typeof vi.fn>;
  tapRipple: ReturnType<typeof vi.fn>;
}

function makeHarness(profile: SongProfile, config = DEFAULT_OBJECTIVE_CONFIG): Harness {
  let frame: FrameTimeSample = makeFrame(0);
  const playSlot = vi.fn<(slotIndex: number) => void>();
  const setDeployTimbre = vi.fn<(active: boolean) => void>();
  const placeLantern = vi.fn<(input: PlaceLanternInput) => void>();
  const tapRipple = vi.fn<(slotIndex0: number) => void>();
  const deps: PlaySessionDeps = {
    profile,
    cameraTrajectory: createCameraTrajectory(profile.camera),
    operationSound: { playSlot, setDeployTimbre },
    placeLantern,
    spawnTapRipple: tapRipple,
    getFrameSample: () => frame,
    getCalibrationOffsetMs: () => 0,
    config,
  };
  return {
    deps,
    setFrame: (next) => {
      frame = next;
    },
    playSlot,
    setDeployTimbre,
    placeLantern,
    tapRipple,
  };
}

describe("createPlaySession", () => {
  describe("フィクスチャ前提（直書き値依存の脆さを防ぐ確認）", () => {
    it("最小プロファイルから導出した JUST 基準が従来の前提値と一致する", () => {
      // フィクスチャが変わって各テストの前提が崩れたら、ここで一目で検知できる。
      expect(N0_JUST_TIME_MS).toBe(310);
      expect(N0_JUST_SLOT0).toBe(2);
      expect(N1_JUST_TIME_MS).toBe(653);
      expect(N1_JUST_SLOT0).toBe(4);
      // 音程ずれのスロットは JUST のスロットと必ず異なる。
      expect(OFF_SLOT0).not.toBe(N0_JUST_SLOT0);
    });
  });

  describe("スロット番号の起点変換", () => {
    it("1始まりのノーツのスロットに対し、0始まりへ変換したタップで音程一致（JUST）になり得点が増える", () => {
      // n0 は beatIndex 0（拍格子時刻 310）・slotIndex 3（1始まり）。判定の slot0 は 3-1=2。
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(N0_JUST_TIME_MS));
      session.onReaction(makeReaction(N0_JUST_SLOT0, { eventTimeMs: 0 }));
      // 得点が正になる（JUST 一致でスコアが積まれる）。
      expect(session.finalResult().totalScore).toBeGreaterThan(0);
    });

    it("音程がずれたタップ（誤った slot0）では音程一致せず、JUST一致より得点が低い", () => {
      const just = makeHarness(minimalValidProfile);
      const justSession = createPlaySession(just.deps);
      justSession.reset();
      just.setFrame(makeFrame(N0_JUST_TIME_MS));
      justSession.onReaction(makeReaction(2));

      const off = makeHarness(minimalValidProfile);
      const offSession = createPlaySession(off.deps);
      offSession.reset();
      off.setFrame(makeFrame(N0_JUST_TIME_MS));
      offSession.onReaction(makeReaction(OFF_SLOT0));

      expect(justSession.finalResult().totalScore).toBeGreaterThan(
        offSession.finalResult().totalScore,
      );
    });
  });

  describe("失敗のない床", () => {
    it("判定窓外のタップでも例外なく操作音を1回鳴らし、持続灯しは置かない", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      // どのノーツ（拍格子時刻 310・653）からも判定窓外端90ミリ秒を超えて離れた時刻。素点0の空打ちになる。
      h.setFrame(makeFrame(NO_NOTE_TIME_MS));
      expect(() => session.onReaction(makeReaction(4))).not.toThrow();
      expect(h.playSlot).toHaveBeenCalledTimes(1);
      // 素点0のため持続灯しは置かない（波紋も立てない）。
      expect(h.placeLantern).not.toHaveBeenCalled();
    });

    it("再生位置が信頼できないフレームのタップでも例外なく操作音を鳴らす", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(N0_JUST_TIME_MS, false));
      expect(() => session.onReaction(makeReaction(2))).not.toThrow();
      expect(h.playSlot).toHaveBeenCalledTimes(1);
    });
  });

  describe("画面全体の波紋（得点が0でないタップのみ）", () => {
    it("得点が正のタップ（ノーツに一致）で、そのレーンから波紋を立てる", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      // n0（拍格子時刻310・slot0=2）に JUST 一致するタップ。素点が正になる。
      h.setFrame(makeFrame(N0_JUST_TIME_MS));
      session.onReaction(makeReaction(N0_JUST_SLOT0, { eventTimeMs: 0 }));
      expect(h.tapRipple).toHaveBeenCalledTimes(1);
      expect(h.tapRipple).toHaveBeenCalledWith(N0_JUST_SLOT0);
    });

    it("得点0のタップ（判定窓外の空打ち）では波紋を立てない", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      // どのノーツ（拍格子時刻 310・653）からも判定窓外端90ミリ秒を超えて離れた時刻。対応ノーツが無く素点が0になる。
      h.setFrame(makeFrame(NO_NOTE_TIME_MS));
      session.onReaction(makeReaction(4));
      // 操作音は床として鳴る一方、波紋は素点0のため立てない。
      expect(h.playSlot).toHaveBeenCalledTimes(1);
      expect(h.tapRipple).not.toHaveBeenCalled();
    });
  });

  describe("持続灯しの配置（得点タップのみ）", () => {
    // 既知の定数カメラ軌跡を持つプロファイル。位置 {0,0,0}・注視点 {0,0,10}（+z を向く）で、視線方向の単位ベクトルは
    // (0,0,1) になる。得点タップの蝶の配置点は カメラ位置 + 単位ベクトル × 前方オフセット = (0,0,前方オフセット) になる。
    const forwardCameraProfile: SongProfile = {
      ...minimalValidProfile,
      camera: [
        { timeMs: 0, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 10 } },
        { timeMs: 100000, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 10 } },
      ],
    };
    // 退化カメラ軌跡（位置と注視点が一致して視線方向が定まらない）。
    const degenerateCameraProfile: SongProfile = {
      ...minimalValidProfile,
      camera: [
        { timeMs: 0, position: { x: 5, y: 5, z: 5 }, target: { x: 5, y: 5, z: 5 } },
        { timeMs: 100000, position: { x: 5, y: 5, z: 5 }, target: { x: 5, y: 5, z: 5 } },
      ],
    };

    it("得点が0でないタップでのみ持続灯しを置く（空打ちでは置かない）", () => {
      const h = makeHarness(forwardCameraProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      // 空打ち（素点0）では置かない。
      h.setFrame(makeFrame(NO_NOTE_TIME_MS));
      session.onReaction(makeReaction(4));
      expect(h.placeLantern).not.toHaveBeenCalled();
      // 得点が出るタップ（JUST 一致）では1回置く。
      h.setFrame(makeFrame(N0_JUST_TIME_MS));
      session.onReaction(makeReaction(N0_JUST_SLOT0, { eventTimeMs: 0 }));
      expect(h.placeLantern).toHaveBeenCalledTimes(1);
    });

    it("得点タップで持続灯しを1組置き、蝶の配置点はカメラ位置に前方オフセットを足した点（注視点基準でもカメラ位置そのものでもない）", () => {
      const h = makeHarness(forwardCameraProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      // n0（拍格子時刻310・slot0=2）に JUST 一致するタップ。素点が正になる。
      h.setFrame(makeFrame(N0_JUST_TIME_MS));
      session.onReaction(makeReaction(N0_JUST_SLOT0, { eventTimeMs: 0 }));
      expect(h.placeLantern).toHaveBeenCalledTimes(1);
      const arg = h.placeLantern.mock.calls[0][0] as PlaceLanternInput;
      // 視線方向 (0,0,1) × 前方オフセット を カメラ位置 (0,0,0) に足した点。
      expect(arg.butterflyPosition.x).toBeCloseTo(0, 5);
      expect(arg.butterflyPosition.y).toBeCloseTo(0, 5);
      expect(arg.butterflyPosition.z).toBeCloseTo(LANTERN_BUTTERFLY_FORWARD_OFFSET, 5);
      // カメラ位置そのもの（z=0）ではない。注視点基準（z=10）でもない。
      expect(arg.butterflyPosition.z).not.toBeCloseTo(0, 3);
      expect(arg.butterflyPosition.z).not.toBeCloseTo(10, 3);
      expect(arg.nearFade).toBe(false);
      // ひまわりは蝶の真下ではなく、ミク中心（原点）の放射状リング上に置かれる。中心からの距離は最大半径以内で、
      // 蝶の x/z（前方オフセットで z=前方オフセット）とは独立である。
      const sunflowerRadius = Math.hypot(arg.sunflowerX, arg.sunflowerZ);
      expect(sunflowerRadius).toBeGreaterThan(0);
      expect(sunflowerRadius).toBeLessThanOrEqual(LANTERN_SUNFLOWER_RADIUS_MAX + 1e-6);
    });

    it("退化カメラ（視線方向が定まらない）でも得点タップで持続灯しを置き、配置点はカメラ位置・近距離フェード対象", () => {
      const h = makeHarness(degenerateCameraProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(N0_JUST_TIME_MS));
      session.onReaction(makeReaction(N0_JUST_SLOT0, { eventTimeMs: 0 }));
      expect(h.placeLantern).toHaveBeenCalledTimes(1);
      const arg = h.placeLantern.mock.calls[0][0] as PlaceLanternInput;
      // オフセットを足さずカメラ位置 (5,5,5) に置き、近距離フェードの対象にする。
      expect(arg.butterflyPosition.x).toBeCloseTo(5, 5);
      expect(arg.butterflyPosition.y).toBeCloseTo(5, 5);
      expect(arg.butterflyPosition.z).toBeCloseTo(5, 5);
      expect(arg.nearFade).toBe(true);
    });
  });

  describe("水滴音の発音", () => {
    it("タップが来たら、そのレーン番号で水滴音を1回発音する", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      // フレーム更新を経ずにタップしても、水滴音が発音される（音はどのレーンでも同じ）。
      session.onReaction(makeReaction(3));
      expect(h.playSlot).toHaveBeenCalledTimes(1);
      expect(h.playSlot).toHaveBeenCalledWith(3);
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
      h.setFrame(makeFrame(N0_JUST_TIME_MS));
      session.onReaction(makeReaction(2));
      session.onReaction(makeReaction(2));
      expect(session.diagnostics().tapCount).toBe(1);
    });

    it("JUST一致タップを重ねると百分位は減らず、最終得点は増える", () => {
      const h = makeHarness(minimalValidProfile);
      const session = createPlaySession(h.deps);
      session.reset();
      h.setFrame(makeFrame(N0_JUST_TIME_MS));
      session.onReaction(makeReaction(2));
      const afterOne = session.rankGaugeState().percentile;
      const scoreOne = session.finalResult().totalScore;
      // n1（フィクスチャの2つ目のノーツ）にも JUST 一致。
      h.setFrame(makeFrame(N1_JUST_TIME_MS));
      session.onReaction(makeReaction(N1_JUST_SLOT0));
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
