// 空間品質ゲート（Issue #100）の指標算出。純粋関数のみを持ち、ブラウザ起動部品を読み込まない。
// 仕様の正典は docs/research/08-quality-assurance.md の3節。閾値はすべて初期値であり、
// 実装後のプレイ検証で調整して閾値定義集を確定するIssue #104と整合させる。

import { percentileNearestRank } from "./metrics.mjs";

/**
 * 背景輝度を、全区画輝度の下位5パーセンタイルと定める。
 * 採用理由を先に述べる。夜の情景の背景は暗いため、下位側の代表値を背景とすれば、固定値を置かずに
 * 実際の描画の暗さへ適応し、舞台に依存しない。空の格子は非数を返し、合否は呼び側に委ねる。
 * @param {readonly number[]} cells 区画ごとの平均輝度
 * @returns {number} 背景輝度（0から255）。空の格子は非数。
 */
export function backgroundLuminance(cells) {
  return percentileNearestRank(cells, 5);
}

/**
 * 明部区画の数を数える。明部区画 = 区画平均輝度が背景輝度に余裕を加えた値以上の区画。
 * 採用理由を先に述べる。余裕の既定16は、後処理診断スモークが「知覚できる差」として採る輝度差と
 * 同じ水準で、発光体とそのにじみを背景と区別できる。
 * @param {readonly number[]} cells 区画ごとの平均輝度
 * @param {number} background 背景輝度
 * @param {number} margin 背景に加える余裕（既定16）
 * @returns {number} 明部区画の数
 */
export function brightCellCount(cells, background, margin = 16) {
  const threshold = background + margin;
  let count = 0;
  for (const value of cells) {
    if (value >= threshold) {
      count += 1;
    }
  }
  return count;
}

/**
 * 対応する区画ごとに、前者の輝度から後者の輝度を引いた増分の配列を返す。
 * 反射有効と無効の格子の差を求めるために使う。長さが異なる入力は対応付けできないため例外を投げる。
 * @param {readonly number[]} cellsA 前者（例: 反射有効）の区画ごとの平均輝度
 * @param {readonly number[]} cellsB 後者（例: 反射無効）の区画ごとの平均輝度
 * @returns {number[]} 区画ごとの増分
 */
export function perCellIncrease(cellsA, cellsB) {
  if (cellsA.length !== cellsB.length) {
    throw new Error(
      `区画数が一致しません（前者${cellsA.length}、後者${cellsB.length}）。同一表示条件で描画していません。`
    );
  }
  const result = new Array(cellsA.length);
  for (let i = 0; i < cellsA.length; i += 1) {
    result[i] = cellsA[i] - cellsB[i];
  }
  return result;
}

/**
 * 値が大きい上位N区画の平均を返す。
 * 採用理由を先に述べる。反射は離散的な発光点の小さな鏡像であり、明るく変化する区画はごく少数に局在する。
 * 全区画に対する割合で平均すると、変化の無い大多数の区画に薄められて信号を見失う。最も変化した上位の少数区画の
 * 平均を採れば、局在した反射の明るさを薄めずにとらえられ、外れ値1区画にも左右されない。区画数Nは最小1とし、
 * 入力数を超えるときは入力数でクランプする。空の入力は0を返す（合否は呼び側に委ねる）。
 * @param {readonly number[]} values 値の配列（例: 区画ごとの増分）
 * @param {number} count 平均する上位区画の数N
 * @returns {number} 上位N区画の平均
 */
export function topCountMean(values, count) {
  if (values.length === 0) {
    return 0;
  }
  const topCount = Math.min(values.length, Math.max(1, Math.floor(count)));
  const sorted = [...values].sort((a, b) => b - a);
  let sum = 0;
  for (let i = 0; i < topCount; i += 1) {
    sum += sorted[i];
  }
  return sum / topCount;
}

/**
 * 世界座標の2点間のユークリッド距離を返す。カメラが2姿勢で実際に離れたかの確認に使う。
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @returns {number} 距離（世界単位）
 */
