import { describe, expect, it } from "vitest";
import { withReflectionHidden } from "./reflectionExclusion";
import type { Object3D } from "three";

// visible のみを持つ最小の擬似 Object3D。withReflectionHidden は visible しか参照しないため、
// 実物の Object3D を作らずに表示状態の退避と復帰だけを決定的に検証できる。
function fakeObject(visible: boolean): Object3D {
  return { visible } as unknown as Object3D;
}

describe("withReflectionHidden", () => {
  it("反射描画の実行中は表示中の物体を非表示にし、実行後に表示へ戻す", () => {
    const a = fakeObject(true);
    const b = fakeObject(true);
    let visibleDuringRender: boolean[] = [];
    withReflectionHidden([a, b], () => {
      visibleDuringRender = [a.visible, b.visible];
    });
    // 反射描画の最中は両方とも非表示。
    expect(visibleDuringRender).toEqual([false, false]);
    // 反射描画の後は両方とも表示へ復帰。
    expect(a.visible).toBe(true);
    expect(b.visible).toBe(true);
  });

  it("元から非表示の物体には触れない（復帰で誤って表示にしない）", () => {
    const visibleOne = fakeObject(true);
    const hiddenOne = fakeObject(false);
    let hiddenDuringRender = true;
    withReflectionHidden([visibleOne, hiddenOne], () => {
      hiddenDuringRender = hiddenOne.visible;
    });
    // 元から非表示の物体は実行中も非表示のまま。
    expect(hiddenDuringRender).toBe(false);
    // 実行後も非表示のまま（本補助が表示へ戻さない）。
    expect(hiddenOne.visible).toBe(false);
    // 元から表示の物体は表示へ復帰。
    expect(visibleOne.visible).toBe(true);
  });

  it("反射描画が例外を投げても、非表示にした物体を表示へ戻す", () => {
    const a = fakeObject(true);
    expect(() =>
      withReflectionHidden([a], () => {
        throw new Error("反射描画の失敗");
      })
    ).toThrow("反射描画の失敗");
    expect(a.visible).toBe(true);
  });

  it("空の集合では何もしないが、反射描画は実行する", () => {
    let rendered = false;
    withReflectionHidden([], () => {
      rendered = true;
    });
    expect(rendered).toBe(true);
  });
});
