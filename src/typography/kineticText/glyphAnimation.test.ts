// インスタンス分割文字制御（Issue #21）の単体テスト。
// 値の補間とクランプは実際のGSAPで検証する（GSAPがテスト環境で動くことは gsapTimeline.test.ts で確認済み）。
// タイムライン破棄の呼び出しと、破棄後に時刻移動を行わないことは、擬似タイムラインを注入して検証する。

import { describe, it, expect } from "vitest";
import { createGlyphAnimation, type AnimationTimeline } from "./glyphAnimation";
import type { GlyphHandle } from "./types";

/** 各メソッドの呼び出し値と回数を記録する擬似の文字取っ手。記録は返した record を直接参照する。 */
interface HandleRecord {
  positions: Array<[number, number, number]>;
  rotations: Array<[number, number, number]>;
  scales: number[];
  colors: number[];
  opacities: number[];
  releaseCount: number;
}

function createRecordingHandle(): { handle: GlyphHandle; record: HandleRecord } {
  const record: HandleRecord = {
    positions: [],
    rotations: [],
    scales: [],
    colors: [],
    opacities: [],
    releaseCount: 0,
  };
  const handle: GlyphHandle = {
    setPosition: (x, y, z): void => {
      record.positions.push([x, y, z]);
    },
    setRotation: (x, y, z): void => {
      record.rotations.push([x, y, z]);
    },
    setScale: (scale): void => {
      record.scales.push(scale);
    },
    setColor: (color): void => {
      record.colors.push(color);
    },
    setOpacity: (opacity): void => {
      record.opacities.push(opacity);
    },
    setOrientation: (): void => {},
    applyReadability: (): void => {},
    release: (): void => {
      record.releaseCount += 1;
    },
  };
  return { handle, record };
}

/** 時刻移動と破棄の回数を記録する擬似タイムライン（値の補間は行わない）。 */
interface TimelineRecord {
  times: number[];
  killCount: number;
}

function createFakeTimeline(): { timeline: AnimationTimeline; record: TimelineRecord } {
  const record: TimelineRecord = { times: [], killCount: 0 };
  const timeline: AnimationTimeline = {
    to: (): unknown => timeline,
    time: (seconds: number): unknown => {
      record.times.push(seconds);
      return timeline;
    },
    kill: (): void => {
      record.killCount += 1;
    },
  };
  return { timeline, record };
}

