import { describe, it, expect } from "vitest";
import * as troika from "troika-three-text";

// 型宣言（src/types/troika-three-text.d.ts）は実体が無くても型検査を通すため、
// 0.52.4 の実体に必要なエクスポートが存在することを実行時に確かめる。
describe("troika-three-text のエクスポート実体確認", () => {
  it("Text・BatchedText・preloadFont・createTextDerivedMaterial が関数として存在する", () => {
    expect(typeof troika.Text).toBe("function");
    expect(typeof troika.BatchedText).toBe("function");
    expect(typeof troika.preloadFont).toBe("function");
    expect(typeof troika.createTextDerivedMaterial).toBe("function");
  });
});
