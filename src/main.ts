// アプリ本体の入口。文書要素の起動と統括の生成に薄く保つ。
// 5画面状態の遷移そのものは src/screens（Issue #2）が、統括（生成と結線）は src/app が担う。
// 以降の本実装は担当Issueで各ディレクトリに追加する:
//   TextAlive の起動とロード失敗導線 → src/textalive（Issue #4）
//   ゲームループと固定時間刻み → src/engine（Issue #3）
import "./style.css";
import { createApp } from "./app";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app 要素が見つかりません");
}

// 画面表示領域。状態機械はこの要素の直下に常に1つの画面だけを表示する。
const screenRoot = document.createElement("div");
screenRoot.className = "screen-root";
app.replaceChildren(screenRoot);

// 診断モードの判定のみを行い、その真偽を統括へ渡す。
// 状態履歴アクセサ window.__screenHistory の取り付けと削除は統括（src/app）が担う。
const diagnostics = new URLSearchParams(window.location.search).get("smoke") === "1";

createApp(screenRoot, { diagnostics });
