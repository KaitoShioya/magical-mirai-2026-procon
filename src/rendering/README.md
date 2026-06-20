# rendering — 単一WebGL描画領域のビュー

- **責務**: 状態を読んで描く「ビュー」。描画器の統括・Renderer設定・透視投影と正射影のカメラ・合成パイプライン（パス順／性能劣化制御／成果物の書出）・シーン組立（光源・水面・舞台土台）・描画対象クラス群（各 update/dispose）・ローダ。
- **禁止依存**: 判定・得点・時刻の論理を持たない（状態を読むだけ）。`profiles`・`tools` を import しない。物体ごとの表示層（`Object3D.layers`）で合成しない（明示的なパス順を使う）。
- **担当Issue**: マイルストーンM2（成果物の書出は #71、舞台土台モデルは #105）
- **確立済みの土台（Issue #8）**: 単一の WebGLRenderer・透視投影カメラ・指数霧（FogExp2）・画素密度上限2・リサイズ追従。寸法計算は `viewport.ts` の純粋関数（`clampPixelRatio`・`computeAspect`）に切り出して単体検証する。WebGL の配線は `renderRoot.ts`（`createRenderRoot`）、定数は `constants.ts`。後続の反射(#9)・発光点(#10)・ブルーム(#11)・カメラ軌跡(#13)・層合成(#15)はこの土台へ積み上げる。
- **公開契約**: `createRenderRoot(container)` は `render()`・`setCameraPose(position, target)`（適用可否を真偽値で返す）・`resize(width, height)`・`state()`・`dispose()` を返す。`state()` の戻り値（診断・検証用）は `webglAvailable`・`pixelRatio`・`drawingBufferWidth`・`drawingBufferHeight`・`clearColorHex`・`cameraAspect`・`cameraPosition`・`cameraDirection`・`cameraPoseRejectedCount` を持つ素の構造とする。
- **カメラ軌跡の本編結線は #59 が担当**: 評価器（`src/utils/cameraTrajectory.ts`、#13）と `setCameraPose` を使い、曲プロファイルのカメラキーフレームから本編プレイ中のカメラ姿勢を毎フレーム駆動するのは Issue #59（TAKEOVER通しプレイ成立）が行う。#13 は評価器・`setCameraPose`・受け入れ診断（暫定キーフレーム）までを担う。
- **取り込み方針**: three.js は必要部品のみを名前付きで取り込む（`import { Scene, Color, FogExp2, PerspectiveCamera, WebGLRenderer, Vector2 } from "three"`）。容量を抑えるため、まとめ取り込み（名前空間取り込み）やデフォルト取り込みは使わない（`docs/research/06-tech-stack-and-architecture.md` §5）。
- **層合成は Issue #15 が担当**: 「3次元を描く→深度情報だけ消す→正射影カメラで2次元層を最前面に重ねる」パス順は Issue #15 が実装する。本Issueでは先取りしない。物体ごとの表示層（`Object3D.layers`）は使わず、明示的なパス順で合成する方針を守る（`docs/decisions/architecture.md` §3.4）。
- **テスト方針**: 寸法計算の純粋関数は Vitest（node環境）で単体検証する。WebGL を生成する配線は node 環境で生成できないため、実ブラウザの Playwright スモーク（`scripts/rendering-smoke.mjs`）で検証する。
- **カメラ軌跡の診断ページ（#13、`diagnostics/cameraTrajectory/`）**: 2種類ある。
  - 受け入れ診断 `camera-trajectory.html`（`main.ts`）: 暫定キーフレームで全曲長を掃引し、滑らか追従・最小速度・適用拒否0・終点一致の指標を `window.__cameraTrajectory` で公開する。`scripts/camera-trajectory-smoke.mjs` が検査し、検証ビルド（`vite.config.ts` の入力）に含む（本番ビルド `--mode app` では非配信）。
  - 目視確認 `camera-trajectory-view.html`（`view.ts`）: 俯瞰視点で軌跡曲線・キーフレーム点・床格子・カメラ位置と注視点と視線方向を描き、評価器の `poseAt` 出力に沿って動かす可視化ツール。**開発サーバ（`npm run dev`）専用**で、ビルド入力・本番配信・スモークには含めない。クエリ `seconds` で1周の再生秒数を変える。
- **WebGL不可時の縮退**: WebGL の描画文脈を生成できない端末では `createRenderRoot` は WebGLRenderer を呼ぶ前に `isWebGL2Available` で判定して縮退し、`webglAvailable` を偽にし描画を無効化する。エンジン・画面・操作は動き続ける。
- 将来の内部構成: 描画器統括 / Renderer / cameras / pipeline / scene / entities / loaders。詳細は `docs/decisions/architecture.md`。
