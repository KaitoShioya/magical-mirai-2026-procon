// 舞台土台モデル（Issue #105）の glTF バイナリ（.glb）符号化。依存ライブラリを使わず、位置と索引のみの
// 最小構成で .glb を組み立てる。各メッシュを node 名で持ち、位置の accessor には最小最大を必ず付け、
// 索引の整数型はそのメッシュの最大頂点番号で選ぶ（65536未満なら16ビット、以上なら32ビット符号なし整数）。
// glTF2.0 の規約に従い、各塊（チャンク）と各 bufferView を4バイト境界へ整列する。

// 要素の型を表す glTF の番号。
const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_SHORT = 5123;
const COMPONENT_UNSIGNED_INT = 5125;
// bufferView の用途を表す glTF の番号。
const TARGET_ARRAY_BUFFER = 34962; // 頂点属性
const TARGET_ELEMENT_ARRAY_BUFFER = 34963; // 索引
// .glb のチャンクの種別を表す番号（4文字を小端で並べた値）。
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"
const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;

/** nを4の倍数へ切り上げるために足す詰めの長さを返す。 */
function padTo4(n) {
  return (4 - (n % 4)) % 4;
}

/**
 * 位置と索引のみのメッシュ群から .glb を組み立て、Uint8Array で返す。
 * meshes は [{ name, positions（数値列または Float32Array）, indices（数値列）, extras? }]。
 */
export function encodeGlb(meshes) {
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  const nodes = [];
  const segments = []; // バイナリの断片（Uint8Array）。bufferView 間は4バイト整列で詰める。
  let byteOffset = 0;

  // バイト列を1つの bufferView として加える。開始位置を4バイト境界へ整列する。
  function addBufferView(bytes, target) {
    const pad = padTo4(byteOffset);
    if (pad > 0) {
      segments.push(new Uint8Array(pad));
      byteOffset += pad;
    }
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
    segments.push(bytes);
    byteOffset += bytes.byteLength;
    return index;
  }

  for (const mesh of meshes) {
    const positions =
      mesh.positions instanceof Float32Array ? mesh.positions : new Float32Array(mesh.positions);
    const vertexCount = positions.length / 3;

    // 位置の最小最大（glTF2.0 は位置の accessor に最小最大を必須とする）。
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const value = positions[i * 3 + k];
        if (value < min[k]) min[k] = value;
        if (value > max[k]) max[k] = value;
      }
    }

    const positionBytes = new Uint8Array(
      positions.buffer,
      positions.byteOffset,
      positions.byteLength
    );
    const positionView = addBufferView(positionBytes, TARGET_ARRAY_BUFFER);
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: positionView,
      componentType: COMPONENT_FLOAT,
      count: vertexCount,
      type: "VEC3",
      min,
      max,
    });

    // 索引の整数型を最大頂点番号で選ぶ。
    const maxVertexIndex = vertexCount - 1;
    let indexTypedArray;
    let indexComponentType;
    if (maxVertexIndex < 65536) {
      indexTypedArray = new Uint16Array(mesh.indices);
      indexComponentType = COMPONENT_UNSIGNED_SHORT;
    } else {
      indexTypedArray = new Uint32Array(mesh.indices);
      indexComponentType = COMPONENT_UNSIGNED_INT;
    }
    const indexBytes = new Uint8Array(
      indexTypedArray.buffer,
      indexTypedArray.byteOffset,
      indexTypedArray.byteLength
    );
    const indexView = addBufferView(indexBytes, TARGET_ELEMENT_ARRAY_BUFFER);
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView,
      componentType: indexComponentType,
      count: mesh.indices.length,
      type: "SCALAR",
    });

    const meshIndex = gltfMeshes.length;
    gltfMeshes.push({
      name: mesh.name,
      primitives: [{ attributes: { POSITION: positionAccessor }, indices: indexAccessor }],
    });
    const node = { name: mesh.name, mesh: meshIndex };
    if (mesh.extras) {
      node.extras = mesh.extras;
    }
    nodes.push(node);
  }

  const binDataLength = byteOffset;

  const gltf = {
    asset: { version: "2.0", generator: "build-stage-model" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_node, index) => index) }],
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binDataLength }],
  };

  // バイナリ塊（BINチャンク）を連結する。
  const binData = new Uint8Array(binDataLength);
  {
    let offset = 0;
    for (const segment of segments) {
      binData.set(segment, offset);
      offset += segment.byteLength;
    }
  }

  // JSON塊。UTF-8へ符号化し、4バイト境界まで空白（0x20）で詰める。
  const jsonText = JSON.stringify(gltf);
  const jsonBytesRaw = new TextEncoder().encode(jsonText);
  const jsonPad = padTo4(jsonBytesRaw.byteLength);
  const jsonChunkLength = jsonBytesRaw.byteLength + jsonPad;
  const jsonChunk = new Uint8Array(jsonChunkLength);
  jsonChunk.set(jsonBytesRaw, 0);
  jsonChunk.fill(0x20, jsonBytesRaw.byteLength); // 残りを空白で詰める

  // バイナリ塊も4バイト境界まで0で詰める。
  const binPad = padTo4(binDataLength);
  const binChunkLength = binDataLength + binPad;

  // 全体を組み立てる。先頭12バイト＋（8＋JSON塊）＋（8＋BIN塊）。
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  let p = 0;
  view.setUint32(p, GLB_MAGIC, true);
  p += 4;
  view.setUint32(p, GLB_VERSION, true);
  p += 4;
  view.setUint32(p, totalLength, true);
  p += 4;
  // JSON塊
  view.setUint32(p, jsonChunkLength, true);
  p += 4;
  view.setUint32(p, CHUNK_TYPE_JSON, true);
  p += 4;
  out.set(jsonChunk, p);
  p += jsonChunkLength;
  // BIN塊
  view.setUint32(p, binChunkLength, true);
  p += 4;
  view.setUint32(p, CHUNK_TYPE_BIN, true);
  p += 4;
  out.set(binData, p);
  // 末尾の詰め（binPad分）は0のまま。

  return out;
}
