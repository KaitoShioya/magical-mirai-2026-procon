// ネオン星雲の夜空（Issue #205）。深夜・雨の湖の舞台が暗すぎて中心の初音ミク以外が見えない問題を解消し、
// テーマ「electric of night sky（電子音楽的な夜空）」を表現する。静的画像を使わず、断片シェーダの数式だけで
// 天頂と地平のグラデーション・繊維状のネオン星雲（紫・シアン・菫）・瞬く星を生成する（AI生成アセット不可の規約適合）。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。取り込みは three.js の名前付き取り込みのみ（src/rendering/README.md 方針）。
//
// 性能の設計（最重要）を先に述べる。星雲は座標を別の値雑音で歪めるドメインワーピング（出典 Inigo Quilez）で繊維状に
// 描くと品質が高いが、画素ごとに何度も値雑音を評価するため重い。これを画面全体と湖面反射の双方で毎フレーム評価すると、
// GPUの無い環境（継続的インテグレーション）と低性能のモバイルで描画が極端に遅くなる。そこで、重い星雲とグラデーションは
// 起動時に一度だけ低解像度の方向別テクスチャ（経度緯度に展開した正距円筒の画像）へ焼き込み、毎フレームのドーム描画は
// その焼き込み画像を方向で1回標本化するだけにする。これにより毎フレームの画素計算が安価になり、品質と性能を両立する。
// 星雲のゆっくりした流れは標本化の経度をわずかにずらして表す。星は焼き込むと粗く見えるため、ドームで毎フレーム直接描く
// （区画ごとの擬似乱数による小さな点。にじみはブルーム後処理に任せる）。
//
// 色とブルームの境界: 色はすべて線形RGBで出力し、最終のsRGB変換は最終出力パス（OutputPass）が行う。ブルームは最終
// 出力パスの前（線形空間）で働くため、グラデーション基調と星雲の薄い部分は線形輝度をブルーム下限（0.5）未満に保ち、
// 星と星雲の濃い芯だけが0.5を超えてにじむ。トーンマッピングは変えない（NoToneMapping）。
//
// カメラ追従と描画順: ドームはメッシュの onBeforeRender で、使用中のカメラ（本描画は本カメラ、反射描画は反射カメラ）の
// 世界位置へ中心を合わせ updateMatrixWorld を呼ぶ。three.js は onBeforeRender の後に modelViewMatrix を matrixWorld から
// 計算するため当該描画に反映される。視錐台カリングは更新前の行列で行われるため frustumCulled を偽にする。マテリアルは
// 不透明・深度非関与・霧の影響なしにし、renderOrder を他物体より小さくして最初に全面を描く。焼き込み画像は方向で
// 標本化するためドームの位置に依らず、本描画と反射で同じ夜空が方向で一意に定まる。

import {
  BackSide,
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  type Object3D,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
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

/** ネオン星雲の夜空。シーンへ追加する本体・焼き込み・毎フレーム進行・後始末を提供する。 */
export interface NeonNebulaSky {
  /** シーンへ追加する球メッシュ（内側を向く）。 */
  readonly object3d: Object3D;
  /** 星雲とグラデーションを方向別テクスチャへ一度だけ焼き込む。生成直後に描画器を渡して1回呼ぶ。 */
  bake(renderer: WebGLRenderer): void;
  /** 星の瞬きと星雲の流れの時刻を進める（シェーダの時刻 uniform を加算する。引数は秒）。 */
  update(deltaSeconds: number): void;
  /** 後始末。ジオメトリ・マテリアル・焼き込みテクスチャを解放する。冪等。 */
  dispose(): void;
}

// 球面の分割数。採用理由を先に述べる。グラデーションと星雲と星はすべて断片シェーダが方向ベクトルで計算するため、
// 頂点の細かさは見えにほとんど影響しない。三角形数を抑えて描画を軽くするため、滑らかな球として十分な低い分割
// （経度32・緯度16）を採る。
const SPHERE_WIDTH_SEGMENTS = 32;
const SPHERE_HEIGHT_SEGMENTS = 16;

// 焼き込み画像（正距円筒）の寸法。採用理由を先に述べる。星雲とグラデーションは低い空間周波数のため低解像度でも
// 拡大時に破綻しない。一度だけ描くので品質側に倒し、経度方向1024・緯度方向512を採る（横は360度、縦は180度に対応）。
const BAKE_WIDTH = 1024;
const BAKE_HEIGHT = 512;

// 星の格子の細かさ（方向ベクトルを区切る格子のスケール）。採用理由を先に述べる。値が大きいほど星が細かく多くなる。
// 夜空に程よい数の星が散る密度として90を採る。
const STAR_GRID_SCALE = 90;

// 円周率（シェーダ内で正距円筒の座標変換に使う）。
const PI_GLSL = "3.141592653589793";

// 方向別の値雑音・ドメインワーピングの共有関数。焼き込みシェーダと、星を描くドーム断片シェーダの双方が使う。
const NOISE_GLSL = /* glsl */ `
  float hash13( vec3 p3 ) {
    p3 = fract( p3 * 0.1031 );
    p3 += dot( p3, p3.zyx + 31.32 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }
  vec3 hash33( vec3 p3 ) {
    p3 = fract( p3 * vec3( 0.1031, 0.1030, 0.0973 ) );
    p3 += dot( p3, p3.yxz + 33.33 );
    return fract( ( p3.xxy + p3.yxx ) * p3.zyx );
  }
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
`;

// 焼き込み用の頂点シェーダ（全画面の四角形。正距円筒の座標 vUv を渡す）。
const BAKE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position, 1.0 );
  }
