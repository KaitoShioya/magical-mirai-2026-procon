# アーキテクチャ設計とディレクトリ構成（確定版）

この文書は、マジカルミライ2026プログラミングコンテスト応募作品の実装アーキテクチャと、ソースコードのディレクトリ構成を確定形で記す。Issue #1 で確立し、後続の全Issueはこの文書を土台とする。各判断は採用した理由を先に述べ、出典を併記する。技術スタックの確定根拠は `docs/research/06-tech-stack-and-architecture.md`、設計判断の根拠は `docs/decisions/app-overall-decisions.md`、作品仕様の正典は `docs/idea/concept-final.md`、規約の正典は `docs/concept.md`、楽曲ロードの正典は `docs/support-page.md` を参照する。

---

## 1. 目的と前提

本作は、テーマ「湖のソナーレ」を舞台に、楽曲に同期して動くキネティックタイポグラフィと、タップで湖を奏でる操作を一体化したリリック・リズム作品である。提出物は静的なWebアプリケーションに限られ、サーバ側で動的応答を返すプログラムと自前のバックエンドAPIは作れない（`docs/concept.md`）。

実装上の前提は次のとおりである。
- 描画は単一のWebGL描画領域に統一する。スマートフォンではWebGL描画領域の数に上限があり、複数領域を重ねると上限に達して描画が壊れるためである（Chromeで実質8、Firefoxのモバイル版で2。出典: https://issues.chromium.org/issues/40939743 、 https://bugzilla.mozilla.org/show_bug.cgi?id=1421481 ）。
- 判定と得点の時刻の源泉は、TextAlive App API の `player.timer.position`（ミリ秒単位の再生位置）とする。
- プログラミング言語はTypeScript、画面の枠組みを作るためのフレームワークは使わない（`docs/research/06-tech-stack-and-architecture.md`）。

---

## 2. 技術スタック（確定）

| 領域 | 採用 | 主な用途 |
|---|---|---|
| 言語 | TypeScript | 型による安全性と読みやすさ |
| 描画 | three.js | 3次元のカメラ移動と2次元描画を単一の描画領域で扱う |
| 3次元の文字 | troika-three-text | 日本語の多数の文字を事前の画像地図なしで動的に描く |
| ミクのモデル | @pixiv/three-vrm | VRoidで自作したVRMモデルを読み込みコードで動かす（後続Issueで導入） |
| 舞台の土台モデル | three.js の glTF ローダー | 陸地と水際の静的な3Dモデルを読み込み配置する（後続Issueで導入） |
| 読ませる歌詞 | ブラウザの文書要素とGSAP | 文字を鮮明に保ち日本語の字詰めを読みやすくする（後続Issueで導入） |
| 操作音 | Web Audio | 音の高さを自由に変え、音源ファイルなしで遅れを小さくする |
| 楽曲と歌詞 | TextAlive App API | コンテストの必須要件。楽曲・歌詞・音楽地図を提供する |
| ビルド | Vite | 開発の即時反映と本番ビルド |
| 配信 | Cloudflare Pages（Cloudflare Accessで限定公開）とGitHub Actions | GitHub Pagesは有料プランでもサイトが一般公開され、規約の募集期間中の一般公開禁止に反するため採らない。Cloudflare Pagesは無料でアクセス制限でき、デプロイはGitHub Actionsで行う（Issue #7で導入） |

@pixiv/three-vrm・GSAP は本Issueでは依存に加えず、各担当Issue（ミクはIssue #64、歌詞はマイルストーンM3）で導入する。先取りして依存を増やさないためである。

---

## 3. 採用アーキテクチャ（各論点と採用理由・出典）

### 3.1 全体構造：薄いモジュール分割＋トップレベルの有限状態機械

**採用理由**：本作は実質的に単一の演奏シーンであり、扱う物体の種類（ノーツ、灯し、カメラ、文字、ミク）が限られる。実体・部品・処理系を総合管理する方式（Entity Component System）は、多数の異種実体・チーム開発・物体が1000体規模になる場面で初めて利益が出る一方、処理系の実行順序の脆さと記述量の増加を今支払うことになる。また、画面の5状態の管理は、総合管理方式の内部でタグを切り替える方式より、外側に置いた有限状態機械の方が明快である。

