import { describe, it, expect } from "vitest";
import { ALLOWED_TRANSITIONS, SCREEN_KEYS } from "./constants";

// 許可遷移表は純粋データのため、文書オブジェクトを使わず node 環境で検査できる。
// 表示生成と実際の遷移挙動（単一画面の維持・状態履歴）は画面遷移スモーク（scripts/screens-smoke.mjs）が確認する。
describe("ALLOWED_TRANSITIONS", () => {
  it("結果からは再挑戦と、再プレイのためのウォームアップへ進める（Issue #74）", () => {
    expect(ALLOWED_TRANSITIONS.result).toEqual(["retry", "warmup"]);
  });

  it("プレイからは結果と、一時停止の中断（トップに戻る）のための再挑戦へ進める（Issue #112）", () => {
    expect(ALLOWED_TRANSITIONS.play).toEqual(["result", "retry"]);
  });

  it("題名・ウォームアップ・再挑戦の遷移先は基本経路の一巡を保つ", () => {
    expect(ALLOWED_TRANSITIONS.title).toEqual(["warmup"]);
    expect(ALLOWED_TRANSITIONS.warmup).toEqual(["play"]);
    expect(ALLOWED_TRANSITIONS.retry).toEqual(["title"]);
  });

  it("遷移表の各遷移先は5状態のいずれかである（未知の状態へ進めない）", () => {
    const keys = new Set<string>(SCREEN_KEYS);
    for (const from of SCREEN_KEYS) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(keys.has(to)).toBe(true);
      }
    }
  });
});
