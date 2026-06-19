import { describe, it, expect } from "vitest";
import { SONGS, findSong, DEFAULT_SONG_KEY } from "./songs";

describe("SONGS の実装可否", () => {
  it("TAKEOVER だけが実装済みで、他5曲は未実装である", () => {
    for (const song of SONGS) {
      expect(song.implemented).toBe(song.key === "takeover");
    }
  });

  // 最小ゲート方式の不変条件。実装済み曲が既定曲（統括が先読みする曲）と一致することを固定する。
  // 将来 M8 で2曲目を実装可能にするときは、切替ロードの導入と本テストの更新が同時に必要になる。
  it("実装済み曲はちょうど1曲で、そのキーが DEFAULT_SONG_KEY と一致する", () => {
    const implemented = SONGS.filter((song) => song.implemented);
    expect(implemented).toHaveLength(1);
    expect(implemented[0].key).toBe(DEFAULT_SONG_KEY);
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
