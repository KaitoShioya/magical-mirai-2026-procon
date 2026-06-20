// 描画基盤の定数。各値は採用理由を先に述べる。値の出典は試作（src/tools/perf/main.ts）と
// docs/research/03-rendering-ui.md・docs/decisions/architecture.md §3.8。
// three.js を import しない（純粋関数 viewport.ts から安全に参照できるようにするため）。

// 画素密度の上限。採用理由を先に述べる。描画画素数は表示画素数×画素密度倍率で決まり、上限を設けないと
// 高密度の端末で描画画素が過大になり毎秒60フレームを割る。これを抑える第一の手段として上限を2に固定する
// （docs/decisions/architecture.md §3.8、docs/research/03-rendering-ui.md §3）。
export const MAX_PIXEL_RATIO = 2;

// 深夜の湖の背景色（クリアカラー）。採用理由を先に述べる。舞台は深夜・雨の暗い湖であり、試作で狙いの
// 見えを確認済みのこの暗色を背景とクリアカラーに用いる（src/tools/perf/main.ts、docs/research/03-rendering-ui.md §1）。
export const NIGHT_COLOR = 0x05060a;

// クリアカラーの16進文字列表現（検証で参照する）。NIGHT_COLOR から機械的に導出し二重定義を避ける。
// padStart(6, "0") で6桁に揃える（0x05060a は先頭の0が落ちるため）。
export const NIGHT_COLOR_HEX = NIGHT_COLOR.toString(16).padStart(6, "0");

// 指数的な霧の濃さ。採用理由を先に述べる。夜景は可視ジオメトリが少なく、霧で遠景を闇に沈めると奥行きが
// 出る。試作で破綻なく描けた濃さ0.012を採る（src/tools/perf/main.ts）。
export const FOG_DENSITY = 0.012;

// 透視投影カメラの視野角（度）。採用理由を先に述べる。試作で湖面・灯し・文字が無理なく収まり、後続の
// カメラ軌跡（Issue #13）もこの視野角の試作軌跡で調整されているため60度を採る。
export const CAMERA_FOV = 60;

// 近接面・遠方面（ワールド単位）。採用理由を先に述べる。湖の規模（試作の平面400四方・灯し半径およそ28）を
// 余裕をもって収め、近接の欠けと遠方の打ち切りを起こさない範囲として試作と同じ0.1と500を採る。
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 500;

// 発光点（灯し）の既定色。採用理由を先に述べる。色は線形sRGBの数値タプルで置き、Color への変換は
// 発光点ファクトリ（entities/glowPoints.ts）側で行う。constants は three.js を import しない方針のため
// （純粋関数 viewport.ts から安全に参照させるため）、ここに Color を置かない。値はひまわり=オレンジ・
// 蝶=ネオンブルーで、出典は試作（src/tools/perf/main.ts）と docs/research/02-non-text-expression.md §5。
export const GLOW_ORANGE_RGB: readonly [number, number, number] = [1.0, 0.5, 0.12];
export const GLOW_NEON_RGB: readonly [number, number, number] = [0.12, 0.7, 1.0];

// 発光点の既定形状（球）の半径と分割数。採用理由を先に述べる。最終形状はひまわり（#60）・蝶（#61）が
// 決めるため、基盤の既定は試作と同じ簡素な球の仮置きとし、半径0.18・経度緯度の分割8を採る（出典は試作）。
export const GLOW_SPHERE_RADIUS = 0.18;
export const GLOW_SPHERE_SEGMENTS = 8;
