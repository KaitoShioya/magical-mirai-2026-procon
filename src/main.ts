// アプリ本体の入口。文書要素の起動と統括の生成に薄く保つ。
// 5画面状態の遷移そのものは src/screens（Issue #2）が、統括（生成と結線）は src/app が担う。
// 以降の本実装は担当Issueで各ディレクトリに追加する:
//   TextAlive の起動とロード失敗導線 → src/textalive（Issue #4）
//   ゲームループと固定時間刻み → src/engine（Issue #3）
import "./style.css";
import { createApp } from "./app";
import { resolveReflectionResolution } from "./rendering";
import { resolveSongKey } from "./profiles/registry";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app 要素が見つかりません");
}

// 描画基盤の常在領域。状態機械が置換する #app とは別に、遷移をまたいで存続させる（Issue #8）。
const stageRoot = document.getElementById("stage");
if (!stageRoot) {
  throw new Error("#stage 要素が見つかりません");
}

// 画面表示領域。状態機械はこの要素の直下に常に1つの画面だけを表示する。
const screenRoot = document.createElement("div");
screenRoot.className = "screen-root";
app.replaceChildren(screenRoot);

// 起動時パラメータを読む。get は同名パラメータが重複したとき最初の値を返すため、refl を重複指定した
// 場合は最初の値が使われる。
// 診断モードの判定と、各機能の起動時パラメータの解釈を行い、その結果を統括へ渡す。
// 状態履歴アクセサ window.__screenHistory の取り付けと削除は統括（src/app）が担う。
const query = new URLSearchParams(window.location.search);
const diagnostics = query.get("smoke") === "1";

// 反射解像度（refl）を解釈する。本番ビルドでも有効にする。採用理由を先に述べる。refl は実機での反射の
// 手動調整手段であり、自動縮退（Issue #97）導入前に反射を切る退避手段として本番でも有用なためである。
const reflectionResolution = resolveReflectionResolution(query.get("refl"));

// ブルームの有無（Issue #11）。?bloom=0 のときだけ無効、未指定や他値は有効（既定有効）。
// 受け入れ基準が bloom=0 を無効条件と明示するため、値が文字列 "0" のときに限り無効と判定する。
const bloomEnabled = query.get("bloom") !== "0";

// 起動曲（song）を解釈する。?song の値を、実装済み（プロファイル束が存在する）曲キーへ丸める。未指定・未実装・未知の
// キーは既定曲へ退避する（resolveSongKey）。題名画面で別曲を選ぶと統括が ?song を更新して再読み込みする。
const songKey = resolveSongKey(query.get("song"));

createApp(screenRoot, { diagnostics, stageRoot, reflectionResolution, bloomEnabled, songKey });
