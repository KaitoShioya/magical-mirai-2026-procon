// 舞台土台モデル（Issue #105）の生成。国土地理院 地理院地図の数値標高データ（model/lake/dem.csv）から、
// 地形メッシュと水面領域マーカーを持つ glTF バイナリ（public/models/stage/lake-stage_v01.glb）を書き出す。
// 元データは実測標高であり、本スクリプトは形式変換のみを行う（AI生成物でない。出典＝国土地理院）。
//
// 実行: node scripts/build-stage-model.mjs
// 入力 model/lake/ は版管理から除外（ローカル解析専用）。出力 .glb は頂点形状のみで配信対象。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demToStageMeshes, STAGE_BUILD_PARAMS } from "./lib/stage-geometry.mjs";
import { encodeGlb } from "./lib/glb.mjs";

// DEMの格子寸法。地理院ビュアー（model/lake/index.html）の vMeshSizeW=384・vMeshSizeH=301 に対し、
// 頂点格子は列(384+1)=385・行(301+1)=302 となる。
const GRID_WIDTH = 385;
const GRID_HEIGHT = 302;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(repoRoot, "model/lake/dem.csv");
const outputPath = resolve(repoRoot, "public/models/stage/lake-stage_v01.glb");

// DEMを読み、改行とカンマの両方で区切って数値列にする（実体は1行格納のため両区切りに対応する）。
const raw = readFileSync(inputPath, "utf8").trim();
const demFlat = raw.split(/[\n,]+/).map(Number);

const { meshes, meta } = demToStageMeshes(demFlat, GRID_WIDTH, GRID_HEIGHT, STAGE_BUILD_PARAMS);
const glb = encodeGlb(meshes);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, glb);

const waterBounds = meshes.find((m) => m.name === "water").extras.originalWaterBoundsWorld;
console.log("舞台土台モデルを生成しました:", outputPath);
console.log("  地形頂点数:", meta.terrainVertexCount, " 三角形数:", meta.terrainTriangleCount);
console.log(
  "  水平寸法 worldX×worldZ:",
  meta.worldX.toFixed(1),
  "×",
  meta.worldZ.toFixed(1)
);
console.log(
  "  水面重心(正規化) 列:",
  meta.waterCentroidNormalized.x.toFixed(4),
  " 行:",
  meta.waterCentroidNormalized.z.toFixed(4)
);
console.log(
  "  水面の元範囲(世界座標) X:",
  waterBounds.minX.toFixed(1),
  "〜",
  waterBounds.maxX.toFixed(1),
  " Z:",
  waterBounds.minZ.toFixed(1),
  "〜",
  waterBounds.maxZ.toFixed(1)
);
console.log("  ファイル容量(バイト):", glb.byteLength);