**決定**：機能ごとに薄く分割したモジュール構成を採り、画面遷移はトップレベルの有限状態機械で扱う。総合管理方式（Entity Component System）は導入しない。
出典: https://gameprogrammingpatterns.com/component.html 、 https://gameprogrammingpatterns.com/state.html 、 https://ajmmertens.medium.com/why-storing-state-machines-in-ecs-is-a-bad-idea-742de7a18e59

### 3.2 ゲームループ：外部の楽曲再生位置を源泉とする固定時間刻み＋描画補間

**採用理由**：判定と得点は端末ごとのフレーム数に左右されてはならない。毎分175拍の楽曲で、フレーム数の違う端末が同じ得点になる必要があるためである。描画の繰り返しはブラウザの描画の合図（requestAnimationFrame）で駆動し、判定と得点は固定の時間刻みで進め、描画はその間を補間する（累積器による「追いつき」方式）。時刻はブラウザの時計ではなく `player.timer.position` の差分で進める。再生位置は毎フレーム更新されるとは限らず段階的に進むため、移動平均で平滑化し、決して後退させない（単調化し）、平滑化した推定値と報告値の差が一定の閾値を超えたら再同期する。操作音のスケジュールは、ゲームの時計とは別の時計である `AudioContext.currentTime` を使い、先読みで予約する。ゲームの時計（再生位置）と音声出力の時計（`AudioContext.currentTime`）は別系統であり、混同しない。

**決定**：固定時間刻みの累積器ループと描画補間を採る。ゲームの時計は `player.timer.position` を平滑化・単調化・ずれ補正したものとし、操作音は `AudioContext.currentTime` で予約する。
出典: https://gafferongames.com/post/fix_your_timestep/ 、 https://gameprogrammingpatterns.com/game-loop.html 、 https://web.dev/articles/audio-scheduling 、 https://ddrkirbyisq.medium.com/rhythm-quest-devlog-4-music-game-synchronization-7ae97a2ff9d5

### 3.3 描画と論理の分離：状態を源泉とし描画はビュー

**採用理由**：演出のカメラが3次元空間を移動しても、判定と得点の論理が壊れてはならない。論理を描画から切り離すと、性能の劣化制御で描画機能を削っても論理に影響せず、論理を単体で検証できる。three.jsの物体は状態を映す表示物であり、状態の保持者にはしない。

**決定**：状態を唯一の源泉とし、描画は毎フレーム状態を読んで物体へ反映する「ビュー」とする。
出典: https://iwsdk.dev/concepts/three-basics/interop-ecs-three.html 、 https://dev.to/i_babkov/threejs-architecture-ecs-3fg2

### 3.4 描画層の合成：単一描画領域で3次元の後に2次元を明示的なパス順で重ねる

**採用理由**：3次元の前後関係に関わらず、操作情報の2次元層を確実に手前へ重ねる必要がある。three.jsの物体ごとの表示層（Object3D.layers）はパスの制御が暗黙的になり保守が難しいと複数の実務者が指摘している。

**決定**：単一の描画領域の中で、自動消去を無効にし、遠近を表現するカメラで3次元の世界を描き、深度の情報だけを消し、動かない正射影のカメラで2次元の層を最前面に描く。`Object3D.layers` は使わない。
出典: https://discourse.threejs.org/t/how-to-use-effectcomposer-with-multiple-layers/43896 、 `docs/decisions/app-overall-decisions.md` §3.2

### 3.5 リソースの寿命：取得と破棄を分離する

**採用理由**：three.jsはGPU上の資源（ジオメトリ・マテリアル・テクスチャ・描画対象領域）を自動回収しない。取得は非同期でキャッシュ的、破棄は同期的な走査であり役割が異なる。glTF/VRMのテクスチャは画像ビットマップを明示的に閉じないと漏れる。

**決定**：取得はローダーに集約し、破棄は木構造を走査して `dispose` する共通関数を用意し、各描画クラスに `dispose()` を持たせる。glTF/VRMのテクスチャは破棄時に画像ビットマップを閉じる。
出典: https://www.utsubo.com/blog/threejs-best-practices-100-tips 、 https://threejs.org/docs/#api/en/materials/Material.dispose

### 3.6 内容と論理の分離：曲非依存のエンジンと曲ごとのプロファイル

