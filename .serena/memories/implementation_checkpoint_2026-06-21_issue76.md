# 実装チェックポイント Issue #76 画面拡大・減衰揺れ

実装完了。ブランチ `worktree-issue-76-screen-zoom-shake`。型検査・単体テスト（734件）・本番ビルド（Node 22）・挙動スモーク・実GPU性能ゲート・既存スモーク（screens/rendering）すべて成功。Pull Request #152（base main）作成済み。

## ゴールと達成基準
拍に同期して画面を一瞬拡大し、拡大は長い余韻で、揺れは短い衝撃で減衰させる演出（研究 `docs/research/02-non-text-expression.md` §1 が最優先とする「疾走感の核を最小の負荷で生む」技法）。技術要件は拡大1.05〜1.15倍・時定数200〜300ミリ秒、受け入れ基準は「毎秒60フレーム滑らか・疾走感」。

完了の定義（ユーザー確定方針「自己完結＋防御結線」＋#13カメラ軌跡の前例に準拠）: 演出評価モジュール・描画基盤の変換適用口・操作同期の逆変換関数の実装と単体検証、出典由来の暫定TAKEOVER拍データで実描画スタックを動かす受け入れ診断、本編への無作用な防御結線、実プレイ駆動を#59・拍源を#46へ引き継ぐ明記まで。実プレイで実際に拍へ反応して演出が動くことは含めない。

## 実装方式（採用理由を先に述べる）
描画基盤は単一の canvas に3D世界（合成器経由）とWebGLの2次元層を重ねて出力する。この canvas 要素へ、中心を原点とする倍率と画素移動の相似変換（CSSのtransform、`matrix(倍率,0,0,倍率,横移動,縦移動)` 形式、原点は `transform-origin:50% 50%`）を当てる。
- 両立: 合成済みの単一 canvas を一括拡大するため3Dと2次元層が画素単位で同一倍率になる。カメラズームは3Dに遠近の縮みを伴い2次元層と拡大率がずれるため不採用。
- 操作との同期可能性: 相似変換は逆変換が一意。変換状態を公開し逆変換関数を提供すれば、入力結線（#59）がポインタ座標へ逆変換を当てて既存判定面写像へ渡すだけで拡大中もタップが見えている対象に一致する。
- 負荷: 合成経路の再構成や追加描画パスを伴わず、ブラウザの合成で拡大するため負荷最小（研究§1の方針と一致）。
- 回転・剪断を含めない: 移動が倍率後段の画素単位の平行移動になり、揺れの移動量が画面外余白の内側に収まる境界式が厳密に成り立つ。

