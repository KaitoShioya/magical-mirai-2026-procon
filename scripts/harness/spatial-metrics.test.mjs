// 空間品質ゲート（Issue #100）の純粋関数の単体テスト。
// 対象モジュール spatial-metrics.mjs を直接読み込み、ブラウザ起動部品には到達しない。
import { describe, expect, test } from "vitest";
import {
  backgroundLuminance,
  brightCellCount,
  DEFAULT_THRESHOLDS,
  evaluateSpatialAcceptance,
  perCellIncrease,
  perceptualLuminance,
  projectedBrightFraction,
  screenDisplacementSpread,
  topCountMean,
  worldDistance,
} from "./spatial-metrics.mjs";

// 6項目すべてが成立する計測値を組み立てる。各テストはこれを複製して一部だけ崩す。
// 4×4の格子（行0が上、列0が左）を使う。背景は輝度6、明部しきい値は背景＋16＝22。
// 物理に合わせ、直接の発光点（区画0,1,4,5＝左上2×2）は反射の有無に関わらず両描画で明るくする。
// 水面の反射は別の区画（8,9）に現れ、反射有効でのみ明るくなる。よって反射有効と無効の輝度増分は
// 反射区画にだけ現れ、直接の発光点では0になる。
// options.reflectionIncrease は反射区画8,9それぞれの輝度増分（既定は明確に反射する[94, 94]）。
function passingMeasurements(options = {}) {
  const reflectionIncrease = options.reflectionIncrease ?? [94, 94];
  const background = 6;
  const directCells = [0, 1, 4, 5];
  const reflectionCells = [8, 9];
  const dark = () => new Array(16).fill(background);
  // 遠景・反射無効: 直接の発光点だけが明るい（反射区画は単色水面のまま暗い）。
  const reflectionOffFar = dark();
  for (const i of directCells) reflectionOffFar[i] = 100;
  // 遠景・反射有効: 直接の発光点に加え、反射区画が反射で明るくなる。
  const reflectionOnFar = dark();
  for (const i of directCells) reflectionOnFar[i] = 100;
  reflectionCells.forEach((i, k) => {
    reflectionOnFar[i] = background + (reflectionIncrease[k] ?? 0);
  });
  // 近景・反射有効: 寄って明部が増える（直接の発光点と反射区画に加え区画2,6も明るい）。
  const near = dark();
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9]) near[i] = 100;
  // 8点の射影。4点を左上の明部領域（画面内・直接の発光点の区画）、4点を画面外にする。
  // 横移動では点ごとに移動量を変え、ばらつきを生む。
  const far = [
    { x: -0.9, y: 0.9, onScreen: true },
    { x: -0.1, y: 0.9, onScreen: true },
    { x: -0.9, y: 0.6, onScreen: true },
    { x: -0.3, y: 0.6, onScreen: true },
    { x: 0, y: 0, onScreen: false },
    { x: 0, y: 0, onScreen: false },
    { x: 0, y: 0, onScreen: false },
    { x: 0, y: 0, onScreen: false },
  ];
  const lateral = [
    { x: -0.88, y: 0.9, onScreen: true },
    { x: -0.5, y: 0.9, onScreen: true },
    { x: -0.85, y: 0.6, onScreen: true },
    { x: -0.32, y: 0.6, onScreen: true },
    { x: 0, y: 0, onScreen: false },
    { x: 0, y: 0, onScreen: false },
    { x: 0, y: 0, onScreen: false },
    { x: 0, y: 0, onScreen: false },
  ];
  return {
    structural: {
      webglAvailable: true,
      reflectionEnabled: true,
      reflectionResolution: 512,
      waterSource: "stage-mesh",
      stageTerrainStatus: "loaded",
      bloomEnabled: true,
      bloomStrength: 1.2,
      bloomOutputPassEnabled: true,
    },
    poses: {
      far: { position: { x: 0, y: 14, z: 34 }, projected: far },
      lateral: { position: { x: 14, y: 14, z: 34 }, projected: lateral },
    },
    grids: {
      reflectionOnFar: { cols: 4, rows: 4, cells: reflectionOnFar },
      reflectionOffFar: { cols: 4, rows: 4, cells: reflectionOffFar },
      near: { cols: 4, rows: 4, cells: near },
    },
  };
}

