// シャッターチャンス曲プロファイル（解析と譜面生成の結果）の実行時アクセサ（Issue #88 横展開）。
// 生成物の JSON（shutter-chance.profile.json）を単一の出所として取り込み、実行時バリデータで検証して
// 検証済みの SongProfile を公開する。手書きで必要値を写すと生成物との二重管理になり同一性が崩れるため、
// 生成物 JSON を直接取り込む。profiles は中核（engine 等）を import しない（依存規則 docs/decisions/architecture.md §5）。
// TAKEOVER の profile.ts と同じ構造に倣う。

import { validateProfile, type SongProfile } from "../schema";
import rawShutterChanceProfile from "./shutter-chance.profile.json";

function loadShutterChanceProfile(): SongProfile {
  // 取り込んだ JSON は未検査の値として検証へ渡す。検証に失敗したら、不正なプロファイルで黙って起動しないよう
  // 例外を投げる（欠落・不正の一覧を添える）。
  const result = validateProfile(rawShutterChanceProfile);
  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`シャッターチャンス曲プロファイルの検証に失敗しました: ${summary}`);
  }
  return result.profile;
}

/** 検証済みのシャッターチャンス曲プロファイル。 */
export const shutterChanceProfile: SongProfile = loadShutterChanceProfile();
