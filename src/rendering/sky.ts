// ネオン星雲の夜空（Issue #205）。深夜・雨の湖の舞台が暗すぎて中心の初音ミク以外が見えない問題を解消し、
// テーマ「electric of night sky（電子音楽的な夜空）」を表現する。静的画像を使わず、断片シェーダの数式だけで
// 天頂と地平のグラデーション・天の川のような帯に集まる繊維状のネオン星雲（紫・シアン・菫）・瞬く星を生成する
// （AI生成アセット不可の規約適合）。状態を読んで描くビューであり、判定・得点・時刻の論理を持たない
// （依存規則 docs/decisions/architecture.md §5）。profiles・tools は import しない。取り込みは three.js の
// 名前付き取り込みのみ（src/rendering/README.md 方針）。
//
// 設計の要点を先に述べる。
// 1. 色はすべて断片シェーダが線形RGBで出力し、最終のsRGB変換は最終出力パス（OutputPass）が行う。ブルームは最終
//    出力パスの前（線形空間）で働くため、グラデーション基調と星雲の薄い部分は線形輝度をブルーム下限（0.5）未満に
//    保ち、星と星雲の濃い芯だけが0.5を超えてにじむ。トーンマッピングは変えない（NoToneMapping）。
// 2. グラデーション・星雲・星は球面の表面座標ではなく、ドーム中心から各画素への正規化方向ベクトルで計算する。
//    ドームは回転を持たないため模型空間の方向は世界方向と一致し、本描画と反射で同じ夜空が方向で一意に定まる。
// 3. 星雲は「光の粒」でなく繊維状の雲に見せるため、ドメインワーピング（値雑音の座標を別の値雑音で歪める手法、
//    出典 Inigo Quilez「Domain Warping」）で雲構造を作る。さらに全天一様を避けるため、天の川のような傾いた帯
//    （方向と帯法線の内積で定義する大円の帯）と高さ（地平より下を減衰）で星雲を集中させる。
// 4. 星はべき乗則（明るい星は少なく暗い星は多い）で明るさを散らし、色温度（橙〜白〜青白）と大きさを変え、帯の方向へ
//    密度を高める。縁を丸めて角度幅に下限を設け、カメラ移動・画素密度の変化でちらつかないようにする。
// 5. カメラ追従はメッシュの onBeforeRender で行う。three.js は onBeforeRender の後に modelViewMatrix を
//    matrixWorld から計算するため、ここで位置を更新し updateMatrixWorld を呼べば当該描画に反映される。視錐台
//    カリングは更新前の行列で行われるため frustumCulled は偽にする。反射の描画では反射カメラが渡されるため、
//    本描画と反射でそれぞれのカメラ中心へドームが合う。
// 6. マテリアルは不透明（transparent:false）・深度非関与（depthTest:false・depthWrite:false）・霧の影響なし
//    （fog:false）にし、renderOrder を他の全物体（既定0）より小さい -1 にして最初に全面を描く（renderOrder が
//    奥行きより優先される主キーのため、位置更新で並び替えの奥行き値が旧値でも描画順が定まる）。

