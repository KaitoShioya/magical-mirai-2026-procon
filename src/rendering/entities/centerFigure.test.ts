import { describe, it, expect } from "vitest";
import { Group, Mesh, type Object3D } from "three";
import { createCenterFigure } from "./centerFigure";
import type { LoadedVrm } from "../loaders/vrmLoader";
import type { CharacterModelConfig } from "../../types/character";

// 疑似の読み込み済みVRM。update の呼び出し回数と dispose の有無を観測する。
function makeFakeLoadedVrm(): {
  loaded: LoadedVrm;
  object3d: Object3D;
  updateCount: () => number;
  disposed: () => boolean;
} {
  const object3d = new Group();
  let updates = 0;
  let isDisposed = false;
  const loaded: LoadedVrm = {
    vrm: {} as unknown as LoadedVrm["vrm"],
    object3d,
    update: () => {
      updates += 1;
    },
    dispose: () => {
      isDisposed = true;
    },
  };
  return { loaded, object3d, updateCount: () => updates, disposed: () => isDisposed };
}

const CONFIG: CharacterModelConfig = {
  url: "/models/miku/test.vrm",
  position: { x: 1, y: 2, z: 3 },
  scale: 2,
  rotationY: 0.5,
  displayName: "テスト",
  credit: {
    subject: "s",
    licenseName: "l",
    licenseUrl: "https://example.com",
    rightsHolder: "r",
    guidelineNote: "g",
  },
  provenance: "p",
};

describe("createCenterFigure の初期状態", () => {
  it("初期状態は fallback で、光柱の Mesh を1つ持つ", () => {
    const figure = createCenterFigure();
    expect(figure.status()).toBe("fallback");
    expect(figure.object3d.children).toHaveLength(1);
    expect(figure.object3d.children[0]).toBeInstanceOf(Mesh);
    figure.dispose();
  });

  it("fallback の update で光柱の不透明度が基準値から変化する", () => {
    const figure = createCenterFigure();
    const pillar = figure.object3d.children[0] as Mesh;
    const material = pillar.material as { opacity: number };
    const before = material.opacity;
    figure.update(0.5);
    expect(material.opacity).not.toBe(before);
    figure.dispose();
  });
});

describe("createCenterFigure の差し替え", () => {
  it("swapToVrm で status が loaded になり、光柱が外れVRMが子になる", () => {
    const figure = createCenterFigure();
    const fake = makeFakeLoadedVrm();
    figure.swapToVrm(fake.loaded, CONFIG);
    expect(figure.status()).toBe("loaded");
    expect(figure.object3d.children).toContain(fake.object3d);
    expect(figure.object3d.children.some((c) => c instanceof Mesh)).toBe(false);
  });

  it("swapToVrm が設定の配置・スケール・向きをVRMへ適用する", () => {
    const figure = createCenterFigure();
    const fake = makeFakeLoadedVrm();
    figure.swapToVrm(fake.loaded, CONFIG);
    expect(fake.object3d.position.x).toBe(1);
    expect(fake.object3d.position.y).toBe(2);
    expect(fake.object3d.position.z).toBe(3);
    expect(fake.object3d.scale.x).toBe(2);
    expect(fake.object3d.rotation.y).toBe(0.5);
  });

  it("loaded のあとの update はVRMの update を呼ぶ", () => {
    const figure = createCenterFigure();
    const fake = makeFakeLoadedVrm();
    figure.swapToVrm(fake.loaded, CONFIG);
    figure.update(0.016);
    expect(fake.updateCount()).toBe(1);
  });
});

describe("createCenterFigure の状態と後始末", () => {
  it("markLoadFailed は fallback を error にし、loaded は上書きしない", () => {
    const figure = createCenterFigure();
    figure.markLoadFailed();
    expect(figure.status()).toBe("error");

    const loadedFigure = createCenterFigure();
    loadedFigure.swapToVrm(makeFakeLoadedVrm().loaded, CONFIG);
    loadedFigure.markLoadFailed();
    expect(loadedFigure.status()).toBe("loaded");
  });

  it("dispose 後の swapToVrm は取り込まず、渡されたVRMを即解放する（競合ガード）", () => {
    const figure = createCenterFigure();
    figure.dispose();
    const fake = makeFakeLoadedVrm();
    figure.swapToVrm(fake.loaded, CONFIG);
    expect(fake.disposed()).toBe(true);
    expect(figure.status()).toBe("fallback");
  });

  it("dispose は冪等である", () => {
    const figure = createCenterFigure();
    expect(() => {
      figure.dispose();
      figure.dispose();
    }).not.toThrow();
  });
});