`;

// 焼き込み用の断片シェーダ。正距円筒の座標から方向ベクトルを作り、グラデーションと繊維状の星雲を描く。
// 重い計算（多段の値雑音・二重のドメインワーピング）はここで一度だけ行う。
const BAKE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uNebulaPurple;
  uniform vec3 uNebulaCyan;
  uniform vec3 uNebulaViolet;
  uniform int uNebulaOctaves;

  const float PI = ${PI_GLSL};
  const float NEBULA_BASE_SCALE = 1.4;
  const float NEBULA_WARP = 4.0;
  const float NEBULA_HAZE_GAIN = 0.5;
  const float NEBULA_FILAMENT_GAIN = 1.1;
  const float NEBULA_DUST = 0.7;
  const vec3 BAND_AXIS = vec3( 0.55, 0.62, 0.30 );
  const float BAND_HALF_WIDTH = 0.5;

  ${NOISE_GLSL}

  // 値雑音を複数段重ねた濃淡。段数は uNebulaOctaves（焼き込みは一度だけのため多めに取れる）。
  float fbm( vec3 x ) {
    float total = 0.0;
    float amplitude = 0.5;
    const int MAX_OCTAVES = 6;
    for ( int octave = 0; octave < MAX_OCTAVES; octave++ ) {
      if ( octave >= uNebulaOctaves ) { break; }
      total += amplitude * valueNoise( x );
      x *= 2.0;
      amplitude *= 0.5;
    }
    return total;
  }

  // 天の川のような帯のマスク（帯の中心で1、帯から外れると0）。
  float bandMask( vec3 dir ) {
    vec3 axis = normalize( BAND_AXIS );
    float d = abs( dot( dir, axis ) );
    return 1.0 - smoothstep( 0.0, BAND_HALF_WIDTH, d );
  }

  // 二重のドメインワーピングで繊維状の星雲（ヘイズ・明るい繊維・色）を求める。
  void nebula( vec3 dir, out vec3 nebulaColor, out float haze, out float filament ) {
    vec3 p = dir * NEBULA_BASE_SCALE;
    vec3 q = vec3( fbm( p ), fbm( p + vec3( 5.2, 1.3, 2.7 ) ), fbm( p + vec3( 1.7, 9.2, 4.4 ) ) );
    vec3 r = vec3(
      fbm( p + NEBULA_WARP * q + vec3( 8.3, 2.8, 1.1 ) ),
      fbm( p + NEBULA_WARP * q + vec3( 2.6, 7.4, 5.9 ) ),
      fbm( p + NEBULA_WARP * q + vec3( 4.7, 3.2, 9.8 ) )
    );
    float base = fbm( p + NEBULA_WARP * r );
    float lane = fbm( p * 2.3 + vec3( 3.3 ) );
    float dustMask = 1.0 - NEBULA_DUST * smoothstep( 0.4, 0.85, lane );
    haze = smoothstep( 0.25, 0.75, base ) * dustMask;
    filament = pow( smoothstep( 0.55, 0.95, base ), 2.0 ) * dustMask;
    vec3 col = mix( uNebulaPurple, uNebulaCyan, smoothstep( 0.3, 0.75, q.x ) );
    col = mix( col, uNebulaViolet, smoothstep( 0.45, 0.95, r.y ) );
    nebulaColor = col;
  }

  void main() {
    // 正距円筒の座標（uv 0..1）から方向ベクトルを作る。経度は横、緯度は縦に対応する。
    float lon = ( vUv.x * 2.0 - 1.0 ) * PI;
    float lat = ( vUv.y - 0.5 ) * PI;
    vec3 dir = vec3( cos( lat ) * sin( lon ), sin( lat ), cos( lat ) * cos( lon ) );

    // 基調グラデーション（地平に控えめな明るみ）。線形輝度はブルーム下限0.5を下回る。
    float height = clamp( dir.y, 0.0, 1.0 );
    vec3 baseColor = mix( uHorizonColor, uZenithColor, height );
    float horizonGlow = exp( -max( dir.y, 0.0 ) * 4.0 ) * 0.4;
    baseColor += uHorizonColor * horizonGlow;

    // ネオン星雲（帯と高さで集中）。ヘイズは紫、明るい繊維はシアン寄りにして電子的な発光感とコントラストを出す。
    float band = bandMask( dir );
    float heightAtten = smoothstep( -0.2, 0.1, dir.y );
    float region = band * heightAtten;
    vec3 nebulaColor;
    float haze;
    float filament;
    nebula( dir, nebulaColor, haze, filament );
    vec3 filamentColor = mix( nebulaColor, uNebulaCyan, 0.5 );
    vec3 nebulaContribution = region * ( nebulaColor * haze * NEBULA_HAZE_GAIN + filamentColor * filament * NEBULA_FILAMENT_GAIN );

    gl_FragColor = vec4( baseColor + nebulaContribution, 1.0 );
  }
`;

