// TAKEOVER曲プロファイル（解析と譜面生成の結果）の実行時アクセサ。
// 生成物の JSON（takeover.profile.json）を単一の出所として取り込み、実行時バリデータで検証して
// 検証済みの SongProfile を公開する。手書きで必要値を写すと生成物との二重管理になり同一性が崩れるため、
// 生成物 JSON を直接取り込む。判定UI（落下式レーン #57）はここから notes を、本編結線（#59）は曲プロファイル
// 全体を再利用する。profiles は中核（engine 等）を import しない（依存規則 docs/decisions/architecture.md §5）。

import { validateProfile, type SongProfile } from "../schema";
import rawTakeoverProfile from "./takeover.profile.json";

function loadTakeoverProfile(): SongProfile {
  // 取り込んだ JSON は未検査の値として検証へ渡す。検証に失敗したら、不正なプロファイルで黙って起動しないよう
  // 例外を投げる（欠落・不正の一覧を添える）。
  const result = validateProfile(rawTakeoverProfile);
  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`TAKEOVER曲プロファイルの検証に失敗しました: ${summary}`);
  }
  return result.profile;
}

/** 検証済みのTAKEOVER曲プロファイル。 */
export const takeoverProfile: SongProfile = loadTakeoverProfile();
