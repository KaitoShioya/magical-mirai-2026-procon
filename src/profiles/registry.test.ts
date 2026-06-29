import { describe, it, expect } from "vitest";
import {
  resolveSongKey,
  hasSongBundle,
  getSongBundle,
  implementedSongKeys,
} from "./registry";
import { SONGS, DEFAULT_SONG_KEY } from "../config/songs";

describe("曲プロファイルレジストリ（Issue #88 横展開）", () => {
  it("resolveSongKey は登録済みキーをそのまま返す", () => {
    expect(resolveSongKey("takeover")).toBe("takeover");
    expect(resolveSongKey("shutter-chance")).toBe("shutter-chance");
  });

  it("resolveSongKey は未実装・未知・null・空文字を既定曲へ丸める", () => {
    // "kotaete" は SONGS に存在するが implemented:false（束なし）。束が無いキーは起動曲にできないため既定曲へ退避する。
    expect(resolveSongKey("kotaete")).toBe(DEFAULT_SONG_KEY);
    expect(resolveSongKey("存在しないキー")).toBe(DEFAULT_SONG_KEY);
    expect(resolveSongKey(null)).toBe(DEFAULT_SONG_KEY);
    expect(resolveSongKey("")).toBe(DEFAULT_SONG_KEY);
  });

  it("既定曲は必ずレジストリに登録されている（退避先が存在する）", () => {
    expect(hasSongBundle(DEFAULT_SONG_KEY)).toBe(true);
  });

  it("実装済み（implemented:true）の曲はすべてレジストリに束を持つ（題名画面で開始できる曲は必ず読み込める）", () => {
    for (const song of SONGS) {
      if (song.implemented) {
        expect(hasSongBundle(song.key)).toBe(true);
      }
    }
  });

  it("レジストリの登録キーは SONGS の実装済み曲と過不足なく一致する", () => {
    const registered = [...implementedSongKeys()].sort();
    const implemented = SONGS.filter((s) => s.implemented)
      .map((s) => s.key)
      .sort();
    expect(registered).toEqual(implemented);
  });

  it("getSongBundle が返す束のプロファイルのロード元キーが引いたキーと一致する", () => {
    for (const key of implementedSongKeys()) {
      const bundle = getSongBundle(key);
      expect(bundle.profile.source.songKey).toBe(key);
    }
  });
});