// 評価のテストは本番の既定閾値 DEFAULT_THRESHOLDS をそのまま使う。テスト専用の閾値を別に置くと、
// テストと本番がずれて、本番閾値での回帰を守れなくなるため、両者を同一にする。
describe("evaluateSpatialAcceptance（6項目の合否、本番の既定閾値で判定）", () => {
  test("全項目が成立すれば合格で理由は空", () => {
    const result = evaluateSpatialAcceptance(passingMeasurements());
    expect(result.acceptable).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.cues).toMatchObject({
      reflectionExists: true,
      reflectionConsistent: true,
      bloomExists: true,
      terrainExists: true,
      parallax: true,
      scaleChange: true,
    });
  });

  test("反射が無効なら反射の存在が不成立で不合格", () => {
    const m = passingMeasurements();
    m.structural.reflectionEnabled = false;
    m.structural.reflectionResolution = 0;
    const result = evaluateSpatialAcceptance(m);
    expect(result.acceptable).toBe(false);
    expect(result.cues.reflectionExists).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test("地形が読み込み失敗なら陸地地形の存在が不成立で不合格", () => {
    const m = passingMeasurements();
    m.structural.stageTerrainStatus = "error";
    const result = evaluateSpatialAcceptance(m);
    expect(result.acceptable).toBe(false);
    expect(result.cues.terrainExists).toBe(false);
  });

  test("ブルームが無効ならブルームの存在が不成立で不合格", () => {
    const m = passingMeasurements();
    m.structural.bloomEnabled = false;
    const result = evaluateSpatialAcceptance(m);
    expect(result.acceptable).toBe(false);
    expect(result.cues.bloomExists).toBe(false);
  });

  test("反射有効と無効の差が小さいと反射の整合が不成立", () => {
    const m = passingMeasurements();
    // 反射有効の明部を消し、差を無くす。
    m.grids.reflectionOnFar.cells = new Array(16).fill(6);
    const result = evaluateSpatialAcceptance(m);
    expect(result.acceptable).toBe(false);
    expect(result.cues.reflectionConsistent).toBe(false);
  });

  test("遠景の明部区画が皆無ならスケール変化は分母0で判定不能・不成立", () => {
    const m = passingMeasurements();
    m.grids.reflectionOnFar.cells = new Array(16).fill(6);
    const result = evaluateSpatialAcceptance(m);
    expect(result.acceptable).toBe(false);
    expect(result.cues.scaleChange).toBe(false);
  });

  test("視差の移動量のばらつきが下限未満なら視差が不成立", () => {
    const m = passingMeasurements();
    // 横移動の射影を遠景とほぼ同じにして移動量のばらつきを消す。
    m.poses.lateral.projected = m.poses.far.projected.map((p) => ({ ...p }));
    const result = evaluateSpatialAcceptance(m);
    expect(result.acceptable).toBe(false);
    expect(result.cues.parallax).toBe(false);
  });

  test("描画文脈が得られない（描画不可）なら全体が不合格", () => {
    const m = passingMeasurements();
    m.structural.webglAvailable = false;
    const result = evaluateSpatialAcceptance(m);
    expect(result.acceptable).toBe(false);
  });

  // 反射の整合は「上位2区画の輝度増分の平均が下限8以上」で判定する（本番の既定）。反射は離散的な発光点の
  // 小さな鏡像で、明るく変化する区画が少数のため、上位2区画と低い下限8という選択は崖際に立つ。その選択を
  // 回帰で守るため、平均がちょうど下限8に乗る場合と下限を割る場合を、左上の直接の発光点を保ったまま反射区画
  // だけを動かして検査する。1区画だけ強く反射し他の反射区画が反射しない非対称な場合を用いる。
  test("反射区画の増分の上位2区画の平均がちょうど下限8なら反射の整合が成立", () => {
    // 反射区画の増分を[16, 0]にすると上位2区画の平均は(16+0)/2=8で下限ちょうど。
    const m = passingMeasurements({ reflectionIncrease: [16, 0] });
    const result = evaluateSpatialAcceptance(m);
    expect(result.cues.reflectionConsistent).toBe(true);
    expect(result.acceptable).toBe(true);
  });

  test("反射区画の増分の上位2区画の平均が下限8を割ると反射の整合が不成立", () => {
    // 反射区画の増分を[14, 0]にすると上位2区画の平均は(14+0)/2=7で下限8を割る。
    const m = passingMeasurements({ reflectionIncrease: [14, 0] });
    const result = evaluateSpatialAcceptance(m);
    expect(result.cues.reflectionConsistent).toBe(false);
    expect(result.acceptable).toBe(false);
  });
});

describe("perceptualLuminance（知覚輝度）", () => {
  // 知覚輝度 = 0.2126×赤 + 0.7152×緑 + 0.0722×青。
  test("白(255,255,255)は255を返す", () => {
    expect(perceptualLuminance(255, 255, 255)).toBeCloseTo(255, 5);
  });

  test("黒(0,0,0)は0を返す", () => {
    expect(perceptualLuminance(0, 0, 0)).toBe(0);
  });

  test("緑が最も重く、青が最も軽い", () => {
    const green = perceptualLuminance(0, 255, 0);
    const red = perceptualLuminance(255, 0, 0);
    const blue = perceptualLuminance(0, 0, 255);
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  test("夜の背景色(5,6,10)はおよそ6", () => {
    expect(perceptualLuminance(5, 6, 10)).toBeCloseTo(6, 0);
  });
});

describe("backgroundLuminance（背景輝度＝下位5パーセンタイル）", () => {
  // 夜の情景の背景は暗いため、下位側の代表値を背景とする。固定値を置かず描画の暗さへ適応する。
  test("大半が暗く一部が明るい格子では暗い側の値を返す", () => {
    const cells = [];
    for (let i = 0; i < 95; i += 1) cells.push(6);
    for (let i = 0; i < 5; i += 1) cells.push(200);
    expect(backgroundLuminance(cells)).toBe(6);
  });

  test("空の格子は非数を返す", () => {
    expect(Number.isNaN(backgroundLuminance([]))).toBe(true);
  });
});

describe("brightCellCount（明部区画数＝背景＋余裕以上の区画数）", () => {
  // 明部区画 = 区画平均輝度が背景輝度に余裕（既定16）を加えた値以上の区画。
  // 余裕16の採用理由は、後処理診断スモークが「知覚できる差」として採る輝度差と同じ水準であること。
  test("背景＋16以上の区画だけを数える", () => {
    const cells = [6, 6, 22, 21, 100];
    // 背景は下位5パーセンタイル=6。しきい値=22。22と100が該当し、21は外れる。
    expect(brightCellCount(cells, 6, 16)).toBe(2);
  });

  test("しきい値ちょうどの区画は明部に含める", () => {
    expect(brightCellCount([6, 22], 6, 16)).toBe(1);
  });
});

describe("perCellIncrease（区画ごとの増分）", () => {
  test("対応する区画ごとに前者から後者を引く", () => {
    expect(perCellIncrease([10, 20, 30], [1, 2, 3])).toEqual([9, 18, 27]);
  });

  test("長さが異なる入力は例外を投げる", () => {
    expect(() => perCellIncrease([1, 2], [1])).toThrow();
  });
});

describe("topCountMean（増分が大きい上位N区画の平均）", () => {
  // 反射は離散的な発光点の小さな鏡像であり、明るく変化する区画はごく少数に局在する。よって全区画の割合でなく
  // 上位の少数区画の平均でとらえる。区画数 N は最小1とし、入力数を超えるときは入力数でクランプする。
  test("上位2区画の平均を返す", () => {
    const values = [0, 0, 0, 0, 40, 100];
    expect(topCountMean(values, 2)).toBe(70);
  });

  test("上位2区画が非対称[14, 2]なら平均8を返す（反射の整合の崖際）", () => {
    // 1区画が強く反射し他がほとんど反射しない場合、上位2区画の平均が下限8の近傍に来る。
    expect(topCountMean([14, 2, 0, 0], 2)).toBe(8);
  });

  test("上位1区画は最大値を返す", () => {
    const values = [0, 0, 40, 100];
    expect(topCountMean(values, 1)).toBe(100);
  });

  test("区画数が入力数を超えるときは全体の平均を返す", () => {
    expect(topCountMean([10, 20], 5)).toBe(15);
  });

  test("空の入力は0を返す", () => {
    expect(topCountMean([], 2)).toBe(0);
  });
});

describe("worldDistance（世界座標の2点間距離）", () => {
  test("3次元のユークリッド距離を返す", () => {
    expect(worldDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });
});

describe("screenDisplacementSpread（点ごとの画面移動量のばらつき）", () => {
  // 射影座標は画面正規化座標（左右・上下とも-1から1）。移動量は画面の幅に対する割合で表す
  // （正規化座標の幅2が画面の幅1に対応するため、正規化座標の距離を2で割る）。
  // ばらつき = 点ごとの移動量の最大値から最小値を引いた値。
  test("奥行きが異なれば移動量がばらつく", () => {
    const far = [
      { x: 0, y: 0, onScreen: true },
      { x: 0.5, y: 0, onScreen: true },
    ];
    const lateral = [
      { x: 0.1, y: 0, onScreen: true },
      { x: 0.9, y: 0, onScreen: true },
    ];
    // 点0: 移動0.1（正規化）=0.05（割合）、点1: 移動0.4=0.2。ばらつき=0.15。
    const result = screenDisplacementSpread(far, lateral);
    expect(result.spread).toBeCloseTo(0.15, 5);
    expect(result.usablePoints).toBe(2);
  });

  test("両姿勢で画面内の点が2点未満ならばらつきは非数", () => {
    const far = [
      { x: 0, y: 0, onScreen: true },
      { x: 0.5, y: 0, onScreen: false },
    ];
    const lateral = [
      { x: 0.1, y: 0, onScreen: true },
      { x: 0.9, y: 0, onScreen: true },
    ];
    const result = screenDisplacementSpread(far, lateral);
    expect(Number.isNaN(result.spread)).toBe(true);
    expect(result.usablePoints).toBe(1);
  });
});

describe("projectedBrightFraction（射影点が明部区画に入る割合）", () => {
  // 格子は行優先で、行0が画面の上、列0が画面の左。
  // 画面正規化座標 x,y（-1から1）を、u=(x+1)/2（左0右1）、v=(y+1)/2（下0上1）へ写し、
  // 列=floor(u×列数)、行=floor((1-v)×行数) で区画を定める。
  test("画面内の点のうち明部区画に入る割合を返す", () => {
    // 2×2格子。左上(index0)だけ明部。
    const grid = { cols: 2, rows: 2, cells: [100, 6, 6, 6] };
    const points = [
      { x: -0.5, y: 0.5, onScreen: true }, // 左上の区画へ入る → 明部
      { x: 0.5, y: -0.5, onScreen: true }, // 右下の区画へ入る → 明部でない
    ];
    expect(projectedBrightFraction(points, grid, 6, 16)).toBeCloseTo(0.5, 5);
  });

  test("画面内の点が無ければ非数を返す", () => {
    const grid = { cols: 2, rows: 2, cells: [100, 6, 6, 6] };
    const points = [{ x: -0.5, y: 0.5, onScreen: false }];
    expect(Number.isNaN(projectedBrightFraction(points, grid, 6, 16))).toBe(true);
  });
});
