# 実装チェックポイント（2026-06-20・Issue #10）

**状態: Issue #10（発光点 InstancedMesh 基盤）の実装を完了。ブランチ `feat/issue-10-glow-points-instanced-mesh` で PR #126 を作成・push 済み。型検査・単体テスト221件・両ビルド・全スモーク（Node 22）に合格。マージへ進む。**
**用途**: セッション喪失時の復帰点（実装フェーズ・マイルストーンM2の発光点基盤）。上流は [[implementation_checkpoint_2026-06-19_issue8]]（three.js 描画基盤）。設計正典は [[phase2_design_checkpoint_2026-06-14]]、ディレクトリと依存規則は `docs/decisions/architecture.md`、灯しの造形と配置の根拠は `docs/research/02-non-text-expression.md` と `docs/research/03-rendering-ui.md`、色と反応強度の写像は `docs/idea/concept-final.md` §5・§6。

## このIssueの役割と境界

- 役割: ひまわりと蝶の発光点を単一の InstancedMesh で描く共通基盤を用意し、下流の灯し実装（#60 ひまわり造形・#61 蝶造形・#62 配置・#63 立ち上げ演出）へ台座を渡す。
- 本Issueで決めないこと（各担当へ委譲）: 最終形状（#60・#61）、配置方針（#62）、本体シーンへの組み込みと立ち上げ演出（#63）、反射（#9）、ブルーム後処理（#11）、カメラ軌跡（#13）、層合成のパス順（#15）。

## 最重要の意思決定

- **受け入れ基準「300個で描画命令が5未満」の決定的検証は実ブラウザ計測**: 描画命令の回数は three.js が直前フレームについて JavaScript 側で計数するため、GPU の無い継続的インテグレーション環境のソフトウェア描画でも正確に得られる。よって発光点のみを描く診断ページ `rendering.html` を Playwright で開き `renderer.info.render.calls` を読む方式を決定的ゲートにし、継続的インテグレーションへ統合した。単体テストで「単一 InstancedMesh・形状1個・材質1個」を確かめるのは構造上の裏付けに位置づける（InstancedMesh 1個は描画命令1回でインスタンス数に依存しないため）。
- **受け入れ基準「色が正確」は固定色定数のインスタンス単位の色への設定**: 画面のピクセルの色は材質色・色空間・トーンマップ・ブルーム・反射・背景合成に左右されるため判定基準に適さない。各インスタンスの色を格納する配列を読み戻し、オレンジ（線形sRGB 1.0, 0.5, 0.12）とネオンブルー（線形sRGB 0.12, 0.7, 1.0）に一致することを単体テストで判定する。
- **描画性能検証ツール（`src/tools/perf/main.ts`）に触れない**: 開発ツールは共有設定のみを取り込む依存規則（`docs/decisions/architecture.md` §5・`src/tools/README.md`）のため、ツールから rendering を取り込めない。よって実機検証は rendering 自身が持つ診断ページで行う（文字診断 `typography.html` の前例に倣う）。
- **基盤は機構のみ・配置方針を持たない**: 配置は呼び手が `setInstance` で位置を渡す。面積一様の半径サンプラは純粋関数として切り出し、下流と診断・検証が使う補助に留める。

## Issue #10 本体で実装した内容

- `src/rendering/entities/glowPoints.ts`（新規）: ファクトリ `createGlowPoints`。単一 InstancedMesh を持ち、`setInstance`（位置・等方スケール・色・輝度）・`setVisibleCount`（実際に描く個数）・`commit`（GPUへの反映指示）・`dispose`（後始末）を持つ。
- `src/rendering/entities/glowPoints.test.ts`（新規）: 実物の InstancedMesh を node で構築し、行列・色の配列を読み戻して検証する単体テスト18件。
- `src/rendering/entities/glowPointsLayout.ts`（新規）: 純粋関数 `areaUniformRadius`（面積一様の半径サンプラ）と `polarToXZ`（極座標から水平面座標へ）。
- `src/rendering/entities/glowPointsLayout.test.ts`（新規）: 上記2関数の単体テスト7件。
- `src/rendering/diagnostics/glowPoints.ts`・`rendering.html`（新規）: 発光点のみの最小シーンを実ブラウザで1回描き、描画命令の回数と三角形の数を同一スナップショットで `window.__glowState` に公開する診断ページ。本番ビルドでは配信しない。
- `scripts/rendering-glow-smoke.mjs`（新規）: 診断ページを開き、描画命令が5未満かつ三角形が0より大きいことを検査するスモーク。
- `src/rendering/constants.ts`（変更）: 既定色 `GLOW_ORANGE_RGB`・`GLOW_NEON_RGB` と既定形状 `GLOW_SPHERE_RADIUS`・`GLOW_SPHERE_SEGMENTS` を数値タプルで追加（three.js を取り込まない方針のため、Color 化はファクトリ側）。
- `src/rendering/index.ts`（変更）: `createGlowPoints` と型の再輸出。
- `src/types/globals.d.ts`（変更）: 診断アクセサ `__glowState` の型宣言。
- `vite.config.ts`（変更）: 本番以外のビルドの入口へ `rendering.html` を追加（本番ビルドでは除外）。
- `package.json`（変更）: スモークの実行名 `smoke:glow` を追加。
- `.github/workflows/ci.yml`（変更）: 描画基盤スモークの後に発光点スモークの実行手順を追加。

