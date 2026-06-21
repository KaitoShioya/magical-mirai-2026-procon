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

// ブルーム後処理のパラメータ（Issue #11）。発光点をにじませる強さ・広がり・にじませる明るさの下限。
// 採用理由を先に述べる。これらは Issue #11 の技術要件に明示された値であり、試作（src/tools/perf/main.ts）で
// 狙いの見えを確認済みのため、その値（強さ1.2・広がり0.6・明るさの下限0.5）をそのまま採る。
export const BLOOM_STRENGTH = 1.2;
export const BLOOM_RADIUS = 0.6;
export const BLOOM_THRESHOLD = 0.5;

// ブルーム入力解像度の倍率。採用理由を先に述べる。ブルームのぼかしは重い後処理で、コストは描画対象の面積に
// 比例する。表示寸法（CSS画素）の半分でぼかすと、画素密度の高い端末ほどブルームが相対的に安くなり毎秒60
// フレームの目標に資する。試作（src/tools/perf/main.ts）も同じ倍率0.5で計測済みのため、本編もこの値を採り
// 計測値を引き継ぐ（docs/research/03-rendering-ui.md §3）。
export const BLOOM_RESOLUTION_SCALE = 0.5;

// 拍同期ポストエフェクト（Issue #17）の描画固定値。周縁減光（ビネット）と強拍時の色収差バーストのうち、
// シェーダのみが消費する視覚パラメータをここに置く（拍バーストの減衰時定数は app の統括と描画診断の双方が
// 消費する楽曲非依存の時間値のため src/config/tuning.ts に置く）。出典は docs/research/02-non-text-expression.md §2。

// 周縁減光の基準強度。採用理由を先に述べる。受け入れ基準「視線が中央へ誘導される」を満たすには周縁を
// 明確に落とす必要があるが、落としすぎると情報が見えなくなる。四隅を中心の約6割の明るさへ落とす0.4を
// 初期値とし、実機のプレイ検証で0.3から0.5の範囲で調整する。★暫定。
export const POST_VIGNETTE_BASE_STRENGTH = 0.4;

// 減光を始めない中心の半径（中心0・四隅1の正規化距離）。採用理由を先に述べる。画面中央の歌詞・ミクを
// 保護し視線誘導の核を残すため、中央0.35の円内は減光しない。★暫定。
export const POST_VIGNETTE_INNER = 0.35;

// 減光が最大に達する半径（中心0・四隅1の正規化距離）。採用理由を先に述べる。0.85で最大に達し四隅まで
// 滑らかに残すことで、帯状の段差を出さず周縁を落とす。smoothstep の外端に与える。★暫定。
export const POST_VIGNETTE_OUTER = 0.85;

// 色収差の最大ずれ（バースト強度1.0・四隅での放射方向のずれ、画面正規化座標0から1の単位）。採用理由を先に
// 述べる。受け入れ基準「色ずれが意図的効果として認識される」には知覚できる量が要るが、常時では不快なため
// 強拍時のみ瞬間的に出す。0.004（横1920画素の画面で四隅方向の横成分が最大約7.7画素に相当）を初期値とし
// 実機調整する。画面正規化座標単位にする理由を先に述べる。画面寸法に依らず知覚量を一定に保ち端末ごとの
// 再調整を不要にする（本効果は物理レンズの模倣でなく一瞬の衝撃という演出目的のため、画素固定より画面比固定
// が適する）。★暫定。
export const POST_CHROMA_MAX_OFFSET = 0.004;