// 識別子を共有配列へ push する疑似の読み込み済みVRM。update と dispose の呼び出し順を観測する。
function makeLoggingLoadedVrm(
  events: string[],
  label: string
): { loaded: LoadedVrm; object3d: Object3D } {
  const object3d = new Group();
  const loaded: LoadedVrm = {
    vrm: {} as unknown as LoadedVrm["vrm"],
    object3d,
    update: () => {
      events.push(`${label}:update`);
    },
    dispose: () => {
      events.push(`${label}:dispose`);
    },
  };
  return { loaded, object3d };
}

describe("createCenterFigure のモーション層（Issue #93）", () => {
  it("update はモーション層を vrm.update の前に進める", () => {
    const events: string[] = [];
    const figure = createCenterFigure();
    const { loaded } = makeLoggingLoadedVrm(events, "vrm");
    figure.swapToVrm(loaded, CONFIG);
    figure.setMotion(() => ({
      update: () => events.push("motion:update"),
      dispose: () => {},
    }));
    events.length = 0;
    figure.update(0.016);
    expect(events).toEqual(["motion:update", "vrm:update"]);
  });

  it("setMotion は直前のモーションを解放し、新しいモーションへ置き換える", () => {
    const figure = createCenterFigure();
    figure.swapToVrm(makeFakeLoadedVrm().loaded, CONFIG);
    let motionADisposed = false;
    let motionBUpdates = 0;
    figure.setMotion(() => ({
      update: () => {},
      dispose: () => {
        motionADisposed = true;
      },
    }));
    figure.setMotion(() => ({
      update: () => {
        motionBUpdates += 1;
      },
      dispose: () => {},
    }));
    expect(motionADisposed).toBe(true);
    figure.update(0.016);
    expect(motionBUpdates).toBe(1);
  });

  it("setMotion の生成関数が例外を投げると、直前のモーションを保持して例外を伝える", () => {
    const events: string[] = [];
    const figure = createCenterFigure();
    const { loaded } = makeLoggingLoadedVrm(events, "vrm");
    figure.swapToVrm(loaded, CONFIG);
    let motionAUpdates = 0;
    let motionADisposed = false;
    figure.setMotion(() => ({
      update: () => {
        motionAUpdates += 1;
      },
      dispose: () => {
        motionADisposed = true;
      },
    }));
    expect(() =>
      figure.setMotion(() => {
        throw new Error("生成失敗");
      })
    ).toThrow("生成失敗");
    expect(motionADisposed).toBe(false);
    figure.update(0.016);
    expect(motionAUpdates).toBe(1);
  });

  it("VRM未読み込みのときの setMotion は生成関数を呼ばず、状態も update も安全", () => {
    const figure = createCenterFigure();
    let created = false;
    figure.setMotion(() => {
      created = true;
      return { update: () => {}, dispose: () => {} };
    });
    expect(created).toBe(false);
    expect(figure.status()).toBe("fallback");
    expect(() => figure.update(0.016)).not.toThrow();
  });

  it("後始末済みのときの setMotion は生成関数を呼ばない", () => {
    const figure = createCenterFigure();
    figure.swapToVrm(makeFakeLoadedVrm().loaded, CONFIG);
    figure.dispose();
    let created = false;
    figure.setMotion(() => {
      created = true;
      return { update: () => {}, dispose: () => {} };
    });
    expect(created).toBe(false);
  });

  it("swapToVrm の後、setMotion なしでも既定の固定ポーズで update が例外を投げない", () => {
    const figure = createCenterFigure();
    const fake = makeFakeLoadedVrm();
    figure.swapToVrm(fake.loaded, CONFIG);
    expect(() => figure.update(0.016)).not.toThrow();
    expect(fake.updateCount()).toBe(1);
  });

  it("dispose はモーション → VRM の順で解放する", () => {
    const events: string[] = [];
    const figure = createCenterFigure();
    const { loaded } = makeLoggingLoadedVrm(events, "vrm");
    figure.swapToVrm(loaded, CONFIG);
    figure.setMotion(() => ({
      update: () => {},
      dispose: () => events.push("motion:dispose"),
    }));
    figure.dispose();
    expect(events).toEqual(["motion:dispose", "vrm:dispose"]);
  });

  it("再差し替えは旧VRM・旧モーションを解放し、二度目のVRMは解放せず子は二度目のVRMのみ", () => {
    const figure = createCenterFigure();
    const first = makeFakeLoadedVrm();
    figure.swapToVrm(first.loaded, CONFIG);
    let firstMotionDisposed = false;
    figure.setMotion(() => ({
      update: () => {},
      dispose: () => {
        firstMotionDisposed = true;
      },
    }));
    const second = makeFakeLoadedVrm();
    figure.swapToVrm(second.loaded, CONFIG);
    expect(first.disposed()).toBe(true);
    expect(firstMotionDisposed).toBe(true);
    expect(second.disposed()).toBe(false);
    expect(figure.object3d.children).toContain(second.object3d);
    expect(figure.object3d.children).not.toContain(first.object3d);
    expect(figure.object3d.children.some((c) => c instanceof Mesh)).toBe(false);
  });
});
