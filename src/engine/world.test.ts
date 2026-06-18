import { describe, it, expect } from "vitest";
import { createWorld } from "./world";

describe("world", () => {
  it("step で絶対ゲーム時刻と刻み回数が進む", () => {
    const world = createWorld();
    world.step(10);
    world.step(20);
    expect(world.gameTimeMs).toBe(20);
    expect(world.stepCount).toBe(2);
  });

  it("syncTo はゲーム時刻だけを即合わせ、刻み回数は変えない", () => {
    const world = createWorld();
    world.step(10);
    world.syncTo(5000);
    expect(world.gameTimeMs).toBe(5000);
    expect(world.stepCount).toBe(1);
  });

  it("reset でゲーム時刻と刻み回数が初期化される", () => {
    const world = createWorld();
    world.step(10);
    world.step(20);
    world.reset();
    expect(world.gameTimeMs).toBe(0);
    expect(world.stepCount).toBe(0);
  });
});
