// 反射水面（Issue #9）。深夜の暗い湖面を、平面反射方式（水面を鏡とみなし鏡像位置のカメラで世界を
// もう一度描く方式）で描く描画対象。描画基盤（renderRoot）が組み立て、シーンへ追加し、後始末する。
// 状態を読んで描く「ビュー」であり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
//
// 取り込みは名前付き取り込みのみとする（src/rendering/README.md の取り込み方針）。名前空間取り込みや
// デフォルト取り込みは容量を抑える方針に反するため使わない。試作（src/tools/perf/main.ts・
// docs/poc/src/prototype/main.js）は名前空間取り込みを用いるが、検証用ツールであり本番の取り込み方針の
// 対象外であるため、本編の本ファイルでは名前付き取り込みへ揃える。
//
// 水面の寸法と位置は、舞台土台モデル（Issue #105）が読み込めたとき options.waterRegion で渡される。
// 平面反射（Reflector）の反射面の向きは対象オブジェクトの向きで決まるため、土台モデルのジオメトリを直接
// 受け取らず、平面を作り x軸まわりに-90度回して水平化するこの実績経路に固定する。土台モデルの water は
// 領域の識別用マーカーであり、その境界箱から得た寸法・中心・高さ（waterRegion）でここが平面を作り直す。

import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { WATER_COLOR, WATER_PLANE_SIZE } from "./constants";
import { withReflectionHidden } from "./reflectionExclusion";
import type { WaterRegion } from "../types/stage";

/**
 * 反射水面の外部契約。呼び出し側を three.js の具象型（Reflector）に依存させないための抽象。
 */
export interface Water {
  /** シーンへ追加する描画対象。 */
  readonly object3d: Object3D;
  /** 反射が有効（Reflector を使う）なら真、無効（不透明な面）なら偽。診断・検証用。 */
  readonly reflective: boolean;
  /** 反射が有効なときの一辺の画素数。無効時は0。診断・検証用。 */
  readonly reflectionResolution: number;
  /**
   * 物体を反射に映すかどうかを切り替える（Issue #92）。excluded が真のとき、その物体を反射テクスチャの
   * 描画から外す（visible 制御による。本描画には残る）。excluded が偽のとき、反射へ含める（既定）。
   * 戻り値は「この呼び出しが実際の反射描画に影響するか」であり、反射が有効なら真、無効なら偽を返す。
   * 戻り値を設ける理由を先に述べる。反射が無効な水面では除外しても描画が変わらないため、呼び出し側が
   * 性能判定器へ実効変化の有無を正しく伝えられるようにするためである。
   */
  setReflectionExcluded(object: Object3D, excluded: boolean): boolean;
  /** 後始末。ジオメトリ・マテリアル・反射の描画ターゲットを解放する。 */
  dispose(): void;
}

/**
 * 反射水面を生成する。
 * reflectionResolution が0より大きいとき平面反射（Reflector）、0のとき不透明な面（Mesh）を作る。
 * いずれも平面を作り x軸まわりに-90度回して水平にする。平面のローカル法線は+Z で、この回転で法線が上向き
 * （+Y）になり水平な水面になる。平面反射の反射面の向きは対象オブジェクトの向きで決まるため、向きの作り方を
 * この経路に固定して反射面が水平になることを保証する。
 * options.waterRegion を与えたとき、その幅・奥行きの平面を作り、中心と高さ（waterRegion.y）へ置く
 * （舞台土台モデルの水面領域、Issue #105）。与えないとき、原点・高さ0で WATER_PLANE_SIZE 四方の平面を作る
 * （暫定の水面、Issue #9）。いずれの場合も生成した平面のジオメトリは本関数が所有し、dispose で解放する。
 * @param options.reflectionResolution 反射解像度（0は無効、256または512は有効解像度）
 * @param options.waterRegion 水面領域（幅・奥行き・中心・高さ）。省略時は暫定の原点・高さ0の平面。
 */
export function createWater(options: {
  reflectionResolution: number;
  waterRegion?: WaterRegion;
}): Water {
  const { reflectionResolution, waterRegion } = options;
  const width = waterRegion ? waterRegion.width : WATER_PLANE_SIZE;
  const depth = waterRegion ? waterRegion.depth : WATER_PLANE_SIZE;
  const geometry = new PlaneGeometry(width, depth);

  // 水平化と配置。x軸まわりに-90度回して水平にし、水面領域があれば中心と高さへ置く（なければ原点・高さ0）。
  function place(object: Object3D): void {
    object.rotateX(-Math.PI / 2);
    if (waterRegion) {
      object.position.set(waterRegion.centerX, waterRegion.y, waterRegion.centerZ);
    }
  }

  if (reflectionResolution > 0) {
    const reflector = new Reflector(geometry, {
      textureWidth: reflectionResolution,
      textureHeight: reflectionResolution,
      color: WATER_COLOR,
    });
    place(reflector);

    // 反射から外す物体の集合（Issue #92）。中心オブジェクト固有の方針は持たず、「反射に映さない物体の集合」
    // という一般的な機構である。いつ何を外すかという方針は renderRoot と PERF_LEVELS が持つ。
    const excludedFromReflection = new Set<Object3D>();

    // 反射テクスチャの描画を1回だけ囲むラップを、生成時に1回だけ仕込む（Issue #92）。
    // 生成時1回に限る理由を先に述べる。setReflectionExcluded を呼ぶたびにラップを重ねると反射描画が多重に
    // 走るため、ラップは生成時だけにして集合の中身で除外対象を制御する。
    // 原関数を reflector に束ねて呼ぶ理由を先に述べる。three.js 0.184 の Reflector.onBeforeRender 本体は
    // this._getReflectionCamera と this.forceUpdate を参照するため、this を反射オブジェクトに保たないと
    // 反射カメラの取得で例外になる。可変長引数で委譲して将来の引数追加にも委ねる。
    const originalOnBeforeRender = reflector.onBeforeRender;
    reflector.onBeforeRender = function (
      ...args: Parameters<typeof originalOnBeforeRender>
    ): void {
      withReflectionHidden(excludedFromReflection, () =>
        originalOnBeforeRender.apply(reflector, args)
      );
    };

    return {
      object3d: reflector,
      reflective: true,
      reflectionResolution,
      setReflectionExcluded(object: Object3D, excluded: boolean): boolean {
        if (excluded) {
          excludedFromReflection.add(object);
        } else {
          excludedFromReflection.delete(object);
        }
        return true;
      },
      dispose(): void {
        // Reflector.dispose は描画ターゲットとマテリアルのみ解放しジオメトリを解放しないため、
        // ジオメトリは別途解放する。
        reflector.dispose();
        geometry.dispose();
      },
    };
  }

  const material = new MeshBasicMaterial({ color: WATER_COLOR });
  const mesh = new Mesh(geometry, material);
  place(mesh);
  return {
    object3d: mesh,
    reflective: false,
    reflectionResolution: 0,
    // 反射が無効な水面では反射パスが無いため、除外しても描画は変わらない。何もせず偽を返す（Issue #92）。
    setReflectionExcluded(): boolean {
      return false;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
