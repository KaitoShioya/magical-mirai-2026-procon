import { describe, expect, it } from "vitest";
import { BufferAttribute, PointsMaterial } from "three";
import {
  createRainSystem,
  initRainPositions,
  normalizeCount,
  normalizeDeltaMs,
  stepRainColumn,
} from "./rain";
import {
  RAIN_AREA_SIZE,
  RAIN_COLOR,
  RAIN_FALL_SPEED_PER_SECOND,
  RAIN_OPACITY,
  RAIN_POINT_SIZE,
  RAIN_WRAP_HEIGHT,
} from "./constants";

const HALF_AREA = RAIN_AREA_SIZE / 2; // 中心から端までの距離（±45）。

// 位置は Float32Array に格納するため、計算した値（倍精度）を単精度へ丸めた誤差が出る。近似比較の桁数を4に
// する理由を先に述べる。単精度の有効桁はおよそ7桁で、値18〜45付近の丸め誤差はおよそ1e-6である。桁数4は
// 許容差5e-5に相当し、この丸め誤差を吸収しつつ意味のある検証（例として18.7と18.7008は区別する）を保つ。
const FLOAT32_PRECISION = 4;

describe("normalizeCount（粒数の正規化）", () => {
  it("有限の非負整数はそのまま返す", () => {
    expect(normalizeCount(800, 800)).toBe(800);
    expect(normalizeCount(0, 800)).toBe(0);
  });
  it("負の値は0（雨なし）へ畳む", () => {
    expect(normalizeCount(-5, 800)).toBe(0);
  });
  it("非整数は0方向へ切り詰める", () => {
    expect(normalizeCount(2.7, 800)).toBe(2);
  });
  it("非数・正負の無限大は fallback を返す", () => {
    expect(normalizeCount(Number.NaN, 800)).toBe(800);
    expect(normalizeCount(Number.POSITIVE_INFINITY, 800)).toBe(800);
    expect(normalizeCount(Number.NEGATIVE_INFINITY, 800)).toBe(800);
  });
});

