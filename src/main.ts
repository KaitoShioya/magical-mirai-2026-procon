// アプリ本体の入口。
// 本Issue（#1）では文書要素の起動とプレースホルダ表示のみを行う。
// 以降の本実装は担当Issueで各ディレクトリに追加する:
//   TextAlive の起動とロード失敗導線 → src/textalive（Issue #4）
//   5画面状態の遷移 → src/screens（Issue #2）
//   ゲームループと固定時間刻み → src/engine（Issue #3）
//   統括（生成と結線） → src/app
import "./style.css";
import { SONGS } from "./config/songs";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app 要素が見つかりません");
}

app.innerHTML = `
  <main class="placeholder">
    <h1>マジカルミライ2026 リリックアプリ</h1>
    <p>基盤を構築しました。演出・操作・採点は後続の実装で追加します。</p>
    <p class="count">課題曲 ${SONGS.length} 曲を登録済み</p>
  </main>
`;
