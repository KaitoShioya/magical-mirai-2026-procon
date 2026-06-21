import { describe, it, expect } from "vitest";
import * as troika from "troika-three-text";
import * as troikaUtils from "troika-three-utils";

// 型宣言（src/types/troika-three-text.d.ts・troika-three-utils.d.ts）は実体が無くても型検査を通すため、
// 0.52.4 の実体に必要なエクスポートが存在することを実行時に確かめる。
describe("troika-three-text のエクスポート実体確認", () => {
  it("Text・BatchedText・preloadFont・createTextDerivedMaterial が関数として存在する", () => {
    expect(typeof troika.Text).toBe("function");
    expect(typeof troika.BatchedText).toBe("function");
    expect(typeof troika.preloadFont).toBe("function");
    expect(typeof troika.createTextDerivedMaterial).toBe("function");
  });

  // Issue #31: 可読性の縁取り（stroke系）と影（outline系のずれ・ぼかし）が実体に存在することを確認する。
  // これは機能可否の判定（detectReadabilityCapability）の基礎であり、存在しなければ縁取りと影モードを使えない。
  it("Text に縁取り（stroke系）と影（outline系のずれ・ぼかし）のプロパティが存在する", () => {
    const text = new troika.Text();
    for (const key of [
      "strokeWidth",
      "strokeColor",
      "strokeOpacity",
      "outlineWidth",
      "outlineColor",
      "outlineOpacity",
      "outlineOffsetX",
      "outlineOffsetY",
      "outlineBlur",
    ]) {
      expect(key in text).toBe(true);
    }
    text.dispose();
  });

  it("Text の実体に sdfGlyphSize と gpuAccelerateSDF が存在する（型宣言の裏取り）", () => {
    const text = new troika.Text();
    // sdfGlyphSize は既定 null（生成時に解像度を明示設定する）、gpuAccelerateSDF は既定 true。
    expect("sdfGlyphSize" in text).toBe(true);
    expect(text.gpuAccelerateSDF).toBe(true);
    text.dispose();
  });

  // Issue #98: 最小表示画素ゲートが配置確定後の visibleBounds を読むため、textRenderInfo プロパティが
  // 実体に存在することを確認する。配置確定前は null で、数値構造（visibleBounds）は実ブラウザの診断と
  // ゲート本体で裏取りするため、ここでは存在のみを確認する（同テストの方針に合わせる）。
  it("Text の実体に textRenderInfo が存在する（配置確定前は null、型宣言の裏取り）", () => {
    const text = new troika.Text();
    expect("textRenderInfo" in text).toBe(true);
    expect(text.textRenderInfo).toBe(null);
    text.dispose();
  });
});

describe("troika-three-utils のエクスポート実体確認", () => {
  it("createDerivedMaterial が関数として存在する", () => {
    expect(typeof troikaUtils.createDerivedMaterial).toBe("function");
  });
});
