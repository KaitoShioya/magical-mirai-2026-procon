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

// 水面の平面の一辺（ワールド単位）。採用理由を先に述べる。試作の平面400四方が、灯し半径およそ28・
// 遠方面500・霧の濃さ0.012と破綻なく組めることを確認済みであり、反射面の寸法をこれに合わせる
// （src/tools/perf/main.ts、docs/research/03-rendering-ui.md §1）。
export const WATER_PLANE_SIZE = 400;

// 水面の色。採用理由を先に述べる。試作で深夜の暗い湖面の狙いの見えを確認済みのこの暗色を、反射が
// 有効なときは反射像へ重ねる基調色として、反射が無効なときは不透明な水面の色として用いる
// （src/tools/perf/main.ts、docs/research/03-rendering-ui.md §1）。
export const WATER_COLOR = 0x0a0c12;

// 反射解像度の既定値（一辺の画素数）。採用理由を先に述べる。受け入れ基準が256と512の双方を要求し、
// 既定は高品質側とするため512を採る（docs/research/03-rendering-ui.md §1、Issue #9 技術要件）。
export const DEFAULT_REFLECTION_RESOLUTION = 512;

// 反射解像度として受け付ける値の集合（0は無効化、256と512は可変解像度）。採用理由を先に述べる。
// 技術要件が256・512の可変解像度と、0による無効化のみを規定するため、この3値だけを受け付ける。
export const REFLECTION_RESOLUTIONS = [0, 256, 512] as const;