**採用理由**：共通エンジンと曲ごとのプロファイルを分離すると、1曲目を縦切りで完成させてから他曲へ横展開できる（`CLAUDE.md` 開発ガイドライン）。エンジンに曲固有の分岐を書いた時点で分離は崩れる。プロファイルは設定ではなく内容であり、欠落時は明確に失敗させる。

**決定**：曲非依存の中核（ループ・得点・コードトーン格子・ランク・有限状態機械）と、曲ごとの内容（譜面・効果音・カメラ軌跡・灯しとJUSTのパターン・見せ場マップ）を厳格に分離する。プロファイルは読込時に検証する。
出典: https://dev.to/methodox/data-driven-design-leveraging-lessons-from-game-development-in-everyday-software-5512

カメラ軌跡は「曲ごとの内容」（カメラキーフレーム列）と「曲非依存の評価器」に分かれる。評価器（曲線構築・任意時刻の位置と注視点・軌跡上速度・軌跡上距離と時刻の相互変換）は描画（#40）と判定（#48・#49）が共有するため `src/utils/cameraTrajectory.ts` に置く（依存規則 §5 に反せず双方から使える層のため）。評価器は入力型を自前で定義し `src/profiles/schema` を取り込まない（判定層が評価器経由で曲プロファイル型へ間接依存しないようにする）。Issue #13 は評価器・描画基盤のカメラ姿勢設定（`RenderRoot.setCameraPose`）・受け入れ診断（暫定キーフレームでの全曲長検証）までを担い、検証で保証するのは数値的な正しさと全曲長での駆動・描画反映までとする。実カメラキーフレームの生成は Issue #46、それを読み込んで本編プレイ中にカメラを駆動する結線と、実データでの視認品質の確認は Issue #59 が担う。

### 3.7 入力：画面座標で判定し3次元から逆変換しない

**採用理由**：3次元の物体との交差判定で入力を取ると、カメラ移動で判定面が動き、「外す」概念が生じて失敗のない床に反する。視点が動くリズムゲームは判定を視覚のカメラから切り離し画面座標で判定している。

**決定**：入力の判定面（動かない2次元）、演出のカメラ空間（動く3次元）、画面四隅の操作情報（動かない）の3つを分離し、座標変換は入力から演出への一方向だけに限る。複数の指はPointer Eventsで受け、各接触の識別番号で独立に管理する。
出典: https://phigros.fandom.com/wiki/Game_Mechanics 、 `docs/decisions/app-overall-decisions.md` §3.3

### 3.8 性能予算：画素密度の上限固定を第一とし段階的に劣化させる

**採用理由**：モバイルでは画素密度の上限固定が最も効く。灯しは同じ形を1回の描画命令で多数並べる仕組み（InstancedMesh）で描画命令を1つにまとめる。劣化の切替を毎フレーム行うと画面がちらつくため、一定時間の傾向で判断して段階的に切り替える。

**決定**：画素密度の上限固定を第一とし、性能低下時に画素密度・後処理・任意の描画物体の順で段階的に劣化させる。切替にはヒステリシス（切替の閾値に幅を持たせて振動を防ぐ仕組み）を設ける。
出典: https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/

---

## 4. 確定ディレクトリ構成と各ディレクトリの責務

リポジトリ直下（HTMLの入口名は既存の自動化スクリプトの契約を保つため維持し、設定ファイルはTypeScript版のみをルートに置く）。

| パス | 責務 |
|---|---|
| `index.html` | アプリ本体の入口。`/src/main.ts` を読む |
| `analysis.html` | 開発ツール「楽曲データ解析」の入口。`scripts/dump-songmap.mjs` が参照する |
| `prototype.html` | 開発ツール「描画性能検証」の入口。`scripts/prototype-fps.mjs` が参照する |
| `vite.config.ts` | マルチページ入力とアプリトークン注入 |
| `tsconfig.json` | アプリ（ブラウザ）向け型設定。`strict: true` |
| `tsconfig.node.json` | ビルド設定（`vite.config.ts`）向け型設定。`strict: true` |

`src/` は最上位のサブシステムディレクトリのみを作成し、各ディレクトリのREADMEに責務・禁止依存・担当Issue番号を必ず記す。深い内部構造は事前にディレクトリ化せず、親READMEに将来の内部構成の指針として記述する。

