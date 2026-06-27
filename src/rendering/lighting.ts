// 夜の照明（Issue #64）。中心に常在するモデル（VRM）を深夜の暗い背景から分離して見せるための光源を組む。
// 状態を読むだけのビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。水面（Reflector）と発光点（光源非依存の MeshBasicMaterial）は照明の影響を
// 受けないため、ここで光源を足してもそれらの既存の見えは変わらず、影響は標準マテリアルのモデルに限られる。
//
// 構成の根拠を先に述べる。舞台は深夜・雨の暗い湖であり、明るく均一に照らすと世界観が崩れる。
// 研究の正典（docs/research/02-non-text-expression.md §4）は「輪郭を縁取る光（リムライト）でモデルを背景から
// 分離する」と定める。これに従い、(1)暗部を完全な黒にしないための淡い環境光と、(2)背後上方からモデルの輪郭を
// 縁取るリムライトを置く。さらに夜空の作り込み（Issue #205）に合わせ、(3)空の色で上から・地面の色で下から弱く
// 照らす半球光を1灯加え、遠景の陸地を立体感を保ったまま可視化する。半球光は影を持たず最も軽い光源で、毎秒60
// フレームの予算に資する。影は扱わない（視認性と負荷を優先し、接地影は後続の範囲とする）。

import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Object3D,
} from "three";

// 淡い環境光の色と強さ。採用理由を先に述べる。月明かりを思わせる寒色を弱く当て、モデルの正面が完全な黒に
// 沈むのを防ぐ。深夜の暗さを壊さないため強さは控えめにする。値は実機目視で調整できる初期値とする。
const AMBIENT_COLOR = 0x6577a0;
const AMBIENT_INTENSITY = 0.55;

// リムライトの色・強さ・位置。採用理由を先に述べる。背後上方からの平行光で、カメラ（z=+34 側）から見て
// モデルの輪郭が縁取られ、暗い背景から分離する。色は作品の差し色であるネオンブルー寄りの寒色白とし、世界観に
// 馴染ませる。位置は原点のモデルの背面（z<0）かつ上方（y>0）に置く。注視点は既定の原点で、モデル位置と一致する。
const RIM_COLOR = 0x9fc7ff;
const RIM_INTENSITY = 1.6;
const RIM_POSITION = { x: -2, y: 7, z: -8 } as const;

// 半球光の色と強さ（Issue #205）。採用理由を先に述べる。空側は夜空の地平に馴染む寒色、地面側は暗い地面色にして、
// 地形を上から空の色・下から地面の色で弱く照らし遠景の陸地を可視化する。強さは初期0.25とし上限の目安を0.35とする。
// 理由を先に述べる。地形は標準マテリアルで、環境光（0.55）に半球光を足すほど最終輝度が上がりブルーム下限0.5に
// 近づく。地形を可視化しつつブルームでにじませない範囲として低めの0.25から始める。値は地形の代表画素輝度を診断で
// 実測して0.5未満を保つよう調整する（超える場合は強さを下げる）。
const HEMISPHERE_SKY_COLOR = 0x3a3f6b;
const HEMISPHERE_GROUND_COLOR = 0x0a0c14;
const HEMISPHERE_INTENSITY = 0.25;

/** 夜の照明。シーンへ追加する本体と、後始末を提供する。 */
export interface NightLighting {
  /** シーンへ追加する光源の入れ物。 */
  readonly object3d: Object3D;
  /** 後始末。光源の保持する資源（方向性光源の影資源など）を解放する。冪等。 */
  dispose(): void;
}

/**
 * 夜の照明を生成する。淡い環境光・背後上方からのリムライト・空と地面の色で弱く照らす半球光の3灯を1つの入れ物に
 * まとめて返す。リムライトの注視点は既定の原点であり、湖の中心（原点）に置くモデルを照らす。半球光は遠景の陸地を
 * 立体感を保ったまま可視化する（Issue #205）。
 */
export function createNightLighting(): NightLighting {
  const group = new Group();

  const ambient = new AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);

  const rim = new DirectionalLight(RIM_COLOR, RIM_INTENSITY);
  rim.position.set(RIM_POSITION.x, RIM_POSITION.y, RIM_POSITION.z);
  // 注視点（target）は既定で原点に置かれる。モデルを原点に配置するため、target をシーンへ追加せずとも原点を向く。

  const hemisphere = new HemisphereLight(
    HEMISPHERE_SKY_COLOR,
    HEMISPHERE_GROUND_COLOR,
    HEMISPHERE_INTENSITY
  );

  group.add(ambient);
  group.add(rim);
  group.add(hemisphere);

  let disposed = false;
  return {
    object3d: group,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      // 光源の dispose を呼ぶ。方向性光源は影用の資源を持ちうるため明示的に解放する。冪等性は disposed で担保する。
      ambient.dispose();
      rim.dispose();
      hemisphere.dispose();
    },
  };
}