describe("createGlyphAnimation（インスタンス分割文字制御）", () => {
  it("大きさ・不透明度を実際のGSAPで補間し、先頭・中間・末尾で期待値になる", () => {
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(handle, {
      startTimeMs: 1000,
      durationMs: 1000,
      scale: [
        { atMs: 0, value: 1 },
        { atMs: 1000, value: 3, ease: "none" },
      ],
      opacity: [
        { atMs: 0, value: 0 },
        { atMs: 1000, value: 1, ease: "none" },
      ],
    });

    animation.applyAt(1000); // 先頭
    animation.applyAt(1500); // 中間
    animation.applyAt(2000); // 末尾

    expect(record.scales[0]).toBeCloseTo(1, 6);
    expect(record.scales[1]).toBeCloseTo(2, 6);
    expect(record.scales[2]).toBeCloseTo(3, 6);
    expect(record.opacities[0]).toBeCloseTo(0, 6);
    expect(record.opacities[1]).toBeCloseTo(0.5, 6);
    expect(record.opacities[2]).toBeCloseTo(1, 6);
  });

  it("位置を3成分まとめて補間する（複数の節目を含む）", () => {
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(handle, {
      startTimeMs: 0,
      durationMs: 2000,
      position: [
        { atMs: 0, value: { x: 0, y: 0, z: 0 } },
        { atMs: 1000, value: { x: 10, y: 0, z: 0 }, ease: "none" },
        { atMs: 2000, value: { x: 10, y: 20, z: 0 }, ease: "none" },
      ],
    });

    animation.applyAt(500); // 第1区間の中点
    animation.applyAt(1500); // 第2区間の中点

    expect(record.positions[0][0]).toBeCloseTo(5, 6);
    expect(record.positions[0][1]).toBeCloseTo(0, 6);
    expect(record.positions[1][0]).toBeCloseTo(10, 6);
    expect(record.positions[1][1]).toBeCloseTo(10, 6);
  });

  it("範囲外の再生位置では端の値に留まる（クランプ）", () => {
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(handle, {
      startTimeMs: 1000,
      durationMs: 1000,
      scale: [
        { atMs: 0, value: 2 },
        { atMs: 1000, value: 8, ease: "none" },
      ],
    });

    animation.applyAt(500); // 開始前 → 先頭値
    animation.applyAt(5000); // 終了後 → 末尾値

    expect(record.scales[0]).toBeCloseTo(2, 6);
    expect(record.scales[1]).toBeCloseTo(8, 6);
  });

  it("指定しない系統は反映しない。回転を指定しなければ setRotation を呼ばない（正対保持）", () => {
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(handle, {
      startTimeMs: 0,
      durationMs: 1000,
      scale: [{ atMs: 0, value: 1 }],
    });

    animation.applyAt(500);

    expect(record.scales.length).toBe(1);
    expect(record.rotations.length).toBe(0);
    expect(record.positions.length).toBe(0);
    expect(record.opacities.length).toBe(0);
  });

  it("回転を指定すれば setRotation を呼ぶ", () => {
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(handle, {
      startTimeMs: 0,
      durationMs: 1000,
      rotation: [
        { atMs: 0, value: { x: 0, y: 0, z: 0 } },
        { atMs: 1000, value: { x: 0, y: 0, z: Math.PI }, ease: "none" },
      ],
    });

    animation.applyAt(500);

    expect(record.rotations.length).toBe(1);
    expect(record.rotations[0][2]).toBeCloseTo(Math.PI / 2, 6);
  });

  it("phaseAt が開始前・進行中・終了後を返す", () => {
    const { handle } = createRecordingHandle();
    const animation = createGlyphAnimation(handle, {
      startTimeMs: 1000,
      durationMs: 1000,
      scale: [{ atMs: 0, value: 1 }],
    });

    expect(animation.phaseAt(999)).toBe("pending");
    expect(animation.phaseAt(1000)).toBe("active");
    expect(animation.phaseAt(1999)).toBe("active");
    expect(animation.phaseAt(2000)).toBe("finished");
  });

  it("dispose はタイムラインを破棄し、複数回呼んでも破棄は1回だけ。破棄後の applyAt は時刻移動しない", () => {
    const fake = createFakeTimeline();
    const { handle } = createRecordingHandle();
    const animation = createGlyphAnimation(
      handle,
      {
        startTimeMs: 0,
        durationMs: 1000,
        scale: [{ atMs: 0, value: 1 }],
      },
      { createTimeline: () => fake.timeline }
    );

    animation.applyAt(500);
    expect(fake.record.times.length).toBe(1);

    animation.dispose();
    animation.dispose();
    expect(fake.record.killCount).toBe(1);

    animation.applyAt(600);
    expect(fake.record.times.length).toBe(1); // 破棄後は時刻移動しない
  });

  it("finish はタイムライン破棄と文字解放をまとめ、複数回呼んでも文字解放は1回", () => {
    const fake = createFakeTimeline();
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(
      handle,
      {
        startTimeMs: 0,
        durationMs: 1000,
        scale: [{ atMs: 0, value: 1 }],
      },
      { createTimeline: () => fake.timeline }
    );

    animation.finish();
    animation.finish();

    expect(fake.record.killCount).toBe(1);
    expect(record.releaseCount).toBe(1);
  });

  it("dispose の後に finish を呼ぶと文字が1回だけ解放される", () => {
    const fake = createFakeTimeline();
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(
      handle,
      {
        startTimeMs: 0,
        durationMs: 1000,
        scale: [{ atMs: 0, value: 1 }],
      },
      { createTimeline: () => fake.timeline }
    );

    animation.dispose();
    animation.finish();

    expect(fake.record.killCount).toBe(1);
    expect(record.releaseCount).toBe(1);
  });

  it("finish の後に dispose を呼んでも解放回数は1回のままで例外が出ない", () => {
    const fake = createFakeTimeline();
    const { handle, record } = createRecordingHandle();
    const animation = createGlyphAnimation(
      handle,
      {
        startTimeMs: 0,
        durationMs: 1000,
        scale: [{ atMs: 0, value: 1 }],
      },
      { createTimeline: () => fake.timeline }
    );

    animation.finish();
    expect(() => animation.dispose()).not.toThrow();

    expect(fake.record.killCount).toBe(1);
    expect(record.releaseCount).toBe(1);
  });

  it("durationMs が正でなければ例外を投げる", () => {
    const { handle } = createRecordingHandle();
    expect(() => createGlyphAnimation(handle, { startTimeMs: 0, durationMs: 0 })).toThrow();
  });

  it("節目の時刻が範囲外または昇順でなければ例外を投げる", () => {
    const { handle } = createRecordingHandle();
    expect(() =>
      createGlyphAnimation(handle, {
        startTimeMs: 0,
        durationMs: 1000,
        scale: [
          { atMs: 0, value: 1 },
          { atMs: 1500, value: 2 }, // durationMs を超える
        ],
      })
    ).toThrow();
    expect(() =>
      createGlyphAnimation(handle, {
        startTimeMs: 0,
        durationMs: 1000,
        scale: [
          { atMs: 500, value: 1 },
          { atMs: 200, value: 2 }, // 昇順でない
        ],
      })
    ).toThrow();
  });
});