## 実装内容（ファイル）
- 新規 `src/utils/screenShake.ts`: 純粋な演出評価器。`createScreenShake().trigger/evaluate/reset/lastTransform`、`resolveBeatAmplitudes`、`inverseScreenPoint`、定数。three.js もDOMも非import（utils の責務「数値計算・イベントの仲介」、`beatScheduler`・`cameraTrajectory` と同じ配置）。定数はこのモジュールが所有（`tuning.ts` の規約「単一所有値はそのモジュールが定義する」）。
- 新規 `src/utils/screenShake.test.ts`: 単体検証18件。
- 新規 `src/rendering/diagnostics/screenShake/{main.ts,provisionalTakeoverBeats.ts}`: 受け入れ診断の入口（実時間駆動、後始末あり）と暫定TAKEOVER拍データ（本編非参照・#46完了時に置換、`provisionalTakeoverCamera.ts` と同じ作法）。
- 新規 `screen-shake.html`: 診断ページ。`#app overflow:hidden`、`#app canvas transform-origin:50% 50%`。
- 新規 `scripts/screen-shake-smoke.mjs`: 挙動スモーク。`scripts/screen-shake-fps.mjs`: 実GPU性能ゲート（`reflection-fps.mjs` の作法）。
- 変更 `src/rendering/renderRoot.ts`: `RenderRoot` に `setScreenTransform(scale,offsetXPx,offsetYPx)`（`matrix` 形式で当て、前回適用値と一致すれば書き換えず、破棄後・WebGL不可で無作用）。`RenderState.screenTransform`（複製を返す）。これらは時刻の論理を持たない受け渡しのみで依存規則 §5 に反しない。
- 変更 `src/app/index.ts`: 無作用の防御結線。`screenShakeBeats=[]`（空）から `resolveBeatAmplitudes`・`createBeatScheduler`・`createScreenShake`・`matchMedia(reduce)` を生成。`enterPlay` で `beatScheduler.reset`＋`screenShake.reset`。`onFrame` で `inPlayPhase` のときだけ `world.gameTimeMs` で `advance`＋`trigger`、`stageRoot.clientWidth/clientHeight` で `evaluate`、`setScreenTransform`。非 `inPlayPhase` は恒等。
- 変更 `src/types/globals.d.ts`（`__screenShakeState`/`__screenShakeProbe`）、`vite.config.ts`（開発入口に `screenShake`）、`package.json`（`smoke:screen-shake`/`screen-shake:fps`）、`src/style.css`（`#stage overflow:hidden`・`#stage canvas transform-origin:50% 50%`）、`src/utils/README.md`・`src/rendering/README.md`。

## 主要パラメータ（採用理由を先に述べる。すべて★暫定＝実装後のプレイ検証で調整）
- 拡大量: 小節頭0.12・他拍0.05。Issue #76 の範囲「1.05〜1.15倍」（拡大量0.05〜0.15）の内側に収め、小節頭を強くして単調さを避ける（研究§1）。
- 拡大の時定数250ミリ秒: Issue #76 が時定数200〜300ミリ秒と与えるため中央値。拡大は長く緩く残り、毎分175拍（1拍342.9ミリ秒、出典 `docs/analysis/takeover.songmap.json`）では次拍まで完全に戻らず連続パルス＝疾走感の土台。
- 揺れの時定数50ミリ秒: 研究§2は各揺れの出来事を80〜150ミリ秒に収めると定める。指数減衰は3×時定数で約5パーセント（視認上ほぼ消える）に達するため、3×時定数=150ミリ秒となる50を採り揺れを150ミリ秒で消す。
- 揺れの振動周期50ミリ秒: 包絡が約10パーセントへ下がる時刻 50×ln(10)≒115ミリ秒の間に約2.3回振動して揺れと読め、かつ毎秒60フレームで1周期あたり約3.0回標本化され滑らかに見える値。
- 揺れ係数0.6: 1未満で移動量が余白未満になり画面端に隙間が出ない。画素の丸めでも1画素の隙間が出ないよう4割の余裕を残す。
- 恒等吸着0.0005・倍率4桁・移動量1桁: 倍率で0.05パーセント・4桁・1桁は視認できない精度。拡大していない大半のフレームで変換が一定になり描画基盤の書き換え省略が効く。

## 主要な設計判断（Codex二重レビューで確定）
- 小節頭判定（拍位置の減少検出）: `小節頭(i)=(i===0)||(位置と前位置が有限 かつ 位置<前位置)`。小節内では拍位置が増え小節境界で先頭値へ戻るため、拍位置の起点（0始まりでも1始まりでも）と小節長（アウフタクトや変拍子で異なっても）に依存せず判定できる。出典 `docs/analysis/takeover.songmap.json` は拍位置が1始まり（索引0が位置1・小節長3のアウフタクト、索引3で位置が3→1へ戻り小節長4）。初版の「拍位置が0」の仮定は出典が1始まりであり誤りであったため、追加検証で減少検出へ修正した。
- 二段減衰（拡大は最大値更新で長い余韻、揺れは最新拍で短い衝撃）: 拍発火時に拡大は残存強度と新振幅の大きい方を山にし基準を拍開始時刻 `timeMs` に貼り直す（遅延補償。`beatScheduler` の `elapsedSinceBeatMs` 設計と整合）。残存強度を新しい拍の時刻で評価して最大値更新するため、強拍直後の弱拍でも減衰曲線は連続で不連続な増減がない。揺れは余白（拡大強度由来）と強さ比（1以下）で拘束されるため、最新拍へ貼り直しても隙間は出ない。
- 余白内拘束の丸め後の厳密化（実装後レビューの妥当な指摘を反映）: 倍率4桁・移動量1桁の丸めで境界が崩れないよう、適用する倍率から求めた余白で丸めた移動量を切り詰める（`clampMagnitude`）。これで当てる値どうしで `|移動量| ≤ 余白` が厳密に成立する。

