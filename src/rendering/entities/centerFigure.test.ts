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
