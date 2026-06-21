// 舞台土台モデル（Issue #105）の幾何生成。国土地理院の数値標高データ（DEM）の平らな数値列から、
// 地形メッシュ（陸地と水底を含む高さ付きの面）と、水面領域の識別用マーカー（水平な矩形）を生成する。
// three.js を使わない素のJavaScriptで、単体検証できるようにする（依存規則 docs/decisions/architecture.md）。
// 数値の意味と採用理由は docs のプランおよび各定数の注釈に従う。

/**
 * 変換のパラメータ。各値は採用理由を先に述べる。
 * これらは build-stage-model.mjs と単体テストが共有する。
 */
export const STAGE_BUILD_PARAMS = {
  // 水面の基準標高（実際の湖の水面標高に合わせる）。採用理由を先に述べる。DEMの標高分布を解析すると、
  // 全セルの約49パーセントが標高ちょうど0に集中し（中央値0.027、中央セルも0）、これが実際の湖の水面標高である。
  // 平坦な水面（標高0付近）と、そこから立ち上がる岸・陸地を分ける等高線をこの値に採る。これ以下は水面下
  // （湖底へ刻む）、上は岸・陸地（高さが正で水面上に現れる）になる。0.15では実際の水面より高く、標高0.05〜0.15の
  // なだらかな岸を水没させてしまうため、水面標高に近い0.05を採る。
  waterLevel: 0.05,
  // 高さの拡大率。採用理由を先に述べる。実際の起伏（水面基準からの標高差は最大3.382）は水平方向の広がりに
  // 対しほぼ平坦で囲んで見えず、過大だと崖になる。湖を大きくした分（後述 worldSize=600）に合わせ、陸地の
  // 最高部がミク（高さ約4.2ワールド単位）の約5倍（約20ワールド単位）になり、広い湖を囲む稜線として見え、
  // 水平寸法に対しては緩やかな（現実の湖岸に近い）傾斜になる値として6を採る（3.382×6で20.3）。
  verticalScale: 6,
  // 水平の代表寸法。採用理由を先に述べる。DEMの長辺（列方向385）をこのワールド単位へ写す。ミク（人の大きさ、
  // 設定スケール3で高さ約4.2ワールド単位）に対し、現実の湖と人の比率に近づけて広い湖に立つ一点として見せる
  // ため、長辺を600とする（ミクは長辺の約0.7パーセント）。短辺は縦横比を保つ。
  worldSize: 600,
  // 水平方向の格子間引き間隔。採用理由を先に述べる。全頂点（約11.6万）は背景の土台に過剰で、平面反射は
  // 世界を再描画するため頂点負荷が二重に効く。携帯端末で毎秒60フレームを保つ予算へ収めるため2を採る
  // （縦横を1つおきに採り約2.9万頂点）。最終行・最終列は必ず標本へ含める。
  gridStride: 2,
  // 水面領域マーカーの一辺の倍率（長辺の代表寸法に対する）。採用理由を先に述べる。開いた側で水面が陸地
  // （長辺の半分＝300ワールド単位）の外まで届く必要がある一方、暫定カメラの遠方面（カメラから500ワールド
  // 単位）を超えると打ち切りで端が直線に切れる。長辺600×1.3で一辺780、原点からの最大半辺は対角で
  // 約496ワールド単位となり遠方面500の内側に収まり、かつ陸地の外へ十分に延びるため1.3を採る。
  waterExtentFactor: 1.3,
  // 水面領域マーカーの高さ。採用理由を先に述べる。陸地の付け根（標高=0.15、高さ0）よりわずかに下の-0.05に
  // 置き、水面が陸地の付け根の直下に来るようにする。
  waterPlaneY: -0.05,
  // 湖底の刻み込みの深さ（水面より下のセルを、水面からこの分だけ下げた平らな湖底に置く）。採用理由を先に
  // 述べる。水没域を緩い傾斜のまま残すと、平らな水面と水没域が水際付近の広い帯でほぼ同じ高さになり、描画順が
  // 定まらず点滅する（深度の競合、z-fighting）。水没域を水面より明確に低い平らな湖底へ刻むと、地形が水面を
  // 横切るのは陸地と湖底の間の急峻な水際の壁のみになり、点滅する帯が消え、陸地が水面より明確に上に立つ。
  // 値2.0は、水際の壁を十分に急峻にしつつ、湖底を不自然に深くしない深さとして採る（水面-0.05に対し湖底-2.05）。
  lakebedDepth: 2.0,
};

/**
 * 0からn-1までの番号を、間隔strideで標本化した配列を返す。最後の番号（n-1）を必ず含める。
 * 採用理由を先に述べる。間引きで端の行・列を落とすと地形の境界・見えに差が出るため、末尾を必ず加える。
 */
export function sampleIndices(n, stride) {
  const out = [];
  for (let i = 0; i < n; i += stride) {
    out.push(i);
  }
  if (out[out.length - 1] !== n - 1) {
    out.push(n - 1);
  }
  return out;
}

/**
 * 標高0.15以下のセル（水面）の重心を、中央を0・端を±0.5とする正規化座標で返す。
 * 採用理由を先に述べる。湖の中心（舞台の固定点、ミクを置く点）を水面の重心に合わせて原点へ写すため、
 * 水面領域の重心位置を求める。列方向（X）と行方向（Z）の双方を返す。
 */
