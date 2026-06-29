// 曲プロファイル束レジストリの検査。
import { describe, expect, it } from "vitest";
import { getSongBundle, selectableSongBundles } from "./index";

describe("曲プロファイル束レジストリ", () => {
  it("曲キーで対応する束を引ける（曲キーが一致する）", () => {
    expect(getSongBundle("takeover").profile.song.key).toBe("takeover");
    expect(getSongBundle("kotaete").profile.song.key).toBe("kotaete");
  });

  it("未登録のキーは明確に例外になる", () => {
    expect(() => getSongBundle("未登録のキー")).toThrow();
  });

  it("選択可能な束は2件（takeover・kotaete）である", () => {
    const keys = selectableSongBundles()
      .map((b) => b.profile.song.key)
      .sort();
    expect(keys).toEqual(["kotaete", "takeover"]);
  });

  it("各束が読ませる役の既定（表示単位・寸法・領域）を持つ", () => {
    for (const bundle of selectableSongBundles()) {
      expect(bundle.defaultReadingUnit).toBe("phrase");
      expect(bundle.defaultReadingPixelHeight).toBeGreaterThan(0);
      expect(bundle.defaultReadingRegion.widthRatio).toBeGreaterThan(0);
    }
  });

  it("灯し収容上限の素となる全曲ノーツ数の最大が正の整数である", () => {
    const maxNotes = Math.max(...selectableSongBundles().map((b) => b.profile.notes.length));
    expect(Number.isInteger(maxNotes)).toBe(true);
    expect(maxNotes).toBeGreaterThan(0);
  });
});
