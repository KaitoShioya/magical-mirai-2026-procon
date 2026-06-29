// 曲束レジストリの検査。
import { describe, expect, it } from "vitest";
import { songBundle, ALL_SONG_BUNDLES } from "./index";
import { DEFAULT_SONG_KEY } from "../config/songs";

describe("曲束レジストリ", () => {
  it("曲キーで対応する束を引ける（曲キーが一致する）", () => {
    expect(songBundle("takeover").profile.song.key).toBe("takeover");
    expect(songBundle("kotaete").profile.song.key).toBe("kotaete");
  });

  it("未登録のキーは既定曲の束へ倒す", () => {
    expect(songBundle("未登録のキー").profile.song.key).toBe(DEFAULT_SONG_KEY);
  });

  it("選べる全曲の束に takeover と kotaete を含む", () => {
    const keys = ALL_SONG_BUNDLES.map((b) => b.profile.song.key);
    expect(keys).toContain("takeover");
    expect(keys).toContain("kotaete");
  });

  it("各束が読ませる役の既定（表示単位・寸法・領域）を持つ", () => {
    for (const bundle of ALL_SONG_BUNDLES) {
      expect(bundle.defaultReadingUnit).toBe("phrase");
      expect(bundle.defaultReadingPixelHeight).toBeGreaterThan(0);
      expect(bundle.defaultReadingRegion.widthRatio).toBeGreaterThan(0);
    }
  });

  it("灯し収容上限の素となる全曲ノーツ数の最大が正の整数である", () => {
    const maxNotes = Math.max(...ALL_SONG_BUNDLES.map((b) => b.profile.notes.length));
    expect(Number.isInteger(maxNotes)).toBe(true);
    expect(maxNotes).toBeGreaterThan(0);
  });
});
