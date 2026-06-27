import { describe, it, expect } from "vitest";
import { AmbientLight, DirectionalLight, HemisphereLight } from "three";
import { createNightLighting } from "./lighting";

describe("createNightLighting の組み立て", () => {
  // 構成は淡い環境光1灯・リムライト1灯・半球光1灯の計3灯であることを固定する（Issue #205 で半球光を追加）。
  // 世界観を保つためこれ以上は増やさない。半球光は遠景の陸地を可視化する。
  it("環境光1灯・リムライト1灯・半球光1灯の3灯を持つ", () => {
    const lighting = createNightLighting();
    const children = lighting.object3d.children;
    expect(children).toHaveLength(3);
    expect(children.filter((c) => c instanceof AmbientLight)).toHaveLength(1);
    expect(children.filter((c) => c instanceof DirectionalLight)).toHaveLength(1);
    expect(children.filter((c) => c instanceof HemisphereLight)).toHaveLength(1);
    lighting.dispose();
  });

  // 強さは正でなければ照明として働かない。深夜の暗さを壊さないため、環境光と半球光は控えめ（1未満）に保つ。
  // 半球光は地形がブルーム下限を超えないよう特に控えめ（上限の目安0.35以下）にする。
  it("環境光と半球光は控えめな正の強さ、リムライトは正の強さである", () => {
    const lighting = createNightLighting();
    const ambient = lighting.object3d.children.find(
      (c): c is AmbientLight => c instanceof AmbientLight
    );
    const rim = lighting.object3d.children.find(
      (c): c is DirectionalLight => c instanceof DirectionalLight
    );
    const hemisphere = lighting.object3d.children.find(
      (c): c is HemisphereLight => c instanceof HemisphereLight
    );
    expect(ambient).toBeDefined();
    expect(rim).toBeDefined();
    expect(hemisphere).toBeDefined();
    expect(ambient!.intensity).toBeGreaterThan(0);
    expect(ambient!.intensity).toBeLessThan(1);
    expect(rim!.intensity).toBeGreaterThan(0);
    expect(hemisphere!.intensity).toBeGreaterThan(0);
    expect(hemisphere!.intensity).toBeLessThanOrEqual(0.35);
    lighting.dispose();
  });

  // リムライトは原点のモデルの背面（z<0）かつ上方（y>0）に置く。輪郭を縁取る効果はこの配置で生じる。
  it("リムライトは背後上方に置かれる", () => {
    const lighting = createNightLighting();
    const rim = lighting.object3d.children.find(
      (c): c is DirectionalLight => c instanceof DirectionalLight
    );
    expect(rim!.position.z).toBeLessThan(0);
    expect(rim!.position.y).toBeGreaterThan(0);
    lighting.dispose();
  });

  // 後始末は二重に呼んでも問題が起きないこと（冪等）を固定する。
  it("dispose は冪等である", () => {
    const lighting = createNightLighting();
    expect(() => {
      lighting.dispose();
      lighting.dispose();
    }).not.toThrow();
  });
});
