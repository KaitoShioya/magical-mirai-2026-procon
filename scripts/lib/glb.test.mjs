import { describe, it, expect } from "vitest";
import { encodeGlb } from "./glb.mjs";

// .glb のJSON部を取り出して解析する補助。先頭12バイトのヘッダの後に、長さ・種別付きのチャンクが続く。
function decodeGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const total = view.getUint32(8, true);
  const jsonLen = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  const jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen));
  const json = JSON.parse(jsonText);
  const binHeader = 20 + jsonLen;
  const binLen = view.getUint32(binHeader, true);
  const binType = view.getUint32(binHeader + 4, true);
  return { magic, version, total, jsonLen, jsonType, json, binLen, binType };
}

// 三角形1枚の最小メッシュを作る補助。
function triangleMesh(name, vertexCount = 3, extras) {
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    positions[i * 3] = i;
    positions[i * 3 + 1] = i * 0.5;
    positions[i * 3 + 2] = -i;
  }
  return { name, positions, indices: [0, 1, 2], extras };
}

describe("encodeGlb（依存なしの glTF バイナリ符号化）", () => {
  it("正しい先頭識別子・版・全長を持つ", () => {
    const glb = encodeGlb([triangleMesh("terrain"), triangleMesh("water")]);
    const d = decodeGlb(glb);
    expect(d.magic).toBe(0x46546c67); // "glTF"
    expect(d.version).toBe(2);
    expect(d.total).toBe(glb.byteLength);
  });

  it("JSON塊とバイナリ塊が4バイト境界に整列する", () => {
    const glb = encodeGlb([triangleMesh("terrain"), triangleMesh("water")]);
    const d = decodeGlb(glb);
    expect(d.jsonLen % 4).toBe(0);
    expect(d.binLen % 4).toBe(0);
    expect(d.jsonType).toBe(0x4e4f534a); // "JSON"
    expect(d.binType).toBe(0x004e4942); // "BIN\0"
  });

  it("各 bufferView の開始位置が4バイト境界に整列する", () => {
    const glb = encodeGlb([triangleMesh("terrain"), triangleMesh("water")]);
    const { json } = decodeGlb(glb);
    for (const bufferView of json.bufferViews) {
      expect(bufferView.byteOffset % 4).toBe(0);
    }
  });

  it("位置の accessor は最小最大を持つ", () => {
    const glb = encodeGlb([triangleMesh("terrain")]);
    const { json } = decodeGlb(glb);
    const positionAccessor = json.accessors[0];
    expect(positionAccessor.type).toBe("VEC3");
    expect(positionAccessor.min).toHaveLength(3);
    expect(positionAccessor.max).toHaveLength(3);
  });

  it("node 名と extras を保持する", () => {
    const extras = { originalWaterBoundsWorld: { minX: -1, maxX: 1, minZ: -2, maxZ: 2, y: -0.05 } };
    const glb = encodeGlb([triangleMesh("terrain"), triangleMesh("water", 3, extras)]);
    const { json } = decodeGlb(glb);
    expect(json.nodes.map((n) => n.name)).toEqual(["terrain", "water"]);
    expect(json.nodes.find((n) => n.name === "water").extras).toEqual(extras);
  });

  it("索引の整数型を最大頂点番号で選ぶ（65536未満は16ビット）", () => {
    const glb = encodeGlb([triangleMesh("terrain", 3)]);
    const { json } = decodeGlb(glb);
    // 索引 accessor は2番目。componentType 5123 = UNSIGNED_SHORT。
    expect(json.accessors[1].componentType).toBe(5123);
  });

  it("索引の整数型を最大頂点番号で選ぶ（頂点65536個=最大番号65535は16ビットに収まる）", () => {
    const glb = encodeGlb([triangleMesh("terrain", 65536)]);
    const { json } = decodeGlb(glb);
    expect(json.accessors[1].componentType).toBe(5123); // UNSIGNED_SHORT
  });

  it("索引の整数型を最大頂点番号で選ぶ（頂点65537個=最大番号65536は32ビットになる）", () => {
    const glb = encodeGlb([triangleMesh("terrain", 65537)]);
    const { json } = decodeGlb(glb);
    expect(json.accessors[1].componentType).toBe(5125); // UNSIGNED_INT
  });

  it("buffers[0].byteLength がバイナリ塊のデータ長と一致する", () => {
    const glb = encodeGlb([triangleMesh("terrain"), triangleMesh("water")]);
    const { json, binLen } = decodeGlb(glb);
    // buffers の宣言長は詰めを除いた実データ長。BIN塊の宣言長は4バイト整列のため等しいか最大3バイト大きい。
    expect(binLen - json.buffers[0].byteLength).toBeGreaterThanOrEqual(0);
    expect(binLen - json.buffers[0].byteLength).toBeLessThan(4);
  });
});
