# コンセプト改訂チェックポイント（2026-06-14）

**状態: 作品コンセプトが大きく転換し、正典 `docs/idea/concept-final.md` を全面改訂済み。次フェーズ＝深掘り調査と研究文書の更新。**
**用途**: セッション喪失時の復帰点。直前の復帰点は [[phase2_design_checkpoint_2026-06-14]]（一部前提が陳腐化）。
**※2026-06-18改訂で一部更新**: ミクは「楽曲終了後に出現」でなく「本編開始から湖の中心に常在」へ変更。品質保証の仕組み化と解析先行を追加。最新の復帰点は [[concept_revision_checkpoint_2026-06-18]]。

## 正典（最初に読む）
- `docs/idea/concept-final.md` — 改訂済み。新コンセプトの正典。
- 規約は `docs/concept.md`、楽曲ロードは `docs/support-page.md`。

## 転換の核
- 舞台＝深夜・雨の湖の3D空間。カメラが歌詞空間を移動し、その軌跡が楽曲終了後に湖面へ灯す光（ひまわりと蝶）の配置を決める。
- ひまわり＝ノーツ点の真下に置くオレンジの発光造形。蝶＝空間のノーツ点位置に置くネオンブルーの発光造形。固定色の「湖面の灯し」化により、反応が0・部分・最大のいずれでも自然に美しい。
- 反応強度の写像＝タイミング精度を大きさ、音程精度を輝度に対応。色（x軸）は自動でスコア非寄与。
- タイミングの定義＝軌跡上のノーツ点と反応瞬間の軌跡上の点との軌跡に沿った距離。
- 判定UI＝画面右下の落下式レーン（目標線・落下ノーツ・音程番号1〜7）、本編左端にy軸1〜7境界を薄表示。
- 美しさの二層モデル＝報酬層（成功で増す）と制約層（反応強度が理論最大の目標形が常に美しい、反応強度と独立）。配置はカメラ素案位置をボロノイ緩和2〜4回で自然なゆらぎに均す。見せ場ノーツは分布中心へ集め、中心にミクを配置（※2026-06-18改訂: ミクは本編開始から湖の中心に常在。湖の中心は舞台の固定点で、カメラ軌跡を見せ場で中心へ偏らせ灯し分布の密集点を一致させる。ボロノイはミク位置を決めずゆらぎ均しに限定）。
- 譜面＝歌詞と別系統。楽曲オンセット（ビート・アクセント・和音）から生成、yはコード構成音。
- 目的関数＝旧来踏襲（ポートフォリオ×多様性逓減×一回性、2チャンネル）。一回性維持、「全ノーツ成功で完成」は破棄。投下＝ノーツ効果音の変化。
- ランク4段階＝色彩でなく専用ゲージ（スコアで蓄積・色彩変化、投下ゲージとは別物、判定レーン上に表示）。
- ミク＝VRoid自作VRMモデルを three.js で読み込み動的描画（AI生成でなく人間制作物のため規約適合、出典明示）。※2026-06-18改訂: 本編開始から常在。MVPはポーズ固定、モーションは後付け可能な抽象層（VRMHumanoid／@pixiv/three-vrm-animation）、素材源の規約適合は保留。
- グラフィック＝平面反射＋ブルーム基本、画面空間反射は中心限定検討。最重点はグラフィックとテキストタイポグラフィ。
- 撮影モード＝2本指で平行移動、1本指で向き変更。スコアとランクはゲージへ統合表示。
- 廃止＝波紋・水位演出、OKLCH寒色暖色ランク色彩アーク。