| パス | 責務 | 担当 |
|---|---|---|
| `src/main.ts` | アプリ入口。文書要素の起動とプレースホルダ表示、統括の生成のみに薄く保つ | Issue #1（最小）/ #2 #3 #4 |
| `src/config/` | 定数・調整値と楽曲ロード設定。`songs.ts`（6曲のURLと音楽地図ID）と `tuning.ts`（判定窓・スロット数・タップ上限） | Issue #1（songs最小）/ #5 #6 |
| `src/types/` | 共有型と環境型の宣言 | Issue #1 |
| `src/tools/` | 開発ツール。提出本体には含めない。本体中核から参照されない | Issue #1 |
| `src/app/` | アプリ統括。TextAlive生成・エンジン・画面遷移を結線する | Issue #4 #3 #2 |
| `src/textalive/` | TextAlive Player の生成・ライフサイクル・ロード失敗導線 | Issue #4 |
| `src/engine/` | 曲非依存の中核。固定時間刻みループ（loop）・楽曲再生位置の平滑化と単調化とずれ補正（clock）・進行中のシミュレーション状態（world）を内部に置く | Issue #3 |
| `src/chart/` | ノーツ譜面のデータ模型と時刻索引 | Issue #38 #40 |
| `src/scoring/` | 判定窓・目的関数・ランク（百分位）・自己最高記録 | Issue #48 #55 #56 |
| `src/input/` | Pointer Events 取得と画面座標の当たり判定（3次元の交差判定は使わない） | Issue #47 #48 #49 |
| `src/audio/` | Web Audio による操作音。コードトーン格子と先読みスケジューラ | Issue #52 |
| `src/screens/` | 5画面状態（題名・準備・プレイ・結果・再挑戦）の有限状態機械 | Issue #2 |
| `src/rendering/` | 単一WebGL描画領域のビュー。描画器の統括・Renderer設定・透視投影と正射影のカメラ・合成パイプライン（パス順・性能劣化制御・成果物書出）・シーン組立（光源・水面・舞台土台）・描画対象クラス群（各 update/dispose）・ローダを内部に置く | マイルストーンM2、成果物書出は #71、舞台土台は #105 |
| `src/typography/` | 文字に関わる2副領域。`kineticText/`（troika-three-textによる3次元の演出文字エンジン）と `readableLyrics/`（読ませる歌詞の文書要素とGSAPの重ね層）に分ける | マイルストーンM3（演出文字エンジンは #20、読ませる歌詞は #31） |
| `src/ui/` | 画面四隅の操作情報（得点・コンボ・ゲージ・ランク）の文書要素 | マイルストーンM5 |
| `src/profiles/` | 曲ごとの内容。読込時に検証する定義（schema）と1曲目の内容（takeover）を内部に置く | schemaは #34、takeoverは #46 |
| `src/utils/` | 純粋関数（破棄の走査・数値計算・イベントの仲介・カメラ軌跡評価器 `cameraTrajectory.ts`） | 共通（カメラ軌跡評価器は #13） |

本Issueで実体を置くのは `main.ts`（最小起動）、`src/style.css`（本体の最小スタイル）、`config/songs.ts`、`types/` の型宣言、`tools/analysis/`・`tools/perf/`（移行）のみである。ドメインの型（ノーツ・曲プロファイル等）は各担当Issueが定義するため、本Issueでは先取りしない。

開発ツールとビルド成果物の関係を明確にする。マルチページのビルドは、開発の利便とビルド時の検証のため、本体（`index.html`）に加えて開発ツールの2ページ（`analysis.html`・`prototype.html`）も `dist/` へ出力する。ここでの「開発ツールは提出本体に含めない」とは、開発ツールが**アプリの利用者体験の一部ではなく、本体から参照されない**という意味である。提出時に公開するのは本体 `index.html` のみとし、開発ツールの2ページは配信に含めない（Issue #7 で確定）。本番ビルドは `npm run build:app`（`vite build --mode app`）で本体のみを出力する。

---

## 5. 依存規則（一方向に固定する）

後続のすべての実装はこの規則に従う。

