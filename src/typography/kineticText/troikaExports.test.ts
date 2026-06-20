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

  it("Text の実体に sdfGlyphSize と gpuAccelerateSDF が存在する（型宣言の裏取り）", () => {
    const text = new troika.Text();
    // sdfGlyphSize は既定 null（生成時に解像度を明示設定する）、gpuAccelerateSDF は既定 true。
    expect("sdfGlyphSize" in text).toBe(true);
    expect(text.gpuAccelerateSDF).toBe(true);
    text.dispose();
  });
});

describe("troika-three-utils のエクスポート実体確認", () => {
  it("createDerivedMaterial が関数として存在する", () => {
    expect(typeof troikaUtils.createDerivedMaterial).toBe("function");
  });
});
