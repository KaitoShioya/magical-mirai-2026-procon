# 実装チェックポイント 2026-06-24 Issue #59「TAKEOVER通しプレイ成立」

## 概要
既存の全機構を統括（src/app）で結線し、TAKEOVER を先頭から末尾まで遊べる状態を成立させた統合チェックポイント（M4・P0）。新規ロジックは作らず、判定・採点・操作音・反応強度・カメラ軌跡評価器・曲プロファイル・蝶造形を結線した。ブランチ `worktree-worktree-issue-59-takeover-playthrough`。

## 意思決定（ユーザー確定 2026-06-23）
投下はゲージ満タンで自動発動（見せ場区間内でのみ成立、消費割合×見せ場重みで倍率）。発動専用操作は設けない。入力モジュールは変更しない。正典反映済み: `docs/idea/concept-final.md` §8、`docs/decisions/app-overall-decisions.md` §3.6。

## 実装範囲とファイル
- `src/app/playSession.ts`（新規）: プレイ進行の採点・判定・音・光の統合。副作用の出口（操作音・反応光点・フレーム時刻標本・較正値）を注入し node で単体検証可能。reset/onReaction/updateFrame/rankGaugeState/finalResult/diagnostics/tryAutoDeploy。
  - スロット起点変換: 判定用ノーツは `slot0 = note.slotIndex - 1`（profiles は1始まり、判定は0始まり）。`buildDiversityIndex` は1始まりを受け内部で-1変換するため notes をそのまま渡す。`reaction.slotIndex`（0始まり）は判定と `playSlot` へそのまま。
  - 判定時刻: `tapMusicTimeMs(eventTimeMs, frame)`。frame.musicPositionMs = clock.gameTimeMs。
  - スロット音高: 現在時刻の区間 pitches を setSlotPitches。区間未検出時は直前を保持（無音化しない）。実データで slots は [0,237250) を隙間なく被覆。
  - 拍格子範囲防御: 構築時に beats[beatIndex] 未定義なら明示エラー。
- `src/app/playSession.test.ts`（新規・14件）: 起点変換/失敗のない床/協和音/採点と一回性/拍格子防御/投下の自動発動・期限・音色・区間超過タップでの再発動。
- `src/rendering/renderRoot.ts`: 反応の蝶（createButterflyFigures, 容量64）を world scene へ結線、update で進行、`spawnReactionButterfly(ReactionButterflyInput)`（強度0〜1を受け世界座標へ写像、sunflower と同パターン）、RenderState に `reactionButterflyActiveCount`、dispose で解放。
- `src/rendering/index.ts`: ReactionButterflyInput・createButterflyFigures・ButterflySpawnInput を公開。
- `src/app/index.ts`: cameraTrajectory 生成、screenShakeBeats を profile.beats から充填、フレーム時刻標本を onFrame 先頭で6ステップ更新（resyncCount 差分で再同期検出）、createInput(target=root) と setActive 切替、createPlaySession 生成、currentRankGaugeState を session.rankGaugeState() へ差し替え、onFrame で inPlayPhase 時にカメラ姿勢駆動（machine.update より前）＋session.updateFrame、tickPlay 終了で input 無効化、診断モードで `window.__playSession` 取り付け/破棄、dispose で input.dispose。
- `src/types/globals.d.ts`: `__renderState` に reactionButterflyActiveCount、`__playSession` 宣言を追加。
- `scripts/play-smoke.mjs`（新規）＋ `package.json` の `smoke:play`: ?smoke=1 擬似再生に合成タップを注入し、発音回数・蝶生存数・カメラ駆動（拒否0・移動）・採点・結果遷移・console.error 無しを検査。

## 暫定値（★実機調整）
- 一過性の蝶の寿命 `REACTION_BUTTERFLY_LIFE_SECONDS = 1.2`（playSession.ts）。
- 同時生存上限 `REACTION_BUTTERFLY_CAPACITY = 64`（renderRoot.ts）。
- 床タップの光点の散らし幅 `REACTION_FLOOR_SCATTER = 2`（playSession.ts、カメラ注視点周り）。

## 検証結果（Node 22）
- `npm run typecheck`: 緑。
- `npm test`: 1714件緑（playSession 14件含む、138ファイル）。
- `npm run smoke`（画面遷移）: 成功（5状態走破・通常構成で診断アクセサ未公開）。
- `npm run smoke:play`（通し）: 成功（発音=蝶生存数=算入タップ数が注入回数と一致、百分位>0、カメラ拒否0かつ移動、結果遷移、console.error 無し）。
- `npm run quality:fps`: 成功。判定（デスクトップVRM常在満載）平均60.0・下位5%60・最低60（実GPU Intel Iris Xe・ANGLE/D3D11・Chrome148）。#59 の平均55fps以上と既存#97ゲート（60/60/床55）の両方を満たす。蝶追加による性能悪化なし。
- `npm run build`: 成功。
- `npm run quality:cloud`（スキーマ検証ゲート #96）: 成功（TAKEOVER プロファイル合格）。
- `npm run quality:operation-judgment`（判定精度ゲート #103）: 成功（80件）。
- `npm run quality:readability`（可読性ゲート #98）: 成功。
- `npm run quality:spatial`（空間品質ゲート #100）: 成功（実機GPUの main・ソフトウェア描画の本ブランチ再実行とも6項目成立）。初回1度のみ「明部区画皆無」で失敗したが、描画バックエンドが揺れる環境のフレーク（再実行で成功・main で成功）であり #59 の回帰ではない。蝶は非活動時 object.count=0 で描画命令を増やさず、空間品質に影響しないことをコードと実測の両面で確認。
- `npm run quality:display-sync`（表示同期ゲート #99）: 修正のうえ成功。原因と修正を述べる。原因は、ゲートスクリプトの既定接続先が `4173`（プレビュー）だが、診断ページ display-sync.html は楽曲データ `/docs/analysis/takeover.songmap.json` を実行時に取得し、`docs/` は開発サーバ（vite dev）のみが配信しプレビュー（vite preview）は配信しないため、未知パスへ返る index.html（HTML）を JSON 解析して失敗していた（main でも同一失敗の既存不整合）。修正は2点。(1) `src/typography/kineticText/diagnostics/displaySync/main.ts` で本文を文字列で受けてから JSON 解析し、解析失敗時に「開発サーバに対して実行する」明確な誘導へ翻訳。(2) `scripts/display-sync-quality.mjs` の既定接続先を開発サーバ `http://localhost:5173` へ変更しコメントで要件を明記。開発サーバ起動時に既定設定で成功（8項目成立）、プレビューに対しては明確な誘導を表示することを確認。本番ビルド（提出物）には 430KB の解析データを含めない方針は維持（fetch のため本番束に取り込まれない）。

## スコープ外（後続）
楽曲終了後の情景立ち上げ（#63）、磨き演出②〜⑥（#24-28）・3Dカメラワーク文字（#32）、結果画面詳細・撮影・成果物（#74/#68/#69/#71、最終スコアは session.finalResult() で供給可能）、ウォームアップ中のタップ反応（#72）、一時停止（#112）、X軸色の視覚反映（#71）、拍同期色収差の本編有効化（#17、createRenderRoot postEffectEnabled）。

## 留意事項
- 時刻の使い分け: 判定・カメラ・投下・スロット音高は clock.gameTimeMs。文字/レーン/揺れは既存の world.gameTimeMs のまま。
- 蝶の生存数の読み口は所有者 renderRoot.state() 側（__renderState）。__playSession には含めない。
- ランクゲージ描画の百分位→満ち量の写像は #65 が検証済みのため #59 では再検査しない。
