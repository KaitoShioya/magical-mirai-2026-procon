// 曲プロファイルのJSONスキーマ検査（Issue #96 第1層）の単体テスト。
// 対象モジュール profile-schema.mjs と schema-check.mjs を直接読み込み、ブラウザ起動部品には到達しない。
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { validate, listRegisteredChecks, resetRegistry } from "./schema-check.mjs";
import {
  SONG_PROFILE_SCHEMA,
  TAKEOVER_PROFILE_PATH,
  TAKEOVER_PROFILE_CHECK_KEY,
  AFTER_THE_CURTAIN_PROFILE_PATH,
  AFTER_THE_CURTAIN_PROFILE_CHECK_KEY,
  TORITSUKU_LOGY_PROFILE_PATH,
  TORITSUKU_LOGY_PROFILE_CHECK_KEY,
  KOTAETE_PROFILE_PATH,
  KOTAETE_PROFILE_CHECK_KEY,
  registerProfileSchemas,
} from "./profile-schema.mjs";

// コミット済み成果物を読む。検査対象そのものを入力にする。
const committed = JSON.parse(readFileSync(TAKEOVER_PROFILE_PATH, "utf8"));

// 不正値は正しい全体の複製を局所的に書き換えて作る。
// 採用理由を先に述べる。正しい全体から1点だけ崩すことで、検査が当該の崩れだけを理由に不合格化することを
// 確かめられるためである。
function clone() {
  return JSON.parse(JSON.stringify(committed));
}

describe("曲プロファイルのJSONスキーマ検査（Issue #96 第1層）", () => {
  test("達成基準: コミット済み takeover.profile.json が構造検査を通る", () => {
    const result = validate(committed, SONG_PROFILE_SCHEMA);
    // 不合格時に原因を一覧で見せるため、誤りの配列を空配列と比較する。
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("必須トップレベル項目の欠落は不合格（必須欠落の退行検知）", () => {
    const v = clone();
    delete v.showcases;
    expect(validate(v, SONG_PROFILE_SCHEMA).ok).toBe(false);
  });

  test("列挙違反は不合格", () => {
    const v = clone();
    v.musicalKey.mode = "dorian";
    expect(validate(v, SONG_PROFILE_SCHEMA).ok).toBe(false);
  });

  test("数値域違反は不合格（tonicPitchClass を範囲外の12）", () => {
    const v = clone();
    v.musicalKey.tonicPitchClass = 12;
    expect(validate(v, SONG_PROFILE_SCHEMA).ok).toBe(false);
  });

  test("非空配列違反は不合格（showcases を空配列）", () => {
    const v = clone();
    v.showcases = [];
    expect(validate(v, SONG_PROFILE_SCHEMA).ok).toBe(false);
  });

  test("文字列パターン違反は不合格（colors の色が #RRGGBB 形式でない）", () => {
    const v = clone();
    v.colors.xAxisStops[0].color = "blue";
    expect(validate(v, SONG_PROFILE_SCHEMA).ok).toBe(false);
  });
});

describe("registerProfileSchemas（曲プロファイル検査の登録・冪等）", () => {
  beforeEach(() => {
    resetRegistry();
  });

  test("両曲の検査キーとプロファイルパスを登録する", () => {
    // 件数だけを固定せず、登録キーとパスの対応を明示して確かめる。理由を先に述べる。件数のみの固定は、別の曲の登録漏れや
    // 取り違えを見逃しやすいためである。
    registerProfileSchemas();
    const checks = listRegisteredChecks();
    const byKey = new Map(checks.map((c) => [c.key, c.file]));
    expect(byKey.get(TAKEOVER_PROFILE_CHECK_KEY)).toBe(TAKEOVER_PROFILE_PATH);
    expect(byKey.get(AFTER_THE_CURTAIN_PROFILE_CHECK_KEY)).toBe(AFTER_THE_CURTAIN_PROFILE_PATH);
    expect(byKey.get(TORITSUKU_LOGY_PROFILE_CHECK_KEY)).toBe(TORITSUKU_LOGY_PROFILE_PATH);
    expect(byKey.get(KOTAETE_PROFILE_CHECK_KEY)).toBe(KOTAETE_PROFILE_PATH);
  });

  test("2回呼んでも登録は重複しない（冪等）", () => {
    registerProfileSchemas();
    const firstCount = listRegisteredChecks().length;
    registerProfileSchemas();
    expect(listRegisteredChecks()).toHaveLength(firstCount);
  });
});

// 絶対パスが実在ファイルを指すことを確かめる（起動位置に依存しない解決の確認）。
test("各曲のプロファイルパスが実在ファイルを指す", () => {
  expect(() => readFileSync(TAKEOVER_PROFILE_PATH, "utf8")).not.toThrow();
  expect(() => readFileSync(AFTER_THE_CURTAIN_PROFILE_PATH, "utf8")).not.toThrow();
  expect(() => readFileSync(TORITSUKU_LOGY_PROFILE_PATH, "utf8")).not.toThrow();
  expect(() => readFileSync(KOTAETE_PROFILE_PATH, "utf8")).not.toThrow();
});