// ドーム用の頂点シェーダ（模型空間の位置を方向として渡す）。
const DOME_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

// ドーム用の断片シェーダ。焼き込み画像を方向で標本化し（ゆっくりした経度のずれで流れを表す）、星を毎フレーム直接描く。
const DOME_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec3 vDirection;

  uniform sampler2D uBakedSky;
  uniform float uTime;
  uniform float uDriftSpeed;
  uniform float uStarDensity;
  uniform float uStarTwinkleSpeed;
  uniform float uStarBrightness;
  uniform float uStarMinAngularWidth;
  uniform float uStarGridScale;

  const float PI = ${PI_GLSL};

  ${NOISE_GLSL}

  // 星の色温度（淡い橙〜白〜淡い青白）。彩度は控えめにする。
  vec3 starTint( float h ) {
    vec3 warm = vec3( 1.0, 0.93, 0.85 );
    vec3 neutral = vec3( 0.98, 0.98, 1.0 );
    vec3 cool = vec3( 0.86, 0.92, 1.0 );
    vec3 c = mix( warm, neutral, smoothstep( 0.0, 0.5, h ) );
    return mix( c, cool, smoothstep( 0.5, 1.0, h ) );
  }

  // 星の1層。方向を格子に量子化し、区画の擬似乱数が密度を下回る区画だけを小さな丸い点として描く。
  vec3 starLayer( vec3 dir ) {
    vec3 g = dir * uStarGridScale;
    vec3 cell = floor( g );
    vec3 f = fract( g ) - 0.5;
    float present = step( hash13( cell ), uStarDensity );
    vec3 jitter = ( hash33( cell + 7.0 ) - 0.5 ) * 0.5;
    float dist = length( f - jitter );
    float radius = max( uStarMinAngularWidth * uStarGridScale, 0.12 );
    float point = pow( 1.0 - smoothstep( 0.0, radius, dist ), 1.5 );
    float bright = pow( hash13( cell + 13.0 ), 5.0 );
    float phase = hash13( cell + 3.0 ) * 6.2831853;
    float twinkle = 0.7 + 0.3 * sin( uTime * uStarTwinkleSpeed + phase );
    vec3 tint = starTint( hash13( cell + 21.0 ) );
    return present * tint * ( point * bright * twinkle * uStarBrightness );
  }

  void main() {
    vec3 dir = normalize( vDirection );
    // 方向から正距円筒の標本座標を作る。経度を時刻でわずかにずらして星雲の流れを表す（巡回するため繰り返し境界で連続）。
    float u = atan( dir.x, dir.z ) / ( 2.0 * PI ) + 0.5 + uTime * uDriftSpeed;
    float v = asin( clamp( dir.y, -1.0, 1.0 ) ) / PI + 0.5;
    vec3 baked = texture2D( uBakedSky, vec2( u, v ) ).rgb;
    vec3 stars = starLayer( dir );
    gl_FragColor = vec4( baked + stars, 1.0 );
  }
