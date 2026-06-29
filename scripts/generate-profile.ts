// 曲プロファイル生成コマンド（Issue #45）。
// 音楽地図ダンプ docs/analysis/<曲キー>.songmap.json を読み、曲別の手動入力とロード元を合わせて buildProfile で
// 曲プロファイルを組み立て、検証を通れば src/profiles/<曲キー>/<曲キー>.profile.json へ書き出す。
//
// vite-node で実行する理由を先に述べる。計算の中核 buildProfile は TypeScript で src/ にあり、本コマンドはそれを
// 直接呼ぶ必要がある。node_modules には vite-node（vitest 同梱）が存在し、新規の最上位依存を増やさず TypeScript を
// Node で実行できる。本コマンドは引数解析とファイル入出力だけを担い、計算ロジックは持たない（scripts/ は型検査の
// 対象外のため、検査対象の src/ 側に計算を置く）。
//
// 実行方法:
//   npm run profile:gen            （既定で takeover を生成）
//   npx vite-node scripts/generate-profile.ts <曲キー>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { SONGS } from "../src/config/songs";
import { buildProfile, type ManualProfileInputs } from "../src/profiles/generate/buildProfile";
import { type RawSongmap } from "../src/profiles/generate/songmapAdapters";
import type { ProfileSource } from "../src/profiles/schema/profileSchema";
import { takeoverInputs } from "../src/profiles/takeover/takeoverInputs";
import { afterTheCurtainInputs } from "../src/profiles/after-the-curtain/afterTheCurtainInputs";
import { toritsukuLogyInputs } from "../src/profiles/toritsuku-logy/toritsukuLogyInputs";

// 曲別手動入力の登録表。曲を横展開するときはここへ追加する。
const MANUAL_INPUTS_BY_KEY: Record<string, ManualProfileInputs> = {
  takeover: takeoverInputs,
  "after-the-curtain": afterTheCurtainInputs,
  "toritsuku-logy": toritsukuLogyInputs,
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function main(): void {
  const candidate = process.argv[2];
  const key = candidate !== undefined && !candidate.startsWith("-") ? candidate : "takeover";

  // 未登録の曲キーは明示的に拒否する。理由を先に述べる。findSong は未登録キーで既定曲へ無言でフォールバックし、
  // 誤ったロード元を持つプロファイルを書き出す恐れがあるため、登録の有無を直接確かめる。
  const song = SONGS.find((s) => s.key === key);
  if (song === undefined) {
    fail(`未登録の曲キーです: "${key}". 登録済みの曲キー: ${SONGS.map((s) => s.key).join(", ")}`);
  }
  const manual = MANUAL_INPUTS_BY_KEY[key];
  if (manual === undefined) {
    fail(`曲別の手動入力が未登録の曲キーです: "${key}". 登録済み: ${Object.keys(MANUAL_INPUTS_BY_KEY).join(", ")}`);
  }

  const songmapPath = fileURLToPath(new URL(`../docs/analysis/${key}.songmap.json`, import.meta.url));
  let songmap: RawSongmap;
  try {
    songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`音楽地図ダンプを読めませんでした: ${songmapPath}\n${detail}`);
  }

  const source: ProfileSource = { songKey: song.key, songUrl: song.songUrl, video: song.video };
  const { profile, validation } = buildProfile({ songmap, manual, source });

  if (!validation.ok) {
    console.error(`プロファイルが検証に失敗しました（${validation.errors.length}件）:`);
    for (const e of validation.errors) {
      console.error(`  ${e.path}: ${e.message}`);
    }
    process.exit(1);
  }

  const outPath = fileURLToPath(new URL(`../src/profiles/${key}/${key}.profile.json`, import.meta.url));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  console.log(
    `生成しました: ${outPath}` +
      `（ノーツ ${profile.notes.length} 個・和音 ${profile.chords.length} 区間・見せ場 ${profile.showcases.length} 箇所・` +
      `タップ上限 ${profile.tapBudget.limit}/${profile.tapBudget.fullPossible}・テンポ ${profile.tempoBpm}）`,
  );
}

main();