export function waterCentroidNormalized(demFlat, gridW, gridH, waterLevel) {
  let sumColNorm = 0;
  let sumRowNorm = 0;
  let count = 0;
  for (let r = 0; r < gridH; r += 1) {
    for (let c = 0; c < gridW; c += 1) {
      if (demFlat[r * gridW + c] <= waterLevel) {
        sumColNorm += c / (gridW - 1) - 0.5;
        sumRowNorm += r / (gridH - 1) - 0.5;
        count += 1;
      }
    }
  }
  if (count === 0) {
    return { x: 0, z: 0, count: 0 };
  }
  return { x: sumColNorm / count, z: sumRowNorm / count, count };
}

/**
 * DEMの平らな数値列から、地形メッシュと水面領域マーカーを生成して返す。
 * demFlat は列gridW×行gridHを行優先で1次元に並べた標高値の配列。先頭で値の個数を検査する。
 * 戻り値の meshes は [{ name, positions, indices }]、水面 node の extras は originalWaterBoundsWorld を持つ。
 */
export function demToStageMeshes(demFlat, gridW, gridH, params = STAGE_BUILD_PARAMS) {
  if (demFlat.length !== gridW * gridH) {
    throw new Error(
      `DEMの値の個数（${demFlat.length}）が列×行（${gridW}×${gridH}=${gridW * gridH}）に一致しません。` +
        "1行格納の取り違えや列行数の誤りがないか確認してください。"
    );
  }
  const { waterLevel, verticalScale, worldSize, gridStride, waterExtentFactor, waterPlaneY, lakebedDepth } =
    params;

  // 水平寸法。長辺（列方向）を worldSize へ写し、短辺（行方向）は縦横比を保つ。
  const worldX = worldSize;
  const worldZ = (worldSize * gridH) / gridW;

  // 水面の重心を原点へ写す平行移動量。
  const centroid = waterCentroidNormalized(demFlat, gridW, gridH, waterLevel);
  const offsetX = -centroid.x * worldX;
  const offsetZ = -centroid.z * worldZ;

  // ある列c・行rの世界座標の水平位置（高さは別に計算する）。
  const worldXOf = (c) => (c / (gridW - 1) - 0.5) * worldX + offsetX;
  const worldZOf = (r) => (r / (gridH - 1) - 0.5) * worldZ + offsetZ;

  // ---- 地形メッシュ ----
  const sampleCols = sampleIndices(gridW, gridStride);
  const sampleRows = sampleIndices(gridH, gridStride);
  const nCols = sampleCols.length;
  const nRows = sampleRows.length;

  const terrainPositions = new Float32Array(nCols * nRows * 3);
  for (let ri = 0; ri < nRows; ri += 1) {
    const r = sampleRows[ri];
    for (let ci = 0; ci < nCols; ci += 1) {
      const c = sampleCols[ci];
      const base = (ri * nCols + ci) * 3;
      const elev = demFlat[r * gridW + c];
      terrainPositions[base] = worldXOf(c);
      // 標高が水面基準以上は陸地として高さを与え（水面基準で高さ0、上ほど高い）、水面基準より下は水面より明確に
      // 低い平らな湖底に置く（水際の点滅を防ぎ、陸地を水面より明確に上へ置く。理由は lakebedDepth の注釈）。
      terrainPositions[base + 1] =
        elev >= waterLevel ? (elev - waterLevel) * verticalScale : waterPlaneY - lakebedDepth;
      terrainPositions[base + 2] = worldZOf(r);
    }
  }

  // 三角形の索引。標本配列上の隣接で各区画を2三角形に分ける。巻き順は上面の法線が上向き（+Y）になるよう、
  // 区画の左上a・右上b・右下c・左下dに対し (a,c,b) と (a,d,c) とする（列増加が+X、行増加が+Z）。
  const terrainIndices = [];
  for (let ri = 0; ri < nRows - 1; ri += 1) {
    for (let ci = 0; ci < nCols - 1; ci += 1) {
      const a = ri * nCols + ci;
      const b = ri * nCols + (ci + 1);
      const c = (ri + 1) * nCols + (ci + 1);
      const d = (ri + 1) * nCols + ci;
      terrainIndices.push(a, c, b, a, d, c);
    }
  }

  // ---- 水面領域マーカー（原点中心の水平矩形、識別用。実際の反射面は実行時に生成する） ----
  const halfX = (worldX * waterExtentFactor) / 2;
  const halfZ = (worldZ * waterExtentFactor) / 2;
  const waterPositions = new Float32Array([
    -halfX, waterPlaneY, -halfZ,
    halfX, waterPlaneY, -halfZ,
    halfX, waterPlaneY, halfZ,
    -halfX, waterPlaneY, halfZ,
  ]);
  // 上面の法線が+Yになる巻き順（v0左上・v1右上・v2右下・v3左下）。
  const waterIndices = [0, 2, 1, 0, 3, 2];

  // 水面の元の範囲（標高0.15以下のセルの世界座標の最小最大、中心合わせ後）。後続の湖輪郭の切り出し用。
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let r = 0; r < gridH; r += 1) {
    for (let c = 0; c < gridW; c += 1) {
      if (demFlat[r * gridW + c] <= waterLevel) {
        const x = worldXOf(c);
        const z = worldZOf(r);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  const originalWaterBoundsWorld =
    centroid.count > 0 ? { minX, maxX, minZ, maxZ, y: waterPlaneY } : null;

  return {
    meshes: [
      { name: "terrain", positions: terrainPositions, indices: terrainIndices },
      {
        name: "water",
        positions: waterPositions,
        indices: waterIndices,
        extras: { originalWaterBoundsWorld },
      },
    ],
    meta: {
      worldX,
      worldZ,
      offsetX,
      offsetZ,
      waterCentroidNormalized: { x: centroid.x, z: centroid.z },
      terrainVertexCount: nCols * nRows,
      terrainTriangleCount: terrainIndices.length / 3,
    },
  };
}
