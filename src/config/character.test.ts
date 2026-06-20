import { describe, it, expect } from "vitest";
import { MIKU_CHARACTER, PCL_CREDIT } from "./character";

describe("MIKU_CHARACTER の配信先", () => {
  // url は public/ 直下を基準とする配信パスでなければ、ビルド成果物から読み込めない。
  // 配信ディレクトリは public/ のみであり、public/models/ に置いた実体を /models/ から引く。
  it("public/ 配信を指す絶対パスで、拡張子が .vrm である", () => {
    expect(MIKU_CHARACTER.url.startsWith("/models/")).toBe(true);
    expect(MIKU_CHARACTER.url.endsWith(".vrm")).toBe(true);
  });
});

describe("MIKU_CHARACTER の配置値", () => {
  // 配置・スケールは描画に渡るため、非有限値や0以下のスケールが混じると表示が壊れる。
  it("配置は有限値で、スケールは正である", () => {
    const { x, y, z } = MIKU_CHARACTER.position;
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
    expect(MIKU_CHARACTER.scale).toBeGreaterThan(0);
    expect(Number.isFinite(MIKU_CHARACTER.rotationY)).toBe(true);
  });

  // 来歴はAIが生成したモデルでないことの記録であり、規約適合の確認に用いるため空にしない。
  it("来歴が記録されている", () => {
    expect(MIKU_CHARACTER.provenance.length).toBeGreaterThan(0);
  });
});

describe("PCL_CREDIT の必須4要素", () => {
  // 出典の必須4要素（描いた旨・ライセンス名・ライセンスのアドレス・権利者の社名・ガイドライン遵守の旨）が
  // すべて非空であることを固定する。空の要素があると常時表示が要件を満たさない。
  it("すべての要素が非空である", () => {
    expect(PCL_CREDIT.subject.length).toBeGreaterThan(0);
    expect(PCL_CREDIT.licenseName.length).toBeGreaterThan(0);
    expect(PCL_CREDIT.licenseUrl.length).toBeGreaterThan(0);
    expect(PCL_CREDIT.rightsHolder.length).toBeGreaterThan(0);
    expect(PCL_CREDIT.guidelineNote.length).toBeGreaterThan(0);
  });

  // ライセンスのアドレスは外部から参照可能な絶対URLでなければ出典として機能しない。
  it("ライセンスのアドレスが https の絶対URLである", () => {
    const url = new URL(PCL_CREDIT.licenseUrl);
    expect(url.protocol).toBe("https:");
  });

  // 設定の出典と MIKU_CHARACTER の出典が同一であることを固定し、表示と設定の食い違いを防ぐ。
  it("MIKU_CHARACTER の出典は PCL_CREDIT である", () => {
    expect(MIKU_CHARACTER.credit).toBe(PCL_CREDIT);
  });
});
