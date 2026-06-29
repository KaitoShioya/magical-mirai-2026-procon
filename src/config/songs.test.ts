import { describe, it, expect } from "vitest";
import { SONGS, findSong, resolveImplementedSong, DEFAULT_SONG_KEY } from "./songs";

// 実装済みの曲キー（横展開で増える）。TAKEOVER（縦切りの1曲目）とこたえて（横展開）。
const IMPLEMENTED_KEYS = ["takeover", "kotaete"];

describe("SONGS の実装可否", () => {
  it("実装済みは TAKEOVER とこたえてで、他の曲は未実装である", () => {
    for (const song of SONGS) {
      expect(song.implemented).toBe(IMPLEMENTED_KEYS.includes(song.key));
    }
  });

  // 既定曲（統括が未指定・未実装キーのときに退避する曲）が実装済みであることを固定する。
  // resolveImplementedSong は既定曲が実装済みであることに依存するため、その不変条件を保証する。
  it("実装済み曲は IMPLEMENTED_KEYS と一致し、既定曲キーを含む", () => {
    const implemented = SONGS.filter((song) => song.implemented).map((song) => song.key);
    expect(implemented.slice().sort()).toEqual(IMPLEMENTED_KEYS.slice().sort());
    expect(implemented).toContain(DEFAULT_SONG_KEY);
  });
});

describe("findSong", () => {
  // findSong は一覧表示用で実装の有無を見ない。未知キーは既定曲へ退避する。
  it("既定曲キーで返す曲は実装済みである", () => {
    expect(findSong(DEFAULT_SONG_KEY).implemented).toBe(true);
  });

  it("未知キーでは既定曲へ退避する", () => {
    expect(findSong("存在しないキー").key).toBe(DEFAULT_SONG_KEY);
  });
});

describe("resolveImplementedSong", () => {
  // 再生対象の解決は本関数が唯一の窓口。実装済みキーはその曲、未実装・未知・null は既定曲を返す。
  it("実装済みキーはその曲を返す", () => {
    expect(resolveImplementedSong("takeover").key).toBe("takeover");
    expect(resolveImplementedSong("kotaete").key).toBe("kotaete");
  });

  it("未実装キーは既定曲へ退避する", () => {
    const unimplemented = SONGS.find((song) => !song.implemented);
    expect(unimplemented).toBeDefined();
    expect(resolveImplementedSong(unimplemented!.key).key).toBe(DEFAULT_SONG_KEY);
  });

  it("未知キーと null は既定曲へ退避する", () => {
    expect(resolveImplementedSong("存在しないキー").key).toBe(DEFAULT_SONG_KEY);
    expect(resolveImplementedSong(null).key).toBe(DEFAULT_SONG_KEY);
  });

  it("返す曲は必ず実装済みである", () => {
    expect(resolveImplementedSong(null).implemented).toBe(true);
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