## 深掘り調査と文書更新（進捗）
1. ✅ キネティックタイポ文法（参考映像2本=メンタルチェーンソー/テレパシを解析、音響突き合わせ込み）。`docs/refs/reference-analysis.md` §1B、`docs/research/01` §9、`concept-final` §11 に反映。
2. 設計のみ完了: 譜面自動生成（オンセット選択→y割当→パターン→軌跡配置）と軌跡距離タイミングの判定設計を `docs/research/04` に反映。**実装（songmap→ノーツ生成パイプライン）は未着手**。
3. ✅ グラフィック負荷検証: `prototype.html`＋`src/prototype/main.js` で夜・雨・平面反射・発光ブルーム・文字・移動カメラを試作。利用者の実機Chrome（GPU）で平均約60fps確認。本環境はGPU無でSwiftShaderのため自動計測不可。`docs/research/03` §1検証に反映。
4. ✅ VRoid二次創作の規約適合とVRMローダー（@pixiv/three-vrm）選定。`docs/research/05`,`06` に反映。
5. ✅ 投下のノーツ効果音（倍音層の追加）設計。`docs/research/03`,`05` に反映。
6. ✅ `docs/research/01〜07`、`docs/decisions/app-overall-decisions.md` を新コンセプトへ同期。

**次の主要作業**: 譜面自動生成パイプラインの実装、および共通エンジン＋TAKEOVERプロファイルの実装（A1+A2スパイクから本実装へ）。

## 実装成果物（コード・ビルド・解析）

**依存・ビルド**
- 依存追加: `three`、`troika-three-text`（package.json）。ブルームは three 同梱の EffectComposer/UnrealBloomPass を使用（別パッケージ postprocessing は未導入）。gsap は未導入（DOM歌詞オーバーレイ実装時に追加予定）。
- Vite はマルチページ。`vite.config.js` の input に `prototype: "prototype.html"` を追加（既存の main=index.html, analysis=analysis.html はそのまま）。
- 既存 `src/main.js`（チュートリアル水準のTextAlive歌詞表示）は未変更。

**グラフィック試作（アイテム2）**
- `prototype.html` ＋ `src/prototype/main.js`。単一の three.js 描画領域に、深夜の空＋霧、湖面の平面反射（`examples/jsm/objects/Reflector`）、発光点（InstancedMesh、オレンジ=ひまわり/ネオンブルー=蝶、中心集中）、雨（Points）、troika 文字の拍スマッシュ、スプライン軌跡のカメラ、UnrealBloomPass を実装。
- ノブ（URLクエリ）: `dpr`(画素密度上限) `refl`(反射解像度,0でオフ) `bloom` `bloomScale` `points` `rain` `bpm`。例: `/prototype.html?refl=256&bloomScale=0.4&points=400`。
- 計測用に `window.__fps()`/`__avgFps()`/`__resetFps()` を公開。`scripts/prototype-fps.mjs`（Playwright）でデスクトップ＋モバイル相当（CPUスロットリング）を自動計測。**ただしGPU環境でのみ有効**。
- 起動: `npm run dev` → `http://localhost:5174/prototype.html`（5173使用中時は5174）。スマホ確認は `npm run dev -- --host`。
- **検証結果**: 利用者の実機Chrome（GPUあり）で起動画面が平均約60fps。本開発環境はGPU無でSwiftShader（ソフトウェア描画）にフォールバックするため自動計測値（約2〜3fps）は実機性能を表さない。

**参考映像・音響解析（アイテム1）**
- 参考映像2本を claude-video-vision で全区間解析。`DXW0aT6FKSlkqBq2.mp4`=かいりきベア「メンタルチェーンソー」（暗く攻撃的）、`_MBvQZsTPKONt09X.mp4`=DECO*27「テレパシ」（明るいポップ）。一次記録は `docs/refs/reference-analysis.md` §1B。
- 音響は ffmpeg でWAV化後ローカルlibrosaで解析（**music-analysis MCPはWAV化済みでもハングするためローカルへ切替**。パスは原因でない=切り分け済み。runbookとメモリ[[music-analysis-mcp-workaround]]に記録）。テンポは半/倍に割れ約580ms/302ms、オンセット71個。文字スマッシュはビート格子、細部はオンセットに乗ると確認。
- 解析中間物 `docs/idea/video/_MBvQZsTPKONt09X.wav` は `.gitignore` 済み（`docs/idea/video/` と `*.wav`）。

## 既存の有効な技術知見
開発基盤は [[dev_infrastructure_notes]]、曲構造は [[song_structure_analysis]]、参考演出解析は [[reference_analysis]]。music-analysis はWAV変換必須、linked list はchildrenで辿る。