export function worldDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 点ごとの画面移動量のばらつきを返す。視差の判定に使う。
 * 採用理由を先に述べる。視差とは、カメラが横へ動いたとき手前の点ほど画面上を大きく動き、奥の点ほど
 * 小さく動く、奥行きに応じた移動量の差である。よって点ごとの移動量のばらつき（最大値から最小値を引いた値）
 * を測れば、視差そのものを直接とらえられる。移動量は画面の幅に対する割合で表す。採用理由を先に述べると、
 * 画面正規化座標の幅2が画面の幅1に対応するため、正規化座標での距離を2で割れば画面の幅に対する割合になり、
 * 表示寸法に依存しない。両姿勢とも画面内にある点だけを使い、その数が2点未満ならばらつきは定まらないため
 * 非数を返す（合否は呼び側に委ねる）。
 * @param {ReadonlyArray<{x:number,y:number,onScreen:boolean}>} far 遠景の姿勢で射影した各点（画面正規化座標）
 * @param {ReadonlyArray<{x:number,y:number,onScreen:boolean}>} lateral 横移動の姿勢で射影した各点
 * @returns {{spread:number, usablePoints:number}} ばらつきと、両姿勢で画面内にある点の数
 */
export function screenDisplacementSpread(far, lateral) {
  const displacements = [];
  for (let i = 0; i < far.length; i += 1) {
    if (far[i].onScreen && lateral[i] && lateral[i].onScreen) {
      const dx = far[i].x - lateral[i].x;
      const dy = far[i].y - lateral[i].y;
      // 正規化座標の距離を2で割り、画面の幅に対する割合にする。
      displacements.push(Math.sqrt(dx * dx + dy * dy) / 2);
    }
  }
  if (displacements.length < 2) {
    return { spread: Number.NaN, usablePoints: displacements.length };
  }
  return {
    spread: Math.max(...displacements) - Math.min(...displacements),
    usablePoints: displacements.length,
  };
}

/**
 * 画面内の射影点のうち、その点が入る区画が明部である割合を返す。
 * 採用理由を先に述べる。幾何的な射影は描画結果に依存しないため、それだけではカメラが実際に発光点を
 * 描いている保証がない。射影位置の区画が明部であることを確かめれば、描画基盤がその姿勢で発光点を実際に
 * 描いていることを画素で裏付けられる。格子は行優先で行0が画面の上、列0が画面の左とする。画面正規化座標
 * x,y（-1から1）を u=(x+1)/2（左0右1）・v=(y+1)/2（下0上1）へ写し、列=floor(u×列数)・行=floor((1-v)×行数)
 * で区画を定める。画面内の点が無ければ割合は定まらないため非数を返す。
 * @param {ReadonlyArray<{x:number,y:number,onScreen:boolean}>} points 射影した各点（画面正規化座標）
 * @param {{cols:number, rows:number, cells:readonly number[]}} grid 区画ごとの平均輝度の格子
 * @param {number} background 背景輝度
 * @param {number} margin 明部とみなす背景からの余裕
 * @returns {number} 明部区画に入る画面内の点の割合（0から1）。画面内の点が無ければ非数。
 */
export function projectedBrightFraction(points, grid, background, margin) {
  const threshold = background + margin;
  let onScreenCount = 0;
  let brightCount = 0;
  for (const point of points) {
    if (!point.onScreen) {
      continue;
    }
    onScreenCount += 1;
    const u = (point.x + 1) / 2;
    const v = (point.y + 1) / 2;
    let col = Math.floor(u * grid.cols);
    let row = Math.floor((1 - v) * grid.rows);
    col = Math.min(Math.max(col, 0), grid.cols - 1);
    row = Math.min(Math.max(row, 0), grid.rows - 1);
    if (grid.cells[row * grid.cols + col] >= threshold) {
      brightCount += 1;
    }
  }
  if (onScreenCount === 0) {
    return Number.NaN;
  }
  return brightCount / onScreenCount;
}

/**
 * 空間品質ゲートの初期閾値。すべて初期値であり、実装後のプレイ検証で調整して
 * 閾値定義集を確定するIssue #104と整合させる。各値の採用理由を併記する。
 */
