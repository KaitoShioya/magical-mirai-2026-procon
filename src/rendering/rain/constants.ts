// 雨パーティクル（環境演出）固有の定数。各値は採用理由を先に述べる。値の出典は試作 src/tools/perf/main.ts。
// three.js を import しない純粋な数値定数のみとし、ユニットテスト（node 環境）から安全に参照できるようにする
// （描画基盤の constants.ts と同じ方針）。色・大きさ・配置範囲・落下速度は試作から逐語的に引き継ぐ。

// 雨粒の既定数。採用理由を先に述べる。深夜の湖を雨で満たす密度として試作で見えを確認済みの値であり、
// 800粒を単一の Points で1回の描画呼び出しで描いても負荷が小さいことを試作で確認している
// （src/tools/perf/main.ts 33行 `num("rain", 800)`）。
export const RAIN_PARTICLE_COUNT_DEFAULT = 800;

// 雨粒の色（16進RGB）。採用理由を先に述べる。深夜の暗い湖の雰囲気に合う青灰色として試作で採用した値
// （src/tools/perf/main.ts 121行）。
export const RAIN_COLOR = 0x6a7ba0;

// 雨粒の大きさ（PointsMaterial の size）。採用理由を先に述べる。雨筋を細く見せる試作採用値
// （src/tools/perf/main.ts 122行）。
export const RAIN_POINT_SIZE = 0.07;

// 雨粒の不透明度（0〜1）。採用理由を先に述べる。半透明で雨粒の重なりに奥行きを出す試作採用値であり、
// Issue #12 の技術要件（opacity 0.5）に一致する（src/tools/perf/main.ts 124行）。
export const RAIN_OPACITY = 0.5;

// 雨粒の落下速度（毎秒のワールド単位）。採用理由を先に述べる。試作は THREE.Clock.getDelta()（秒）に26を
// 乗じて落下させるため、落下速度は毎秒26ワールド単位である（src/tools/perf/main.ts 211行 `-= dt * 26`）。
export const RAIN_FALL_SPEED_PER_SECOND = 26;

// 雨の柱の高さ（ワールド単位）。採用理由を先に述べる。試作は初期Yを `random*40` で 0以上40未満に配置し、
// 地面（Y<0）に達した粒へ40を加算して上端へ戻す。初期配置の高さと巻き戻し加算量はともに40で一致するため、
// 一つの定数で表す（src/tools/perf/main.ts 113行・212行）。
export const RAIN_WRAP_HEIGHT = 40;

// 雨の水平方向（X・Z）の広がりの全幅（ワールド単位）。採用理由を先に述べる。試作は `(random-0.5)*90` で
// 中心から±45（全幅90）に散らす（src/tools/perf/main.ts 112行・114行）。
export const RAIN_AREA_SIZE = 90;

// 1フレームの時間差の上限（ミリ秒）。採用理由を先に述べる。100ミリ秒は毎秒10フレームに相当し、これを下回ると
// 動き自体が既に目に見えて滑らかでなくなる水準である。上限100ミリ秒なら1フレームの落下量は最大で
// 26×0.1＝2.6ワールド単位であり、巻き戻し加算量40を大きく下回るため、Yが0未満になった粒へ一度だけ40を
// 加算すれば必ず有効範囲（0以上40未満）へ戻ることが保証される。この保証は直前のYが有効範囲にある不変条件の上で
// 成り立ち、外部から壊れた配列を渡された場合までは保証しない。
export const RAIN_MAX_DELTA_MS = 100;
