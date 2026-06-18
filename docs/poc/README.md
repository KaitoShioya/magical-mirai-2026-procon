# 技術検証用の試作（凍結資料）

このディレクトリは、アプリ本体を新規構築する前に、要素技術を個別に確かめた試作を凍結したものである。**Issue #1 のアーキテクチャ確立に伴いここへ退避した参照資料であり、Viteの入力ではない。**

## 重要な注意

- **これらはViteのビルド対象ではない。** ルートの新しい `index.html`・`analysis.html`・`prototype.html` が本番の入口である。
- **このディレクトリのHTMLは単体では動作しない。** 各HTMLは `/src/...`（リポジトリルート基準）を参照したままのため、この場所から開いてもスクリプトを読めない。あくまでコードの参照用である。
- 本体および開発ツールの新実装は、これらを参照しつつTypeScriptで作り直した（`src/main.ts`・`src/config/songs.ts`・`src/tools/analysis/`・`src/tools/perf/`）。

## 各ファイルが検証した事項と新構成での後継

| ファイル | 検証した事項 | 新構成での後継 |
|---|---|---|
| `index.html` / `src/main.js` | TextAlive再生・歌詞のフレーズ/単語同期表示・再生制御 | 本体入口 `index.html` / `src/main.ts`（最小起動）。歌詞表示の本実装はマイルストーンM3 |
| `src/songs.js` | 6曲のバージョン固定URLと音楽地図IDの定義 | `src/config/songs.ts`（`docs/support-page.md` と照合して再構成） |
| `analysis.html` / `src/analyze.js` | 楽曲データ（ビート・コード・サビ・歌詞・声量・感情値）のダンプ | `analysis.html` / `src/tools/analysis/main.ts`（契約 `window.__songMap`・`document.title="DUMP_READY"` を維持） |
| `prototype.html` / `src/prototype/main.js` | 深夜の湖・平面反射・発光ブルーム・3次元カメラ移動・文字描画の毎秒フレーム数計測 | `prototype.html` / `src/tools/perf/main.ts`（契約 `window.__fps`・クエリノブを維持） |
| `vite.config.js` | マルチページ入力とアプリトークン注入 | `vite.config.ts` |

確定したアーキテクチャとディレクトリ構成は `docs/decisions/architecture.md` を参照する。