export const DEFAULT_THRESHOLDS = {
  // 明部とみなす背景からの余裕。後処理診断スモークが「知覚できる差」として採る輝度差と同じ水準。
  brightnessMargin: 16,
  // 反射の整合で平均する上位区画の数N。反射は離散的な発光点の小さな鏡像で、明るく変化する区画が少数のため
  // 上位の少数区画で代表させる。初期値2（手元のソフトウェア描画で、明確に反射する区画が約2区画であることに基づく）。
  reflectionTopCount: 2,
  // 反射有効と無効の上位N区画の輝度増分の平均の下限。反射が情景の発光点を映していれば、その区画の輝度が
  // 後処理診断スモークの黒潰れ回避の下限と同じ水準8以上に上がる。反射が無効化された退行ではこの増分が0付近になる。
  reflectionMinIncrease: 8,
  // 視差の2姿勢のカメラ位置の世界距離の下限。診断ページが定める遠景と横移動の距離より小さく置く。
  parallaxMinWorldDistance: 5,
  // 視差の画面移動量のばらつきの下限（画面の幅に対する割合）。奥行き差動を表す最小の差。
  parallaxMinSpreadFraction: 0.01,
  // 視差の画素裏付けで、明部区画に入る画面内の点の割合の下限。中心像などの遮蔽を見込み過半とする。
  parallaxMinBrightFraction: 0.5,
  // スケール変化の明部区画数の比（近景÷遠景）の下限。寄って明部が増えることを表す最小の比。
  scaleMinRatio: 1.1,
  // 明部区画を判定不能とする全面被覆割合の上限。夜の情景で明部がほぼ全面になること自体が異常。
  brightCoverageMax: 0.9,
};

/**
 * 6項目（反射の存在・反射の整合・ブルームの存在・陸地地形の存在・視差・スケール変化）の合否を判定する。
 * いずれも真偽で判定し、不成立の理由を日本語で列挙する。失敗時の扱い（警告か厳格か）は呼び側が決める。
 * @param {object} m 計測値（構造状態・カメラ姿勢の射影・各姿勢の輝度格子）
 * @param {object} [thresholds] 閾値（省略時は DEFAULT_THRESHOLDS）
 * @returns {{acceptable:boolean, reasons:string[], cues:object}}
 */
