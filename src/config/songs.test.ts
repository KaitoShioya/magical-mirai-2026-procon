import { describe, it, expect } from "vitest";
import { SONGS, findSong, DEFAULT_SONG_KEY } from "./songs";

// 実装済み曲の集合。M8 横展開でシャッターチャンス（Issue #88）を実装可能化し、TAKEOVER と2曲が遊べる。
const IMPLEMENTED_SONG_KEYS = ["takeover", "shutter-chance"];

describe("SONGS の実装可否", () => {
  it("TAKEOVER とシャッターチャンスが実装済みで、他4曲は未実装である", () => {
    for (const song of SONGS) {
      expect(song.implemented).toBe(IMPLEMENTED_SONG_KEYS.includes(song.key));
    }
  });

  // 不変条件。題名画面で開始できる起動既定曲が実装済みであることを固定する（曲選択は再読み込み方式で起動曲を切り替える）。
  it("実装済み曲は2曲で、既定曲 DEFAULT_SONG_KEY を含む", () => {
    const implemented = SONGS.filter((song) => song.implemented).map((song) => song.key);
    expect(implemented).toHaveLength(2);
    expect(implemented).toContain(DEFAULT_SONG_KEY);
    expect([...implemented].sort()).toEqual([...IMPLEMENTED_SONG_KEYS].sort());
  });
});

describe("findSong", () => {
  // 統括は起動時に findSong(DEFAULT_SONG_KEY) で先読みする。その曲が必ず遊べることを保証する。
  it("既定曲キーで返す曲は実装済みである", () => {
    expect(findSong(DEFAULT_SONG_KEY).implemented).toBe(true);
  });

  it("未知キーでは既定曲へ退避する", () => {
    expect(findSong("存在しないキー").key).toBe(DEFAULT_SONG_KEY);
  });
});

describe("songUrl の形式", () => {
  // 受け入れ基準「短縮URL不可」を満たすため、各 songUrl を new URL() で分解して構造を検査する。
  // 経路は /t/{曲ID}/{バージョン番号} の3区切り。曲IDは英数字、バージョン番号は数字列。
  // 短縮URL（経路が /t/{曲ID} の2区切り）や末尾の問い合わせ文字列・フラグメントの混入を取りこぼさない。
  it("6曲すべてが完全形の piapro URL である", () => {
    for (const song of SONGS) {
      const url = new URL(song.songUrl);
      expect(url.protocol).toBe("https:");
      expect(url.host).toBe("piapro.jp");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(url.pathname).toMatch(/^\/t\/[A-Za-z0-9]+\/\d+$/);
    }
  });
});