## スコープ外（理由と委譲先）
- 実プレイの拍源は曲プロファイルの拍時刻配列（#46）。現状の `Song` 型は拍時刻配列を持たないため本編結線は空配列で無作用。
- 実プレイ中の拍駆動・再生位置の飛び（シーク・再同期・タブ復帰）での `beatScheduler.syncTo` による基準貼り直し・入力への逆変換適用は #59。診断は時刻が単調で再生位置の飛びが無いため本Issueの範囲では生じない。
- 動きを減らす設定の手動切替UIは #77。

## 検証（3層）
- 第1層 単体（`screenShake.test.ts` 18件）: 拡大の減衰比1/e、小節頭判定（1始まり・0始まり・非有限）、遅延補償、最大値更新、後続弱拍でのanchor連続性、恒等吸着、丸め、余白内拘束（境界＝恒等吸着の直上を携帯390×390で確認）、二段減衰、同フレーム複数拍は最新拍、逆変換往復。`npm run test` は734件全通過。
- 第2層 ブラウザ統合（`screen-shake-smoke.mjs`）: 拡大の立ち上がり倍率1.12、減衰比0.3675（期待 1/e=0.3679）、恒等吸着、余白内拘束、適用変換が回転・剪断を含まない一様拡大と平行移動（`getComputedStyle` と `DOMMatrix` で確認）、動きを減らす設定で恒等、本編アプリ（?smoke=1）で `__renderState().screenTransform` が恒等の無作用。性能ゲート（`screen-shake-fps.mjs`）: 実GPU（Intel Iris Xe・Direct3D11）で平均59.9・下位5パーセンタイル60・最小58（基準は平均55以上・下位5%45以上、下位5%判定の理由は `reflection-fps.mjs` と同一）。
- 第3層 実機目視（ユーザー実施）: 3D世界と2次元層が拍ごとに一体で拡大・揺れし減衰すること（両立・疾走感）、拡大中の輪郭の見えが許容範囲であること、動きを減らす設定で静止することの3項目すべて「良好」。

## レビュー
Codex（読み取り専用）に計画3回・実装1回レビューを委譲。計画レビューで二段エンベロープ分離・行列形式と回転禁止・恒等保証の明文化・逆変換契約・暫定データ診断による検証強化を反映。実装レビュー（条件付き承認・マージブロッカーなし）の妥当な指摘2点（丸め後の余白内拘束の厳密化、後続弱拍でのanchor進行の回帰テスト）を反映済み。アウフタクト反映の指摘は診断専用・#46置換前提かつ「一定拍密度は重なりと性能の最も厳しい条件」という採用理由が明記済みのため意図的に維持。

## 提出状況
ブランチ `worktree-issue-76-screen-zoom-shake` にコミット（fe2dca0）して origin へ push 済み。Pull Request #152（base main）作成済み。

## 次の作業
本編プレイ中の演出駆動（#59）が、曲プロファイルの拍時刻配列（#46）と本評価器・`setScreenTransform`・逆変換関数を結線する。拍同期の他の演出（#17 ビネット＋色収差・#23 1文字1拍スマッシュ）も `beatScheduler` を共通基盤に同様に発火する。
