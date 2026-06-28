# 実装チェックポイント 2026-06-29 ミクのツインテール常時風なびき

## 概要
中心に常在する初音ミクのツインテールが重力で真下に垂れたままで躍動が無かったため、スプリングボーンの重力方向と強さを毎フレーム書き換えて後方へ流れる動きを与えた。固定ポーズ（人体姿勢）・出典表記・描画性能は維持し、コードの実行時処理のみで実現した。ブランチ `worktree-miku-dynamics-skirt-pin-twintail`（mainから分岐）。PR #215（base main、未マージ）。Codexによる設計レビュー（条件付きGo→Go）と実装レビュー（Go）を経た。

## スコープの確定（重要な意思決定）
当初は「手でスカートの裾を持つ」表現も含めて設計したが、目視確認の結果ユーザー判断で見送り、ツインテールの躍動のみを採用した。見送りの理由を先に述べる。現行のVRMアニメーション `miku-ver3-posed.vrma` は両腕が肩から頭の高さに上がった走る姿勢で、左右どちらの手もスカートの裾から約0.5ワールド単位（モデルは等方スケール3.9）上にある。裾を手へ追従させると約0.5ワールド単位ぶん垂直に引き伸ばされ不自然になる。自然に持つ姿にはVRMアニメーション側で手を裾の高さへ下ろす必要がある。スカート保持を加える場合は、手を裾に添えた姿勢の新VRMA（人間制作）が前提となる。

## 確定した事実（実データ・ライブラリ実装で確認）
- ツインテールは長い2本のスプリングチェーン。根ボーンは `J_Sec_Hair1_10` と `J_Sec_Hair1_11`。チェーンのボーン名は `J_Sec_Hair{1..6}_10` / `_11` と各末端 `_end`。既定の重力は下向き `(0,-1,0)`・強さ0.3で垂れる。
- `@pixiv/three-vrm-springbone` 3.5.4 の実装で、スプリングの外力 `gravityDir` はワールド空間として解釈され、`gravityPower` とともに毎フレーム `settings` から直接読まれる（初期化時にキャッシュしない）。よって `vrm.update` の前に書き換えれば同フレームで反映される。
- スプリング管理の `joints` は子を持つ節のみで、子を持たない末端 `_end` ノードは含まれない。先端方向はボーン名から末端を探さず、根からシーンの子をたどって末端ノードを得る。
- スプリングは開始直後の数十フレームで初期姿勢から目標へ遷移する。ソフトウェア描画（継続的インテグレーション環境）は毎秒のフレームが少なく、定常に達するのに数秒かかる。
- スプリングボーンは生成時に各ボーンの `matrixAutoUpdate` を false にする（実装578行目）。スカート保持を後で加える場合、ボーンの局所 `position` を上書きした後に `updateMatrix` と `updateWorldMatrix` を明示的に呼ぶ必要がある。

## 変更ファイル
- `src/utils/twinTailWind.ts`（新規）＋ `twinTailWind.test.ts`: 経過秒・パラメータ・位相差から風の局所方向（後方かつ上向きの定常バイアスに直交方向の揺らぎを加えた単位ベクトル）と強さを返す純粋関数。
- `src/rendering/entities/vrmMotion.ts`: `createDynamicPosedMotion` を追加。既存 `createPosedMotion` を内部利用して固定ポーズを保ち、対象ツインテール2本の `gravityDir`/`gravityPower` を毎フレーム書き換える（局所方向を中心表示オブジェクトのワールド回転で変換）。生成時に4設定（重力方向・強さ・戻し力・抵抗）を複製保存し dispose で復元。
- `src/types/character.ts`・`src/config/character.ts`: 風のパラメータ `MIKU_CHARACTER.dynamics`（baseDirectionLocal=後方かつ上、power=2.5、stiffness=0.15、oscillation、chainPhaseOffset=π）。設定が無ければ固定ポーズのみ。判定モードは posed のまま。
- `src/rendering/renderRoot.ts`: `config.dynamics` で `createDynamicPosedMotion` を選ぶ分岐。診断 `centerFigureTwinTailFlowAlignment` を `state()` に追加。
- `src/rendering/entities/centerFigure.ts`: 診断 `debugTwinTailFlowAlignment`（先端方向と意図した風方向の内積の平均、読み取りのみ）。差し替えモデル設定を保持。
- `src/rendering/diagnostics/centerFigure/main.ts`・`src/types/globals.d.ts`: 診断の公開。
- `scripts/rendering-center-figure-smoke.mjs`: ツインテールの流れの判定を追加（定常まで読み直す）。
- `src/rendering/README.md`: 仕組みの追記。

## 検証結果（全て成功）
- `npm run typecheck` 通過。`npm run test` 1834件成功。`npm run build`（診断込み）・`npm run build:app` 成功。
- `npm run smoke:center-figure` 成功: 判定モード posed・人体ボーン最大回転角160.10度（偏差0.00度）・平面反射・ツインテール先端方向と意図した風方向の内積0.960。内積の下限0.15は、先端が真下を向く垂れ（内積0以下）と十分区別できる正の値として採る。
- `npm run smoke:spatial` 成功。
- 目視: ツインテールが頭上後方へ流れて垂れていないことを確認。

## 復帰点
本ファイル。実装の正典は PR #215 と本ブランチ。スカート保持を再開する場合は、手を裾の高さへ添えた新VRMA、または右腕・左腕を手続き的に下ろす実装が前提。
