import { describe, it, expect } from "vitest";
import { SONGS, findSong, DEFAULT_SONG_KEY } from "./songs";

// 実装済みとして遊べる課題曲の集合。横展開（Issue #91）で TAKEOVER に加えアフター・ザ・カーテンとトリツクロジーを実装した。
// 曲を増やすときはこの集合とともに、題名画面からの曲選択（selectSong）と曲依存結線の差し替えが揃っている必要がある。
const IMPLEMENTED_SONG_KEYS = ["takeover", "after-the-curtain", "toritsuku-logy"];

describe("SONGS の実装可否", () => {
  it("実装済みは TAKEOVER とアフター・ザ・カーテンとトリツクロジーの3曲で、他3曲は未実装である", () => {
    for (const song of SONGS) {
      expect(song.implemented).toBe(IMPLEMENTED_SONG_KEYS.includes(song.key));
    }
  });

  // 既定曲（統括が起動時に先読みする曲）が実装済み集合に含まれることを固定する。題名画面で曲を選ぶと統括が結線を
  // 差し替えるため、実装済みは複数になり得る。既定曲は起動直後に遊べる必要があるため実装済みであることを要求する。
  it("実装済み曲が DEFAULT_SONG_KEY を含む", () => {
    const implementedKeys = SONGS.filter((song) => song.implemented).map((song) => song.key);
    expect(implementedKeys).toContain(DEFAULT_SONG_KEY);
    expect(implementedKeys.slice().sort()).toEqual(IMPLEMENTED_SONG_KEYS.slice().sort());
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