- `engine`・`chart`・`scoring`・`input`・`audio` は `profiles` を import しない。曲固有の内容は引数または読込済みデータとして外から渡す。これにより曲固有分岐がエンジンへ混入するのを防ぐ。
- `rendering` は状態を読むだけで、判定・得点・時刻の論理を持たない。
- 本体中核（`app`・`engine` など）は `tools` を import しない。`tools` は `config/songs.ts` などの共有設定のみを import してよい。依存の向きを本体から開発ツールへ流さないためである。

---

## 6. 時刻と時計の二系統

混同を避けるため、本作は2つの独立した時計を持つ。

1. ゲームの時計：`player.timer.position`（楽曲再生位置、ミリ秒）を源泉とし、平滑化・単調化・ずれ補正したもの。判定・得点・ノーツの配置はこの時計で行う。
2. 音声出力の時計：`AudioContext.currentTime`。操作音の予約と再生はこの時計で行う。

描画の繰り返しの時刻（requestAnimationFrame が渡す時刻や three.js の時計）は演出にのみ使い、判定の基準にはしない。

---

## 7. 守る契約と命名規約

### 7.1 既存の自動化スクリプトの契約

- `analysis.html` は `?song=<キー>` で曲を選び、完了時に `document.title` を `"DUMP_READY"` に設定し、`window.__songMap`（`song.durationSec`・`beats`・`segments`・`phrases` を含む）を公開し、`#status` 要素を持つ。
- `prototype.html` はクエリの値 `refl`・`bloom`・`bloomScale`・`points`・`rain`・`bpm`・`dpr` を解釈し、`window.__fps()`・`window.__avgFps()`・`window.__resetFps()` を公開する。
- マルチページの入口（ルートの `index.html`・`analysis.html`・`prototype.html`）を維持する。

### 7.2 命名規約

- ディレクトリ名・モジュール名は、意味の明確な英単語のみを使う。造語・略語は避ける。
- 各サブシステムのREADMEは、責務・禁止依存・担当Issue番号を必ず含める。
- 開発ツールは `src/tools/` 配下に置き、提出本体の構成（`app`・`engine` など）と混在させない。
- 例外として、あるサブシステムの本体を駆動して性能や品質を測る「受け入れ診断」は、そのサブシステム配下（例: `src/typography/kineticText/diagnostics/`）に置く。理由は、`tools` は共有設定（`config`）以外を import できない一方、受け入れ診断はサブシステム本体を import して駆動する必要があるためである。受け入れ診断の入口HTML（例: `typography.html`）は本番ビルド（`vite build --mode app`）では配信しない。

---

## 8. 出典一覧

- ゲーム設計の型録（状態・部品・ゲームループ）: https://gameprogrammingpatterns.com/
- 固定時間刻みの解説: https://gafferongames.com/post/fix_your_timestep/
- 音声スケジューリングの2つの時計: https://web.dev/articles/audio-scheduling
- リズムゲームの同期の実例: https://ddrkirbyisq.medium.com/rhythm-quest-devlog-4-music-game-synchronization-7ae97a2ff9d5
- 総合管理方式の適用範囲: https://ajmmertens.medium.com/why-storing-state-machines-in-ecs-is-a-bad-idea-742de7a18e59
- 状態を源泉とした描画: https://iwsdk.dev/concepts/three-basics/interop-ecs-three.html 、 https://dev.to/i_babkov/threejs-architecture-ecs-3fg2
- three.jsのプロジェクト構成: https://pierfrancesco-soffritti.medium.com/how-to-organize-the-structure-of-a-three-js-project-77649f58fa3f 、 https://threejs-journey.com/lessons/code-structuring-for-bigger-projects
- 描画層の合成とパス順: https://discourse.threejs.org/t/how-to-use-effectcomposer-with-multiple-layers/43896
- リソースの破棄: https://www.utsubo.com/blog/threejs-best-practices-100-tips 、 https://threejs.org/docs/#api/en/materials/Material.dispose
- 性能の最適化と劣化制御: https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/
- WebGL描画領域の数の上限: https://issues.chromium.org/issues/40939743 、 https://bugzilla.mozilla.org/show_bug.cgi?id=1421481
- 視点が動くリズムゲームの判定: https://phigros.fandom.com/wiki/Game_Mechanics
- Viteのマルチページ構成: https://vite.dev/guide/build
