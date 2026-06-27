# 実装チェックポイント 2026-06-27 ミクの新モデル差し替えと自作VRMA固定ポーズ適用

## 概要
中心に常在する初音ミクを、新モデル `miku-plane-ver3.0.vrm` へ差し替え、自作VRMアニメーション `miku-ver3-posed.vrma` の固定ポーズを適用した。ブランチ `worktree-issue-94-miku-vrma-pose`（mainから分岐）。Codexによる4回のレビューを経てプランを固め、実装・検証まで完了。未コミット。

## 確定した事実（実データ）
- VRMA `miku-ver3-posed.vrma`: 仕様1.0、最大時刻0.7916秒・20キーフレーム・人体54ボーン。全51回転＋1平行移動チャンネルが全フレームで偏差0.000000の単一固定ポーズ。**表情のまとまり（expressions）は空で表情アニメーションを含まない**（顔はモデル既定のまま。固定するのは人体ポーズのみ）。注視トラック無し。
- 新モデル `miku-plane-ver3.0.vrm`: 仕様1.0、作者kaito-shioya（応募者本人）、54ボーン、15,083,024バイト。
- `@pixiv/three-vrm-animation@3.5.4`（three-vrmと版一致）を導入。`gltf.userData.vrmAnimations`（VRMAnimation[]）、`createVRMAnimationClip(vrmAnimation, vrm: VRMCore)`。

## 変更ファイル
- `package.json`: `@pixiv/three-vrm-animation: 3.5.4` 追加。
- `public/models/miku/`: 新VRM・VRMA追加、旧V02削除（提出ビルド軽量化）。
- `src/types/character.ts`: `CharacterModelConfig` に `poseAnimationUrl?` `poseFreezeTimeSec?` 追加。
- `src/config/character.ts`: url更新、pose設定（freezeTimeSec=0）、provenanceに自作来歴明記。
- `src/rendering/loaders/vrmAnimationLoader.ts`（新規）: `loadVrmAnimation`。VRMAnimationLoaderPlugin登録、空配列は明示エラー。
- `src/rendering/entities/vrmMotion.ts`: `createPosedMotion`（createVRMAnimationClip→AnimationMixer(vrm.scene)→setTime(freezeTime)、毎フレームmixer.update(0)で固定時刻保持、dispose例外非伝播）。
- `src/rendering/renderRoot.ts`: `mountCenterCharacter` でVRMA先読み→2段階の競合再確認→swapToVrmとsetMotionを非同期待ちなし連続実行（バインドポーズの一瞬表示を抑止）。VRMA失敗時は固定ポーズへ縮退しVRM表示は成功扱い（true）。状態 `centerFigureMotionMode`・`centerFigurePoseMaxAngleDeg` を `RenderState`・`state()` に追加。
- `src/rendering/entities/centerFigure.ts`: 診断用 `debugMaxNormalizedBoneAngleDeg()`（全人体ボーンの最大回転角・度）。
- `src/types/globals.d.ts`・`diagnostics/centerFigure/main.ts`: 上記2状態を公開。
- `scripts/rendering-center-figure-smoke.mjs`: `centerFigureMotionMode=posed` と最大回転角の確定ゲート（>10度）＋回帰ガード（実測160.1度±2度）を追加。
- テスト: `character.test.ts` にpose設定の不変条件。`vrmMotion.test.ts` にcreatePosedMotionをsmokeで検証する旨のコメント。
- `src/rendering/README.md`: 差し替え手順・診断状態を更新。

## 重要な技術的知見（再ターゲットの罠）
`createVRMAnimationClip` はVRMAの姿勢を対象モデルの正規化空間へ**再ターゲット**する。そのため特定の1ボーン（腰）の回転は小さくなり（実測 腰w=0.9982≒3.4度）、当初設計の「腰のw<0.99」検査では姿勢適用を区別できなかった。最大回転角（この作成ポーズでは左肘の160.1度）で判定すれば、どのボーンが大きく回るかに依らず頑健にポーズ適用を確認できる。これはCodexが事前に警告した点であり、検証フックを腰から最大回転角へ変更して解決。

## 検証結果（全て成功）
- `npm run typecheck` 通過。
- `npm run test`: 138ファイル1716テスト通過。
- `npm run build:app`: 成功。`dist/models/miku/` に新VRM・VRMA同梱、旧V02不含を確認。
- `npm run smoke:center-figure`: loaded・posed・最大回転角160.10度（>10度・実測偏差0.00度）・反射・エラー無しで成功。
- `npm run smoke:spatial`: 成功（新VRMで空間品質に破綻なし）。

## 目視確認の結果（2026-06-28）
- `scale` はユーザーの目視確認により、暫定カメラでミクが小さく見えたため従来の3.0を1.3倍した **3.9** に変更（character.ts）。position(原点)/rotationY(0)は据え置き。
- ツインテールについて: ユーザーは作成ツールでツインテールに躍動感（先端が頭と同程度のz座標）を付けたが、**VRMA（miku-ver3-posed.vrma）には人体54ボーンのみが記録され、揺れ物（スプリングボーン）のツインテールは含まれない**（全ノード55=人体54＋ルート1、アニメーションチャンネル51本すべて人体、hair/twin/tail等のボーンノードは存在しない）。VRMアニメーション仕様は人体ボーン・表情・注視のみを記録するため。アプリではツインテールはモデル内蔵のVRMC_springBoneで物理駆動され、既定姿勢（垂れる）から揺れる。作成意図の形状は.vrmaから再現不可。ユーザーは**現状の物理駆動のまま受け入れる**と判断（コード変更なし）。作成意図の形状が必要な場合はモデル側の再エクスポート（rest/スプリング設定）または揺れ物回転データの別途提供が必要。

## 提出状況（2026-06-28）
- ブランチ `worktree-issue-94-miku-vrma-pose` にコミット（最初の実装は `8daa4b5`）し、origin へ push 済み。
- main 宛に **PR #201** を作成（https://github.com/KaitoShioya/magical-mirai-2026-procon/pull/201）。PR本文に目的・変更内容・設計上の重要点・検証の設計と結果・目視確認・規約適合を記載。
- 達成基準A1〜A8に対する最終レビューを経てmainへマージする。Issue #94 のクローズ可否はユーザーの判断に委ねる（#94はモーション素材源の規約適合の調査であり、本PRで素材源が作者本人の自作であることを来歴に明記して対応した）。
