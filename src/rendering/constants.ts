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

// ここから下は性能バジェットの自動劣化制御（Issue #18）の定数。所有の出典を先に述べる。
// src/config/tuning.ts は「性能閾値は rendering の #18 が所有する」と定めるため、FPS閾値と段階ラダーの値を
// ここ（rendering の constants）へ集約する。閾値は判定（src/rendering/performanceBudget.ts）が、段階ラダーの
// 描画設定は適用（src/rendering/renderRoot.ts）が参照する。設計と段階順序の出典は
// docs/decisions/architecture.md §3.8（縮退順序は画素密度→後処理、ヒステリシスと時間窓で判断）。

// 制御器が維持を狙う目標の毎秒フレーム数。採用理由を先に述べる。ユーザー決定により目標を60とし、定常で
// 下側閾値55に余裕を持たせる（docs/research/03-rendering-ui.md §3 の目標も60）。
export const PERF_TARGET_FPS = 60;

// 劣化を発火する下側の毎秒フレーム数。採用理由を先に述べる。受け入れ基準の下限が平均55以上であり、時間窓の
// 平均がちょうど55へ沈んだ時点で劣化を発火すると、下限を割る前に守りに動くため55を不変条件にできる。
export const PERF_DOWNSHIFT_FPS = 55;

// 復帰を発火する上側の毎秒フレーム数。採用理由を先に述べる。復帰の閾値は60未満に置く必要がある（垂直同期の
// 揺れで平均がちょうど60に届くことは稀で、60以上を要求すると永久に劣化のままになる）。同時に下側55より上に
// 置き不感帯を作る。58は下側との差を3フレーム毎秒確保しつつ、十分目標近くまで回復してから戻す値である。
export const PERF_UPSHIFT_FPS = 58;

// 平均と最低を求める時間窓（ミリ秒）。採用理由を先に述べる。§3.8は一定時間の傾向で判断せよと定める。2秒は
// 60フレーム毎秒で約120フレームに相当し、数回のごみ集め停止が平均を支配しない程度に長く、約2秒で低下を
// 捉える程度に短く、ゲートの定常区間（10秒以上）より十分短い。
export const PERF_WINDOW_MS = 2000;

// 下降の滞留時間（ミリ秒）。採用理由を先に述べる。各段階変更は描画バッファ再確保の一度きりの負荷を伴う。
// 時間窓（2秒）より長い3秒にすると、次の判定までに窓が変更後のデータで満ち、変更前の古い標本で連鎖的に
// 変更しない。下降を最短3秒間隔に抑える。
export const PERF_DOWNSHIFT_DWELL_MS = 3000;

// 復帰の滞留時間（ミリ秒）。採用理由を先に述べる。復帰は重い設定へ戻すため、戻した直後に維持できないと劣化と
// 復帰の往復になる。下降の滞留より十分長い8秒にして、端末に余裕があると確かめてから戻す。8秒は時間窓2秒の
// 4倍で、復帰後も窓が新データで満ちる余地が十分ある。
export const PERF_RECOVERY_DWELL_MS = 8000;

// 1フレームの経過時間の頭打ち（ミリ秒）。採用理由を先に述べる。100ミリ秒は1フレームあたり10フレーム毎秒相当で、
// 本当に遅い1フレームとして記録するに十分大きく、2秒窓の平均を1フレームで55未満へ落とさない程度に小さい。
// タブ復帰直後や起動直後の極端な経過が窓を壊すのを防ぐ。
export const PERF_FRAME_DELTA_CLAMP_MS = 100;

/** 劣化段階1つぶんの描画設定。段階が上がるほど負荷の軽い設定になる。 */
export interface PerfLevelSetting {
  /** この段階で用いる画素密度倍率の動的上限。実効倍率は min(端末倍率, MAX_PIXEL_RATIO, この値) になる。 */
  pixelRatioCap: number;
  /** この段階で用いるブルーム解像度倍率。 */
  bloomResolutionScale: number;
  /** この段階でブルームを有効にするか。 */
  bloomEnabled: boolean;
}

// 劣化段階のラダー（段階0が最高画質、段階が上がるほど軽い）。採用理由を先に述べる。§3.8の縮退順序
// 「画素密度→後処理」を本Issueの対象（画素密度とブルーム）で各操作を一度ずつ訪れる最小の構成にする。
// 段階間の差を一つの操作だけにして、各遷移の描画バッファ再確保を最小化する:
//   段階0→1 は画素密度上限だけを2から1へ下げる（§3.8で最も効く第一手段）。
//   段階1→2 はブルーム解像度倍率だけを0.5から0.25へ下げる（面積を4分の1にする）。
//   段階2→3 はブルームの有効だけを偽にする（パスの無効化で再確保を伴わない最も軽い操作）。
// 段階3のブルーム解像度倍率を段階2と同じ0.25に保つのは、段階2→3で倍率を変えず有効だけを切り替え、無駄な
// 再確保を避けるためである。画素密度上限の下限を1にするのは、等倍未満が画面より粗い拡大になり文字やUIが
// 破綻するためである。
export const PERF_LEVELS: readonly PerfLevelSetting[] = [
  { pixelRatioCap: MAX_PIXEL_RATIO, bloomResolutionScale: BLOOM_RESOLUTION_SCALE, bloomEnabled: true },
  { pixelRatioCap: 1, bloomResolutionScale: BLOOM_RESOLUTION_SCALE, bloomEnabled: true },
  { pixelRatioCap: 1, bloomResolutionScale: 0.25, bloomEnabled: true },
  { pixelRatioCap: 1, bloomResolutionScale: 0.25, bloomEnabled: false },
];

// 最大の段階番号（段階総数から1を引いた値）。判定（performanceBudget.ts）は描画設定を知らずにこの整数だけを
// 参照して下降の上限を判断する。
export const PERF_MAX_LEVEL = PERF_LEVELS.length - 1;

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
