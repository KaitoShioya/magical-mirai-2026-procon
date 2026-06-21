import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildTakeoverProfile, type TakeoverSongmap } from "./buildTakeoverProfile";
import { validateProfile } from "../schema/validateProfile";

// 生成テスト。音楽地図から組み立てて形式検査（validateProfile）を通したうえで takeover.profile.json を書き出す。
// 環境変数 GEN_TAKEOVER_PROFILE が設定されたときだけ走る。通常のテスト実行では丸ごと飛ばし、成果物JSONを
// 上書きしない。軌跡上速度の検査は常時実行の検証テスト（buildTakeoverProfile.test.ts）に集約するため、ここでは行わない。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const profileJsonPath = fileURLToPath(new URL("./takeover.profile.json", import.meta.url));

describe.skipIf(!process.env.GEN_TAKEOVER_PROFILE)("TAKEOVER曲プロファイルの生成と書き出し", () => {
  it("音楽地図から組み立てて形式検査を通し takeover.profile.json を書き出す", () => {
    const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as TakeoverSongmap;
    const profile = buildTakeoverProfile(songmap);
    const result = validateProfile(profile);
    if (!result.ok) {
      throw new Error(
        `検証に失敗したため書き出さない:\n${result.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`,
      );
    }
    writeFileSync(profileJsonPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    expect(result.ok).toBe(true);
  });
});