## 採用した数値・規則とその理由（すべて理由を先に述べる）

- 既定色 オレンジ = (1.0, 0.5, 0.12)・ネオンブルー = (0.12, 0.7, 1.0): 試作 `src/tools/perf/main.ts` で狙いの見えを確認済みの値であり、`docs/research/02-non-text-expression.md` §5 のひまわり（オレンジ）と蝶（ネオンブルー）に対応するため、同じ値を採る。
- 既定形状 = 半径0.18・分割8の球: 最終形状はひまわり（#60）と蝶（#61）が決めるため、基盤の既定は試作と同じ簡素な球の仮置きとする。
- 生成直後の可視数 = 0: InstancedMesh のコンストラクタは初期の可視数に容量を入れて全インスタンスを描こうとするため、未設定のインスタンスが描かれるのを防ぐ目的で生成直後は何も描かず、可視化は呼び手の `setVisibleCount` に委ねる。
- 未設定スロットの初期色 = 黒 (0, 0, 0): 発光点はブルームで加算的に光らせるため黒は発光へ寄与せず、可視数を誤って増やしても白で光るより安全である。
- 視錐台カリング = 無効: インスタンス行列を書いた後に境界球は自動再計算されず、古い境界球のままだと画面内なのに描画から外れる事故が起きるため、カリングを無効にする。これは描画命令の回数には影響しない。
- 基準色 = 各成分0以上1以下・輝度 = 0以上で上限なし: 基準色と輝度の役割を分けることで基準色の範囲を一意に定め、1を超える発光量は輝度で表す。
- スモークの描画命令の上限 = 5: 単一 InstancedMesh の描画命令は1回であり、基準が掲げる5未満は余裕を持った上限のため、この値で合否を判定する。

## レビューと検証（事実）

- 計画段階で Codex のレビューを3巡反映: 描画命令の検証を実ブラウザ計測へ格上げ・単体テストを構造上の裏付けへ位置づけ、色の受け入れ基準を固定色のインスタンス単位の色への設定と定義、開発ツールに触れず rendering 診断ページで検証、不正値（容量・索引・値）の明文化、材質の白固定とトーンマップ無効の保証範囲を既定材質に限定、生成直後の可視数0と未設定スロットの黒初期化、診断アクセサ `__glowState` の同一スナップショット公開と型宣言、基準色を0以上1以下に収め輝度で1超を表す方針を採用。
- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run test`（vitest）: 221テスト全通過（新規 glowPoints 18・glowPointsLayout 7 を含む）。
- `npm run build:app`（本番・index.html のみ、Node 22）: 成功。成果物に `rendering.html` を含まない。
- `npm run build`（全ページ、Node 22）: 成功。成果物に `rendering.html` を含む。Node 24系は `vite build` が異常終了する既知の環境問題のため Node 22系（`.nvmrc`）で実施。
- プレビュー（ビルド済み成果物、Node 22）に対する発光点スモーク: 成功。発光点300個の描画命令は1回で上限の5未満、三角形は33600個。
- 既存スモーク（描画基盤・画面遷移・ゲームループ）: いずれも非回帰で成功。

## 次の主要作業

1. PR #126 のゴール基準適合の最終レビューとマージ（本チェックポイント push 後）。
2. マイルストーンM2の後続: #9（平面反射）・#11（ブルーム）・#13（カメラ軌跡）・#15（描画層合成）。発光点基盤の `object`（InstancedMesh 本体）を、本体シーンへ繋ぐ #63 が `createRenderRoot` の場面へ追加する。
3. 下流の灯し実装: #60（ひまわり造形）・#61（蝶造形）・#62（配置）・#63（立ち上げ演出）が本基盤の `setInstance`・`setVisibleCount`・`commit` を使う。反応強度から輝度への写像式は概念段階で未確定（`docs/idea/concept-final.md` §6）で、基盤は輝度の機構のみ提供する。
