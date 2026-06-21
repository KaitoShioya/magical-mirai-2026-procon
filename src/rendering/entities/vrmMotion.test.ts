import { describe, it, expect } from "vitest";
import { createFixedPoseMotion } from "./vrmMotion";

describe("createFixedPoseMotion の固定ポーズ", () => {
  it("update を複数回呼んでも例外を投げない", () => {
    const motion = createFixedPoseMotion();
    expect(() => {
      motion.update(0.016);
      motion.update(0.5);
      motion.update(0);
    }).not.toThrow();
  });

  it("dispose は冪等で、複数回呼んでも例外を投げない", () => {
    const motion = createFixedPoseMotion();
    expect(() => {
      motion.dispose();
      motion.dispose();
    }).not.toThrow();
  });
});