import {
  BackSide,
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  SphereGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import {
  NEBULA_COLOR_CYAN,
  NEBULA_COLOR_PURPLE,
  NEBULA_COLOR_VIOLET,
  NEBULA_FLOW_SPEED,
  NEBULA_OCTAVES,
  SKY_DOME_RADIUS,
  SKY_HORIZON_COLOR,
  SKY_ZENITH_COLOR,
  STAR_BRIGHTNESS,
  STAR_DENSITY,
  STAR_MIN_ANGULAR_WIDTH,
  STAR_TWINKLE_SPEED,
} from "./constants";

/** ネオン星雲の夜空。シーンへ追加する本体・毎フレーム進行・後始末を提供する。 */
export interface NeonNebulaSky {
  /** シーンへ追加する球メッシュ（内側を向く）。 */
  readonly object3d: Object3D;
  /** 星雲の漂いと星の瞬きの時刻を進める（シェーダの時刻 uniform を加算する。引数は秒）。 */
  update(deltaSeconds: number): void;
  /** 後始末。ジオメトリとマテリアルを解放する。冪等。 */
  dispose(): void;
}

// 球面の分割数。採用理由を先に述べる。グラデーションと星雲と星はすべて断片シェーダが方向ベクトルで計算するため、
// 頂点の細かさは見えにほとんど影響しない。三角形数を抑えて描画を軽くするため、滑らかな球として十分な低い分割
// （経度32・緯度16）を採る。
const SPHERE_WIDTH_SEGMENTS = 32;
const SPHERE_HEIGHT_SEGMENTS = 16;

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    // 模型空間の頂点位置をそのまま渡す。断片シェーダで正規化して方向ベクトルとして使う（ドームは無回転のため
    // 模型空間の方向は世界方向に一致する）。
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vDirection;

  uniform float uTime;
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uNebulaPurple;
  uniform vec3 uNebulaCyan;
  uniform vec3 uNebulaViolet;
  uniform float uNebulaFlowSpeed;
  uniform int uNebulaOctaves;
  uniform float uStarDensity;
  uniform float uStarTwinkleSpeed;
  uniform float uStarBrightness;
  uniform float uStarMinAngularWidth;

  // 星雲の形を決める固定値。各値の採用理由を先に述べる。
  // 基準スケール: 方向ベクトルにこの倍率を掛けて値雑音を評価する。空の広い範囲を覆う大きな雲にするため低めの1.4を採る。
  const float NEBULA_BASE_SCALE = 1.4;
  // ドメインワーピングの強さ: 歪めた座標を元座標へ加える倍率。繊維状のうねりを十分に出す4.0を採る（出典 IQ）。
  const float NEBULA_WARP = 4.0;
  // 薄いヘイズ（連続した色雲）の濃さの増幅。採用理由を先に述べる。星雲を「離散した点」でなく連続した雲に見せるには、
  // 帯の中に途切れない薄い色霧を敷くのが要。基調の上に星雲がはっきり読める明るさにしつつ、面では線形輝度が
  // ブルーム下限0.5を超えず白くにじまない0.5を採る。
  const float NEBULA_HAZE_GAIN = 0.5;
  // 明るい繊維（濃い芯のうねり）の濃さの増幅。採用理由を先に述べる。ヘイズの上に明るい筋を重ねて立体感を出す。
  // 細い筋だけが0.5を超えてブルームで光る繊維になり、面では超えない1.1を採る。
  const float NEBULA_FILAMENT_GAIN = 1.1;
  // 暗い塵のレーンの強さ: 別の値雑音が高い所を暗くして塵の筋を作る割合。星雲に陰影と立体感を与える0.7を採る。
  const float NEBULA_DUST = 0.7;
  // 天の川のような帯の法線（傾けた大円の軸）。方向ベクトルとこの法線の内積が0に近い帯に星雲と星を集める。
  // 視界（湖を見下ろす）に斜めの帯が入るよう傾けた軸を採る。正規化はシェーダ内で行う。
  const vec3 BAND_AXIS = vec3( 0.55, 0.62, 0.30 );
  // 帯の半幅（内積の絶対値で測る帯の広がり）。星雲を空の情景として広く見せつつ全天一様は避ける0.5を採る。
  const float BAND_HALF_WIDTH = 0.5;

  // 3次元の擬似乱数（0以上1未満）。整数格子の各点へ決定的な値を割り当てる。出典: Dave Hoskins「Hash without Sine」。
  // 安価ながら格子の規則的な模様（縞・ドット）が出にくい品質のため採る。
  float hash13( vec3 p3 ) {
    p3 = fract( p3 * 0.1031 );
    p3 += dot( p3, p3.zyx + 31.32 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }

  // 区画番号から3成分の擬似乱数ベクトルを作る（星の格子内位置・色・位相に使う）。出典: Dave Hoskins「Hash without Sine」。
  vec3 hash33( vec3 p3 ) {
    p3 = fract( p3 * vec3( 0.1031, 0.1030, 0.0973 ) );
    p3 += dot( p3, p3.yxz + 33.33 );
    return fract( ( p3.xxy + p3.yxx ) * p3.zyx );
  }

  // 3次元の値雑音（隣接8格子点の擬似乱数を滑らかに補間する）。補間は5次（f*f*f*(f*(f*6-15)+10)）で、3次より
  // 滑らかにして雲の縁のドット状の段差を抑える。
  float valueNoise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    f = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
    float n000 = hash13( i + vec3( 0.0, 0.0, 0.0 ) );
    float n100 = hash13( i + vec3( 1.0, 0.0, 0.0 ) );
    float n010 = hash13( i + vec3( 0.0, 1.0, 0.0 ) );
    float n110 = hash13( i + vec3( 1.0, 1.0, 0.0 ) );
    float n001 = hash13( i + vec3( 0.0, 0.0, 1.0 ) );
    float n101 = hash13( i + vec3( 1.0, 0.0, 1.0 ) );
    float n011 = hash13( i + vec3( 0.0, 1.0, 1.0 ) );
    float n111 = hash13( i + vec3( 1.0, 1.0, 1.0 ) );
    float nx00 = mix( n000, n100, f.x );
    float nx10 = mix( n010, n110, f.x );
    float nx01 = mix( n001, n101, f.x );
    float nx11 = mix( n011, n111, f.x );
    float nxy0 = mix( nx00, nx10, f.y );
    float nxy1 = mix( nx01, nx11, f.y );
    return mix( nxy0, nxy1, f.z );
  }

  // 値雑音を複数段重ねた濃淡（雲状の模様）。段数は uNebulaOctaves で固定する。ループ回数を固定にするため最大段数を
  // 定数で回し、有効段数を超えたら寄与を止める（モバイル負荷の安定化）。
  float fbm( vec3 x ) {
    float total = 0.0;
    float amplitude = 0.5;
    const int MAX_OCTAVES = 5;
    for ( int octave = 0; octave < MAX_OCTAVES; octave++ ) {
      if ( octave >= uNebulaOctaves ) {
        break;
      }
      total += amplitude * valueNoise( x );
      x *= 2.0;
      amplitude *= 0.5;
    }
    return total;
  }

  // 天の川のような帯のマスク（帯の中心で1、帯から外れると0）。方向ベクトルと帯の法線の内積だけで求め、値雑音を
  // 使わず軽くする（帯の濃淡の散らしは星雲自身の濃淡に委ねる）。
  float bandMask( vec3 dir ) {
    vec3 axis = normalize( BAND_AXIS );
    float d = abs( dot( dir, axis ) );
    return 1.0 - smoothstep( 0.0, BAND_HALF_WIDTH, d );
  }

  // ドメインワーピングで繊維状の星雲を求める。連続した薄いヘイズと明るい繊維を別々に返し（out 引数）、塵レーンと色も
  // 反映する。値雑音の評価回数を抑えるため、歪みは2成分（横方向）で作り、塵レーンは安価な単一の値雑音で求める。
  void nebula( vec3 dir, out vec3 nebulaColor, out float haze, out float filament ) {
    vec3 flow = vec3( uTime * uNebulaFlowSpeed, uTime * uNebulaFlowSpeed * 0.6, 0.0 );
    vec3 p = dir * NEBULA_BASE_SCALE + flow;
    // 座標を別の値雑音で歪める（ドメインワーピング）。歪めた座標で濃さを評価すると繊維状のうねりが出る。
    vec2 warp = vec2( fbm( p ), fbm( p + vec3( 5.2, 1.3, 2.7 ) ) );
    vec3 warped = p + NEBULA_WARP * vec3( warp, 0.0 );
    float base = fbm( warped );
    // 暗い塵のレーン（単一の値雑音が高い所を暗くする。fbm より安価）。
    float lane = valueNoise( p * 2.3 + vec3( 3.3 ) );
    float dustMask = 1.0 - NEBULA_DUST * smoothstep( 0.4, 0.85, lane );
    // 連続した薄いヘイズ（広い範囲を途切れず覆う色霧）と、その上に重なる明るい繊維（濃い芯のうねり）。
    haze = smoothstep( 0.25, 0.75, base ) * dustMask;
    filament = pow( smoothstep( 0.55, 0.95, base ), 2.0 ) * dustMask;
    // 色を歪み成分で混ぜる（紫を基調にシアンと菫を織り交ぜ、一様な単色を避ける）。
    vec3 col = mix( uNebulaPurple, uNebulaCyan, smoothstep( 0.3, 0.75, warp.x ) );
    col = mix( col, uNebulaViolet, smoothstep( 0.45, 0.95, warp.y ) );
    nebulaColor = col;
  }

  // 星の色温度（淡い橙〜白〜淡い青白）を擬似乱数 h（0以上1未満）から作る。彩度は控えめにする。
  // 理由を先に述べる。星はほぼ白に近い淡い色味にするほうが自然で、湖面反射でも彩度の高い色の点が散らばって
  // チープに見えるのを避けられる。
  vec3 starTint( float h ) {
    vec3 warm = vec3( 1.0, 0.93, 0.85 );
    vec3 neutral = vec3( 0.98, 0.98, 1.0 );
    vec3 cool = vec3( 0.86, 0.92, 1.0 );
    vec3 c = mix( warm, neutral, smoothstep( 0.0, 0.5, h ) );
    return mix( c, cool, smoothstep( 0.5, 1.0, h ) );
  }

  // 星の1層（控えめな副要素）。方向を格子に量子化し、区画の擬似乱数が密度を下回る区画だけを星にする。星は区画の
  // 中心近くに置いた小さな丸い点として描き、にじみ（ハロー）はシェーダで作らずブルーム後処理に任せる。
  // 理由を先に述べる。区画ごとに大きなにじみを描くと、にじみが区画の境界で四角く切れて「ぼやけた四角」に見えて
  // しまう。点を小さく保ち区画内に収めれば四角い切れが出ず、明るい星はブルームで自然なにじみになる。明るさは
  // べき乗則で散らし（明るい星は少なく暗い星は多い）、色温度と瞬きを与える。
  vec3 starLayer( vec3 dir, float gridScale, float density ) {
    vec3 g = dir * gridScale;
    vec3 cell = floor( g );
    vec3 f = fract( g ) - 0.5;
    float present = step( hash13( cell ), density );
    // 区画中心から±0.25以内へ星を散らす（区画内に収め境界での四角い切れを防ぐ）。
    vec3 jitter = ( hash33( cell + 7.0 ) - 0.5 ) * 0.5;
    float dist = length( f - jitter );
    // 星の半径（格子空間）。角度の最小丸め幅を格子スケールで換算し、区画内に収まる小さな点にする。
    float radius = max( uStarMinAngularWidth * gridScale, 0.12 );
    float point = pow( 1.0 - smoothstep( 0.0, radius, dist ), 1.5 );
    // べき乗則: 明るい星は少なく暗い星は多い（5乗で多くを暗側へ強く寄せ、まばらな明るい星だけ目立たせる）。
    float bright = pow( hash13( cell + 13.0 ), 5.0 );
    float phase = hash13( cell + 3.0 ) * 6.2831853;
    float twinkle = 0.7 + 0.3 * sin( uTime * uStarTwinkleSpeed + phase );
    vec3 tint = starTint( hash13( cell + 21.0 ) );
    return present * tint * ( point * bright * twinkle * uStarBrightness );
  }

  void main() {
    vec3 dir = normalize( vDirection );

    // 基調グラデーション。方向の高さ成分（地平0・天頂1）で地平色と天頂色を補間し、地平に控えめな明るみを足す
    // （大気散乱の近似）。いずれも線形輝度はブルーム下限0.5を下回り、白くにじまない。
    float height = clamp( dir.y, 0.0, 1.0 );
    vec3 baseColor = mix( uHorizonColor, uZenithColor, height );
    float horizonGlow = exp( -max( dir.y, 0.0 ) * 4.0 ) * 0.4;
    baseColor += uHorizonColor * horizonGlow;

    // 天の川のような帯と高さで星雲・星を集中させる係数。地平より下は減衰させる（地形・水面に隠れる領域）。
    float band = bandMask( dir );
    float heightAtten = smoothstep( -0.2, 0.1, dir.y );
    float region = band * heightAtten;

    // ネオン星雲。連続した薄いヘイズ（広く途切れない色雲）と明るい繊維を重ね、塵レーンで陰影を付ける。
    // ヘイズは基調の紫、明るい繊維はシアン寄りにして電子的な発光感とコントラストを出す。
    vec3 nebulaColor;
    float haze;
    float filament;
    nebula( dir, nebulaColor, haze, filament );
    vec3 filamentColor = mix( nebulaColor, uNebulaCyan, 0.5 );
    vec3 nebulaContribution = region * ( nebulaColor * haze * NEBULA_HAZE_GAIN + filamentColor * filament * NEBULA_FILAMENT_GAIN );

    // 星（控えめな副要素）。1層のみ。帯の方向へわずかに密度を高める。
    float starBandBoost = mix( 0.7, 1.4, band );
    vec3 stars = starLayer( dir, 90.0, uStarDensity * starBandBoost );

    gl_FragColor = vec4( baseColor + nebulaContribution + stars, 1.0 );
  }
`;

function toVector3(rgb: readonly [number, number, number]): Vector3 {
  return new Vector3(rgb[0], rgb[1], rgb[2]);
}

/**
 * ネオン星雲の夜空を生成する。内側を向いた球メッシュに方向ベクトル基準の断片シェーダを与え、最背面に不透明で
 * 描く。カメラ追従はメッシュの onBeforeRender で行い、本描画と反射のそれぞれのカメラ中心へドームを合わせる。
 */
export function createNeonNebulaSky(): NeonNebulaSky {
  const geometry = new SphereGeometry(SKY_DOME_RADIUS, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);

  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: BackSide,
    // 深度に関与せず、霧の影響も受けず、不透明として最初に全面を塗る。
    depthTest: false,
    depthWrite: false,
    transparent: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uZenithColor: { value: toVector3(SKY_ZENITH_COLOR) },
      uHorizonColor: { value: toVector3(SKY_HORIZON_COLOR) },
      uNebulaPurple: { value: toVector3(NEBULA_COLOR_PURPLE) },
      uNebulaCyan: { value: toVector3(NEBULA_COLOR_CYAN) },
      uNebulaViolet: { value: toVector3(NEBULA_COLOR_VIOLET) },
      uNebulaFlowSpeed: { value: NEBULA_FLOW_SPEED },
      uNebulaOctaves: { value: NEBULA_OCTAVES },
      uStarDensity: { value: STAR_DENSITY },
      uStarTwinkleSpeed: { value: STAR_TWINKLE_SPEED },
      uStarBrightness: { value: STAR_BRIGHTNESS },
      uStarMinAngularWidth: { value: STAR_MIN_ANGULAR_WIDTH },
    },
  });

  const mesh = new Mesh(geometry, material);
  // 最初に全面を描くため、他の全物体（既定0）より小さい描画順にする。
  mesh.renderOrder = -1;
  // 移動するため視錐台カリングを無効にする（カリングは更新前の行列で行われるため誤って隠れるのを防ぐ）。
  mesh.frustumCulled = false;
  // 使用中のカメラ（本描画は本カメラ、反射描画は反射カメラ）の世界位置へドーム中心を合わせる。位置更新の後に
  // 行列を更新して当該描画に反映する。three.js は onBeforeRender の後に modelViewMatrix を matrixWorld から計算する。
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    mesh.position.setFromMatrixPosition((camera as PerspectiveCamera).matrixWorld);
    mesh.updateMatrixWorld();
  };

  let disposed = false;
  return {
    object3d: mesh,
    update(deltaSeconds: number): void {
      // 時刻を進める。非有限な経過は無視する（時計の異常で画面が壊れるのを防ぐ）。
      if (!Number.isFinite(deltaSeconds)) {
        return;
      }
      material.uniforms.uTime.value += deltaSeconds;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  };
}
