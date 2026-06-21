# 実装チェックポイント Issue #17 拍同期ポストエフェクト（周縁減光＋色収差）

実装完了。ブランチ `worktree-issue-17-posteffect-vignette-chroma`。型検査・単体テスト（739件、新規23件）・受け入れスモーク（拍同期ポストエフェクト）・本編描画スモーク・性能ゲート（実GPU、画素密度1と2で毎秒60フレーム）・本番ビルド（診断ページ除外確認）すべて成功。

## ゴールと達成基準
強拍（小節頭）に同期した後処理を加える。常時の周縁減光（ビネット）で視線を中央へ誘導し、強拍時にRGBの画素を一瞬ずらす色収差バーストで衝撃を出す。受け入れ基準は「視線が中央へ誘導される」「色ずれが意図的効果として認識される」。設計根拠は docs/research/02-non-text-expression.md §2（明部の発光と周縁減光は最優先、一瞬の色収差は強い拍で使う）。

## スコープ（機構＋診断＋テストで完結、実楽曲結線は #59 へ委譲）
本編プレイ画面は骨組であり、実楽曲 TAKEOVER の再生結線は #59 の担当。本Issueは後処理機構・診断ページ・テストで完結させ、診断ページで合成した強拍によりバーストを駆動して達成基準を実証する。強拍は TextAlive の IBeat.position が1（小節頭）。本編での有効化は #59 が createRenderRoot({ postEffectEnabled: true }) で行う（既定無効により既存の見えを変えない）。

## 実装内容（ファイル）
- 新規 `src/rendering/postEffectShader.ts`: 周縁減光と色収差を1枚に束ねたGLSL。正規化距離は中心0・四隅1（length(vec2(d.x*aspect, d.y)) を四隅までの長さで割る。0除算回避の下限あり）。色収差は向きを画面座標空間、強さの距離をアスペクト補正空間で取り分離（横長画面で横方向だけ過大になるのを避ける）。緑を基準に赤と青を逆方向へ放射状にずらす。ビネットは smoothstep の減光を色に乗算。減光の内外半径 INNER/OUTER は定数値を文字列に埋め込み単一定義を保つ。
- 新規 `src/utils/beatBurstEnvelope.ts`（＋テスト）: 純粋関数 `createBeatBurst(減衰時定数)`。`trigger(拍時刻, 経過)` で基準時刻を拍の真の開始時刻に置き、`intensityAt(時刻)=exp(マイナス経過 ÷ 時定数)`。基準を拍の真時刻にすることでフレーム落ち時も拍からの実時間に同期する。three・profiles 非依存（rendering は時刻ロジックを持たない規則に従い utils へ分離）。
- 新規 `src/rendering/postEffectMath.ts`（＋テスト）: GLSL と同式の検証用純粋関数（正規化距離・smoothstep・ビネット係数・色ずれ量）。GLSL は node 環境で実行できないため数式の正しさを単体テストで担保する。
- 変更 `src/rendering/bloom.ts`: createBloomComposer の合成順を RenderPass→UnrealBloomPass→新ShaderPass→OutputPass に変更（線形空間で作用させ OutputPass を最終色管理段に保つ）。引数 postEffectEnabled（既定 false）で新パスの有効・無効を決定。`setChromaBurstIntensity(強度)` は非有限値を0・範囲外を0から1へ丸めてから最大ずれ量を掛け uniform へ渡す（パスの有効化はしない）。BloomState に postEffectEnabled・vignetteStrength・chromaIntensity を公開。setSize で resolution uniform を更新（縦横比追従、寸法は1以上に丸めて0除算を防ぐ）。dispose で新パスを OutputPass より前に破棄。
- 変更 `src/rendering/renderRoot.ts`: レンダラ生成直後に outputColorSpace=SRGBColorSpace・toneMapping=NoToneMapping を明示設定（現行既定と同値、見えは不変。後処理を線形空間で作用させる前提が将来の既定変更で崩れる事故を避ける）。createRenderRoot に postEffectEnabled（既定 false）を追加し createBloomComposer へ渡す。RenderRoot に setChromaBurstIntensity を追加（bloomComposer へ橋渡しのみ）。RenderState に outputColorSpace・toneMapping を追加。本編は既定無効。
- 変更 `src/rendering/constants.ts`: 視覚定数 POST_VIGNETTE_BASE_STRENGTH=0.4・POST_VIGNETTE_INNER=0.35・POST_VIGNETTE_OUTER=0.85・POST_CHROMA_MAX_OFFSET=0.004（画面正規化座標の単位。端末非依存の知覚量を保つため画素固定でなく画面比固定）。
- 変更 `src/config/tuning.ts`: POST_CHROMA_DECAY_TAU_MS=120（色収差バーストの減衰時定数。app の統括と診断が横断参照する楽曲非依存の時間値のため、視覚定数と分けてここへ置く）。
- 新規 受け入れ診断 `src/rendering/diagnostics/postEffects/main.ts` ＋ `posteffects.html`: 直交カメラの正規化空間で、明るい灰色面（減光と黒潰れの検出）と黒帯との鋭い境界（色収差の検出）を持つ。`window.__postEffectsStep(時刻)`・`__postEffectsReset()`・`__postEffectsState()` を公開。生成直後に基準時刻を0へ置く（拍同期スケジューラの初回は発火しないため）。?perf=1 で連続描画し毎秒フレーム数の計測フックを公開、?posteffect=0 で後処理無効の基準計測。`--mode app` 非配信。
- 新規 `scripts/rendering-posteffects-smoke.mjs`: 基準（強拍前）・ピーク（強拍）・減衰後（3τ後）の3時刻を決定的に読み、周縁が中心より暗い・周縁最低明度が8以上・ピークの色ずれが基準より16以上・減衰後の色ずれが基準＋4以下・包絡のピークが0.99以上かつ3τ後が0.05以下を判定。
- 新規 `scripts/rendering-posteffects-fps.mjs`: 実GPUハーネスで posteffects.html?perf=1 を解像度1920×1080・画素密度1と2の双方について平均55フレーム毎秒以上かつ下位5パーセンタイル45フレーム毎秒以上を合否（後処理は全画面のため画素密度2で描画画素が4倍になり上限の負荷を見る必要がある）。後処理無効との平均差は参考表示。
- 変更 `scripts/rendering-smoke.mjs`: 本編で後処理が既定無効（配線あり）・出力色空間が sRGB・トーンマッピング無しを確認。
- 変更 `src/types/globals.d.ts`: __renderState の bloom 拡張と outputColorSpace・toneMapping、診断アクセサ __postEffectsStep・__postEffectsReset・__postEffectsState を宣言。
- 変更 `vite.config.ts`・`package.json`: 診断入口 posteffects.html（本番除外）と smoke:posteffects・posteffects:fps スクリプト。