`;

function toVector3(rgb: readonly [number, number, number]): Vector3 {
  return new Vector3(rgb[0], rgb[1], rgb[2]);
}

/**
 * ネオン星雲の夜空を生成する。重い星雲とグラデーションは bake(renderer) で方向別テクスチャへ一度だけ焼き込み、
 * 毎フレームのドーム描画はその標本化と星の描画だけにして安価に保つ。カメラ追従はメッシュの onBeforeRender で行う。
 */
export function createNeonNebulaSky(): NeonNebulaSky {
  // 焼き込み先の方向別テクスチャ（正距円筒）。深度は不要。経度方向は繰り返し（経度の境界で連続）、緯度方向は端で固定。
  const bakeTarget = new WebGLRenderTarget(BAKE_WIDTH, BAKE_HEIGHT, {
    depthBuffer: false,
    stencilBuffer: false,
    wrapS: RepeatWrapping,
    wrapT: ClampToEdgeWrapping,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });

  const bakeScene = new Scene();
  const bakeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bakeGeometry = new PlaneGeometry(2, 2);
  const bakeMaterial = new ShaderMaterial({
    vertexShader: BAKE_VERTEX_SHADER,
    fragmentShader: BAKE_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uZenithColor: { value: toVector3(SKY_ZENITH_COLOR) },
      uHorizonColor: { value: toVector3(SKY_HORIZON_COLOR) },
      uNebulaPurple: { value: toVector3(NEBULA_COLOR_PURPLE) },
      uNebulaCyan: { value: toVector3(NEBULA_COLOR_CYAN) },
      uNebulaViolet: { value: toVector3(NEBULA_COLOR_VIOLET) },
      uNebulaOctaves: { value: NEBULA_OCTAVES },
    },
  });
  const bakeQuad = new Mesh(bakeGeometry, bakeMaterial);
  bakeScene.add(bakeQuad);

  const geometry = new SphereGeometry(SKY_DOME_RADIUS, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
  const material = new ShaderMaterial({
    vertexShader: DOME_VERTEX_SHADER,
    fragmentShader: DOME_FRAGMENT_SHADER,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    fog: false,
    uniforms: {
      uBakedSky: { value: bakeTarget.texture },
      uTime: { value: 0 },
      // 星雲の流れの速さ（経度のずれ）。NEBULA_FLOW_SPEED をごく緩やかな巡回に変換するため小さく掛ける。
      uDriftSpeed: { value: NEBULA_FLOW_SPEED * 0.05 },
      uStarDensity: { value: STAR_DENSITY },
      uStarTwinkleSpeed: { value: STAR_TWINKLE_SPEED },
      uStarBrightness: { value: STAR_BRIGHTNESS },
      uStarMinAngularWidth: { value: STAR_MIN_ANGULAR_WIDTH },
      uStarGridScale: { value: STAR_GRID_SCALE },
    },
  });

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    mesh.position.setFromMatrixPosition((camera as PerspectiveCamera).matrixWorld);
    mesh.updateMatrixWorld();
  };

  let disposed = false;
  return {
    object3d: mesh,
    bake(renderer: WebGLRenderer): void {
      // 焼き込みは一度だけ。描画先を退避してから方向別テクスチャへ描き、元へ戻す。
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(bakeTarget);
      renderer.render(bakeScene, bakeCamera);
      renderer.setRenderTarget(previousTarget);
    },
    update(deltaSeconds: number): void {
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
      bakeGeometry.dispose();
      bakeMaterial.dispose();
      bakeTarget.dispose();
    },
  };
}
