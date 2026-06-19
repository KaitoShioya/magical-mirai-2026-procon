// アプリ本体の入口。文書要素の起動と統括の生成に薄く保つ。
// 5画面状態の遷移そのものは src/screens（Issue #2）が、統括（生成と結線）は src/app が担う。
// 以降の本実装は担当Issueで各ディレクトリに追加する:
//   TextAlive の起動とロード失敗導線 → src/textalive（Issue #4）
//   ゲームループと固定時間刻み → src/engine（Issue #3）
import "./style.css";
import { createApp } from "./app";
import { resolveReflectionResolution } from "./rendering";

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
// 診断モードの判定のみを行い、その真偽を統括へ渡す。
// 状態履歴アクセサ window.__screenHistory の取り付けと削除は統括（src/app）が担う。
const query = new URLSearchParams(window.location.search);
const diagnostics = query.get("smoke") === "1";

// 反射解像度（refl）を解釈する。本番ビルドでも有効にする。採用理由を先に述べる。refl は実機での反射の
// 手動調整手段であり、自動縮退（Issue #97）導入前に反射を切る退避手段として本番でも有用なためである。
const reflectionResolution = resolveReflectionResolution(query.get("refl"));

createApp(screenRoot, { diagnostics, stageRoot, reflectionResolution });