describe("normalizeDeltaMs（時間差の正規化）", () => {
  it("上限以下の正の値はそのまま返す", () => {
    expect(normalizeDeltaMs(50)).toBe(50);
    expect(normalizeDeltaMs(100)).toBe(100);
  });
  it("上限を超える値は100へ抑える", () => {
    expect(normalizeDeltaMs(500)).toBe(100);
  });
  it("0以下・非数・正負の無限大は0を返す", () => {
    expect(normalizeDeltaMs(0)).toBe(0);
    expect(normalizeDeltaMs(-10)).toBe(0);
    expect(normalizeDeltaMs(Number.NaN)).toBe(0);
    expect(normalizeDeltaMs(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeDeltaMs(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("initRainPositions（初期配置）", () => {
  it("配列長は粒数×3になる", () => {
    expect(initRainPositions(100).length).toBe(300);
  });
  it("粒数0なら長さ0の配列を返す", () => {
    expect(initRainPositions(0).length).toBe(0);
  });
  it("非数・負の粒数は内部で0へ畳み長さ0を返す", () => {
    expect(initRainPositions(Number.NaN).length).toBe(0);
    expect(initRainPositions(-5).length).toBe(0);
  });
  it("乱数源に0を注入すると各粒は配置範囲の最小端（X・Z=-45、Y=0）になる", () => {
    const positions = initRainPositions(2, () => 0);
    for (let index = 0; index < 2; index += 1) {
      expect(positions[index * 3]).toBeCloseTo(-HALF_AREA, 10); // X
      expect(positions[index * 3 + 1]).toBeCloseTo(0, 10); // Y
      expect(positions[index * 3 + 2]).toBeCloseTo(-HALF_AREA, 10); // Z
    }
  });
  it("乱数源に1未満の最大に近い値を注入すると各粒は配置範囲の上端付近（X・Z<45、Y<40）になる", () => {
    const sample = 0.999999;
    const positions = initRainPositions(1, () => sample);
    expect(positions[0]).toBeCloseTo((sample - 0.5) * RAIN_AREA_SIZE, FLOAT32_PRECISION); // X
    expect(positions[0]).toBeLessThan(HALF_AREA);
    expect(positions[1]).toBeCloseTo(sample * RAIN_WRAP_HEIGHT, FLOAT32_PRECISION); // Y
    expect(positions[1]).toBeLessThan(RAIN_WRAP_HEIGHT);
  });
});

describe("stepRainColumn（落下と巻き戻し）", () => {
  it("Y座標が落下速度×時間差（秒換算）だけ減少する", () => {
    const positions = new Float32Array([0, 20, 0]);
    stepRainColumn(positions, 1, 50);
    // 20 − 26 × 0.05 ＝ 18.7
    expect(positions[1]).toBeCloseTo(20 - RAIN_FALL_SPEED_PER_SECOND * 0.05, FLOAT32_PRECISION);
  });
  it("上限を超える時間差は100ミリ秒へ畳んでから落下させる", () => {
    const positions = new Float32Array([0, 20, 0]);
    stepRainColumn(positions, 1, 500);
    // 20 − 26 × 0.1 ＝ 17.4
    expect(positions[1]).toBeCloseTo(20 - RAIN_FALL_SPEED_PER_SECOND * 0.1, FLOAT32_PRECISION);
  });
  it("不変条件内の粒が落下で0未満になると上端へ巻き戻る", () => {
    const positions = new Float32Array([0, 1, 0]);
    stepRainColumn(positions, 1, 50);
    // 1 − 26 × 0.05 ＝ −0.3 → −0.3 ＋ 40 ＝ 39.7
    expect(positions[1]).toBeCloseTo(1 - RAIN_FALL_SPEED_PER_SECOND * 0.05 + RAIN_WRAP_HEIGHT, FLOAT32_PRECISION);
  });
  it("X・Z座標は変化しない", () => {
    const positions = new Float32Array([3, 20, -7]);
    stepRainColumn(positions, 1, 50);
    expect(positions[0]).toBe(3);
    expect(positions[2]).toBe(-7);
  });
  it("時間差が0以下のとき位置は変わらない", () => {
    const positions = new Float32Array([0, 20, 0]);
    stepRainColumn(positions, 1, 0);
    expect(positions[1]).toBe(20);
    stepRainColumn(positions, 1, -10);
    expect(positions[1]).toBe(20);
  });
  it("時間差が非数または無限大のとき位置は変わらない", () => {
    const positions = new Float32Array([0, 20, 0]);
    stepRainColumn(positions, 1, Number.NaN);
    expect(positions[1]).toBe(20);
    stepRainColumn(positions, 1, Number.POSITIVE_INFINITY);
    expect(positions[1]).toBe(20);
  });
  it("粒数0で例外を投げず位置も変わらない", () => {
    const positions = new Float32Array([0, 20, 0]);
    expect(() => stepRainColumn(positions, 0, 50)).not.toThrow();
    expect(positions[1]).toBe(20);
  });
  it("非整数の粒数では整数へ畳んだ分だけ処理する", () => {
    const positions = new Float32Array([0, 20, 0, 0, 20, 0, 0, 20, 0]);
    stepRainColumn(positions, 2.7, 50); // 2粒だけ処理する
    expect(positions[1]).toBeCloseTo(20 - RAIN_FALL_SPEED_PER_SECOND * 0.05, FLOAT32_PRECISION);
    expect(positions[4]).toBeCloseTo(20 - RAIN_FALL_SPEED_PER_SECOND * 0.05, FLOAT32_PRECISION);
    expect(positions[7]).toBe(20); // 3粒目は手つかず
  });
  it("配列容量を超える粒数でも境界を越えて書き込まない", () => {
    const positions = new Float32Array([0, 20, 0]); // 1粒分しかない
    expect(() => stepRainColumn(positions, 5, 50)).not.toThrow();
    expect(positions[1]).toBeCloseTo(20 - RAIN_FALL_SPEED_PER_SECOND * 0.05, FLOAT32_PRECISION);
  });
});

// createRainSystem は three.js のコアオブジェクト（BufferGeometry・PointsMaterial・Points）を生成するが、
// これらの生成は WebGLRenderer（描画文脈）を要さず node 環境で構築できるため、ここで契約を直接検証する。
describe("createRainSystem（three.js オブジェクトの契約）", () => {
  it("マテリアルは技術要件の設定値を持つ（色・大きさ・不透明度・透明・深度書き込み無効）", () => {
    const system = createRainSystem({ count: 10 });
    const material = system.object.material as PointsMaterial;
    expect(material.color.getHex()).toBe(RAIN_COLOR);
    expect(material.size).toBe(RAIN_POINT_SIZE);
    expect(material.opacity).toBe(RAIN_OPACITY);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    system.dispose();
  });
  it("位置属性の頂点数は粒数に一致する", () => {
    const system = createRainSystem({ count: 800 });
    const attribute = system.object.geometry.getAttribute("position");
    expect(attribute.count).toBe(800);
    system.dispose();
  });
  it("粒数0なら頂点数0の Points を返す（消滅）", () => {
    const system = createRainSystem({ count: 0 });
    const attribute = system.object.geometry.getAttribute("position");
    expect(attribute.count).toBe(0);
    system.dispose();
  });
  it("既定の粒数は800である", () => {
    const system = createRainSystem();
    expect(system.object.geometry.getAttribute("position").count).toBe(800);
    system.dispose();
  });
  it("update は位置を進め、更新通知（version 増加）を立てる", () => {
    const system = createRainSystem({ count: 5 });
    const attribute = system.object.geometry.getAttribute("position") as BufferAttribute;
    // BufferAttribute.needsUpdate は真偽値の取得子を持たず、設定時に version を1増やす。よって version の
    // 増加で更新通知が立ったことを確認する。
    const versionBefore = attribute.version;
    const yBefore = attribute.getY(0);
    system.update(50);
    expect(attribute.version).toBe(versionBefore + 1);
    expect(attribute.getY(0)).not.toBe(yBefore);
    system.dispose();
  });
  it("update は有効な時間差が無いとき更新通知を立てない", () => {
    const system = createRainSystem({ count: 5 });
    const attribute = system.object.geometry.getAttribute("position") as BufferAttribute;
    const versionBefore = attribute.version;
    system.update(0);
    system.update(Number.NaN);
    expect(attribute.version).toBe(versionBefore);
    system.dispose();
  });
  it("update は粒数0のとき更新通知を立てない", () => {
    const system = createRainSystem({ count: 0 });
    const attribute = system.object.geometry.getAttribute("position") as BufferAttribute;
    const versionBefore = attribute.version;
    system.update(50);
    expect(attribute.version).toBe(versionBefore);
    system.dispose();
  });
  it("dispose は冪等であり二回以上呼んでも例外を投げない", () => {
    const system = createRainSystem({ count: 10 });
    expect(() => {
      system.dispose();
      system.dispose();
    }).not.toThrow();
  });
  it("dispose 後の update は位置を変えない（更新通知も立てない）", () => {
    const system = createRainSystem({ count: 5 });
    const attribute = system.object.geometry.getAttribute("position") as BufferAttribute;
    system.dispose();
    const versionAfterDispose = attribute.version;
    const yAfterDispose = attribute.getY(0);
    system.update(50);
    expect(attribute.version).toBe(versionAfterDispose);
    expect(attribute.getY(0)).toBe(yAfterDispose);
  });
});
