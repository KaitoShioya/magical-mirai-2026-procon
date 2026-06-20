import { describe, it, expect } from "vitest";

import { buildCreditRegistry } from "./registry";
import { PCL_CREDIT } from "../../config/character";
import { DEFAULT_SONG_KEY, findSong } from "../../config/songs";

// 外部から参照できることを保証するための、https で始まる絶対アドレスの判定。
const HTTPS_ABSOLUTE = /^https:\/\/\S+$/;

describe("buildCreditRegistry（クレジットの集約）", () => {
  const song = findSong(DEFAULT_SONG_KEY);
  const registry = buildCreditRegistry(song);

  it("ミクの5要素がいずれも空でない（漏れがあると規定文言が欠けるため）", () => {
    const c = registry.character;
    for (const value of [
      c.subject,
      c.licenseName,
      c.licenseUrl,
      c.rightsHolder,
      c.guidelineNote,
    ]) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("フォントの6要素がいずれも空でない", () => {
    expect(registry.fonts.length).toBeGreaterThan(0);
    for (const font of registry.fonts) {
      for (const value of [
        font.fontName,
        font.author,
        font.sourceLabel,
        font.sourceUrl,
        font.license,
        font.licenseFileUrl,
      ]) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("使用楽曲の3要素がいずれも空でない", () => {
    expect(registry.songs.length).toBeGreaterThan(0);
    for (const entry of registry.songs) {
      for (const value of [entry.title, entry.artist, entry.sourceUrl]) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("AI不使用の明示が空でない", () => {
    expect(registry.provenance.length).toBeGreaterThan(0);
  });

  it("外部アドレス（ミクのライセンス・楽曲の出所・フォントの配布元）は https で始まる絶対アドレス", () => {
    expect(registry.character.licenseUrl).toMatch(HTTPS_ABSOLUTE);
    for (const entry of registry.songs) {
      expect(entry.sourceUrl).toMatch(HTTPS_ABSOLUTE);
    }
    for (const font of registry.fonts) {
      expect(font.sourceUrl).toMatch(HTTPS_ABSOLUTE);
    }
  });

  it("フォントのライセンス本文の場所は / で始まるルート相対のパス（外部アドレスではないため別基準で確かめる）", () => {
    for (const font of registry.fonts) {
      expect(font.licenseFileUrl.startsWith("/")).toBe(true);
    }
  });

  it("使用楽曲の出所のアドレスが、実際にロードする既定曲の songUrl と完全一致する", () => {
    expect(registry.songs[0]?.sourceUrl).toBe(song.songUrl);
  });

  it("ミクの権利者の表記にクリプトンの社名が含まれる（規約が社名の表示を求めるため）", () => {
    expect(registry.character.rightsHolder).toContain("Crypton");
  });

  it("ミクの出典は元データ PCL_CREDIT と同一の参照である（二重定義を避けるため）", () => {
    expect(registry.character).toBe(PCL_CREDIT);
  });
});