export function evaluateSpatialAcceptance(m, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds;
  const reasons = [];
  const s = m.structural;

  // 描画文脈が得られない（描画不可）なら、画素に基づく判定が成立しないため、全体を不合格にする。
  if (!s.webglAvailable) {
    reasons.push("描画文脈が得られませんでした（描画不可のため空間表現を検査できません）");
  }

  // 1. 反射の存在。
  const reflectionExists = s.reflectionEnabled === true && s.reflectionResolution > 0;
  if (!reflectionExists) {
    reasons.push("反射が無効です（reflectionEnabled が偽、または反射解像度が0です）");
  }

  // 2. 反射の整合。反射有効と無効の区画増分の上位部分の平均が下限以上か。
  const onFar = m.grids.reflectionOnFar;
  const offFar = m.grids.reflectionOffFar;
  const reflectionIncrease = topCountMean(
    perCellIncrease(onFar.cells, offFar.cells),
    t.reflectionTopCount
  );
  const reflectionConsistent = reflectionIncrease >= t.reflectionMinIncrease;
  if (!reflectionConsistent) {
    reasons.push(
      `反射の整合が不足です（反射有効と無効の上位${t.reflectionTopCount}区画の輝度増分の平均が ${reflectionIncrease.toFixed(
        1
      )} で、下限 ${t.reflectionMinIncrease} 未満です）`
    );
  }

  // 3. ブルームの存在（構造値）。
  const bloomExists =
    s.bloomEnabled === true && s.bloomStrength > 0 && s.bloomOutputPassEnabled === true;
  if (!bloomExists) {
    reasons.push("ブルームが無効です（bloom の有効・強さ・最終出力パスのいずれかが成立しません）");
  }

  // 4. 陸地地形の存在。
  const terrainExists =
    s.stageTerrainStatus === "loaded" && s.waterSource === "stage-mesh";
  if (!terrainExists) {
    reasons.push(
      `陸地地形が成立しません（地形の状態が「${s.stageTerrainStatus}」、水面供給元が「${s.waterSource}」です）`
    );
  }

  // 5. 視差の存在。(a)カメラが2姿勢で離れた、(b)移動量のばらつきが下限以上、(c)射影点が明部に出ている。
  const farBackground = backgroundLuminance(onFar.cells);
  const cameraMoved =
    worldDistance(m.poses.far.position, m.poses.lateral.position) >=
    t.parallaxMinWorldDistance;
  const spreadResult = screenDisplacementSpread(
    m.poses.far.projected,
    m.poses.lateral.projected
  );
  const spreadEnough =
    !Number.isNaN(spreadResult.spread) &&
    spreadResult.spread >= t.parallaxMinSpreadFraction;
  const brightFraction = projectedBrightFraction(
    m.poses.far.projected,
    onFar,
    farBackground,
    t.brightnessMargin
  );
  const brightBacked =
    !Number.isNaN(brightFraction) && brightFraction >= t.parallaxMinBrightFraction;
  const parallax = cameraMoved && spreadEnough && brightBacked;
  if (!parallax) {
    reasons.push(
      `視差が成立しません（カメラ移動=${cameraMoved}、移動量のばらつき=${
        Number.isNaN(spreadResult.spread) ? "判定不能" : spreadResult.spread.toFixed(3)
      }（下限 ${t.parallaxMinSpreadFraction}）、射影点の明部割合=${
        Number.isNaN(brightFraction) ? "判定不能" : brightFraction.toFixed(2)
      }（下限 ${t.parallaxMinBrightFraction}））`
    );
  }

  // 6. スケール変化の存在。近景と遠景の明部区画数の比。
  const nearGrid = m.grids.near;
  const nearBackground = backgroundLuminance(nearGrid.cells);
  const farBright = brightCellCount(onFar.cells, farBackground, t.brightnessMargin);
  const nearBright = brightCellCount(nearGrid.cells, nearBackground, t.brightnessMargin);
  const farTotal = onFar.cells.length;
  const nearTotal = nearGrid.cells.length;
  const farCoverage = farBright / farTotal;
  const nearCoverage = nearBright / nearTotal;
  let scaleChange;
  if (farCoverage > t.brightCoverageMax || nearCoverage > t.brightCoverageMax) {
    scaleChange = false;
    reasons.push(
      `スケール変化は判定不能です（明部区画が画面のほぼ全面を覆います。遠景の被覆率=${farCoverage.toFixed(
        2
      )}、近景の被覆率=${nearCoverage.toFixed(2)}、上限 ${t.brightCoverageMax}）`
    );
  } else if (farBright === 0) {
    scaleChange = false;
    reasons.push("スケール変化は判定不能です（遠景の明部区画が皆無で比の分母が0です）");
  } else {
    const ratio = nearBright / farBright;
    scaleChange = ratio >= t.scaleMinRatio;
    if (!scaleChange) {
      reasons.push(
        `スケール変化が不足です（近景÷遠景の明部区画数の比が ${ratio.toFixed(2)} で、下限 ${
          t.scaleMinRatio
        } 未満です）`
      );
    }
  }

  const cues = {
    reflectionExists,
    reflectionConsistent,
    bloomExists,
    terrainExists,
    parallax,
    scaleChange,
  };
  // 合否は理由の有無で決める。描画不可のときは描画不可の理由が積まれるため不合格になる（このとき画素に基づく
  // 判定の真偽は cues に残るが、合否は理由の有無で決まるため不合格は揺るがない）。
  const acceptable = reasons.length === 0;
  return { acceptable, reasons, cues };
}

/**
 * 赤緑青から知覚輝度（0から255）へ変換する。
 * 採用理由を先に述べる。人間の目は緑に最も敏感で青に最も鈍いため、標準の知覚輝度式
 * 0.2126×赤 + 0.7152×緑 + 0.0722×青 で重み付けする。
 * @param {number} r 赤（0から255）
 * @param {number} g 緑（0から255）
 * @param {number} b 青（0から255）
 * @returns {number} 知覚輝度（0から255）
 */
export function perceptualLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
