// 世界最後の音楽隊 曲プロファイル（解析と譜面生成の結果）の実行時アクセサ。
// 生成物の JSON（sekai-saigo.profile.json）を単一の出所として取り込み、実行時バリデータで検証して
// 検証済みの SongProfile を公開する。手書きで必要値を写すと生成物との二重管理になり同一性が崩れるため、
// 生成物 JSON を直接取り込む（TAKEOVER の profile.ts と同形）。profiles は中核（engine 等）を import しない
// （依存規則 docs/decisions/architecture.md §5）。

import { validateProfile, type SongProfile } from "../schema";
import rawSekaiSaigoProfile from "./sekai-saigo.profile.json";

function loadSekaiSaigoProfile(): SongProfile {
  // 取り込んだ JSON は未検査の値として検証へ渡す。検証に失敗したら、不正なプロファイルで黙って起動しないよう
  // 例外を投げる（欠落・不正の一覧を添える）。
  const result = validateProfile(rawSekaiSaigoProfile);
  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`世界最後の音楽隊 曲プロファイルの検証に失敗しました: ${summary}`);
  }
  return result.profile;
}

/** 検証済みの 世界最後の音楽隊 曲プロファイル。 */
export const sekaiSaigoProfile: SongProfile = loadSekaiSaigoProfile();