## 主要な設計判断（Codex 多重レビューで確定）
- 後処理を1枚の ShaderPass にしてブルームと最終出力の間に挿入。1枚にして描画命令数の予算（100回未満）への影響を最小化し、OutputPass を唯一の色管理段に保つ。
- 値注入は色収差強度のみの単一セッタ。ビネットは仕様上常時一定で実行時に変動する値が1つだけのため、引数順の取り違えを避け呼び出し側が一定強度を知らずに済む。
- 減衰時定数120ミリ秒の根拠: 強拍間隔は小節長およそ1029から1372ミリ秒（takeover.songmap.json 実測の3から4拍×1拍343から376ミリ秒）であり、3τ=360ミリ秒で5パーセント以下まで減衰して次の強拍前に消える。
- 診断シーンは白帯を使わない。白（最大輝度）はブルームで滲み隣接領域へ明るさが漏れて境界が消えるため、ブルームの明るさ下限0.5未満の明るい灰色面と黒帯の境界にする。色収差判定は境界上でなく灰色側に2から4画素離した複数点の最大色ずれを取る（鋭い境界では微小な色収差でも分離が起き減衰後も差が残るため、ピークの大きなずれだけが境界を跨ぐ位置で測る）。

## レビュー
Codex（読み取り専用）に4回レビューを委譲した。プラン段階の3回で、縦長画面でのビネット距離の正規化・色収差の向きと距離の分離・既定無効による既存診断の回帰防止・色管理の明示設定・診断の決定的検証と標本系統の分離・画素密度2の性能ゲート・uniform への非有限値防御などを反映し、実装後の1回で「コミット・PR化して問題なし」の判定を得た。指摘の非ブロッキング改善2点（シェーダの縦横比0除算防御を寸法の1以上丸めで対応、性能ゲートのブラウザ解放を try/finally で確実化）も反映済み。

## 提出状況
ブランチ `worktree-issue-17-posteffect-vignette-chroma` にコミットして origin へ push 済み。Pull Request #153（base: main、本文に Closes #17）を作成済み。

## 次の作業
#59（TAKEOVER 通しプレイ統合）で本機構を実楽曲へ結線する。強拍開始時刻配列を beats から position が1の拍で作り、createBeatScheduler と createBeatBurst を生成、createRenderRoot に postEffectEnabled を真で渡し、毎フレームの更新と描画の間で scheduler を進めて setChromaBurstIntensity をゲーム時刻基準で呼ぶ。
