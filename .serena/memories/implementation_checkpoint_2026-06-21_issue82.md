# 実装チェックポイント Issue #82 クレジット表記システム

実装完了。ブランチ `worktree-issue-82-credits-system`。型検査・単体テスト（475件）・本番ビルド・スモーク（screens/input/glow/credits）すべて成功。

## ゴールと達成基準
規約（docs/concept.md、docs/research/05-asset-procurement.md §5、docs/research/02）が求める許諾素材の出典をアプリ内に漏れなく常設し、READMEと一致させる。受け入れ基準「規定文言が漏れなく表示される」を、常時到達できる開閉式クレジット表示で満たす。後続 Issue #77（設定・クレジット画面、M6）がこの集約データと表示を取り込み、効果音の消音切替と較正を足す。

## 実装内容（ファイル）
- 新規 `src/types/credits.ts`: 共有型を集約（CharacterCredit を src/types に置く先例に合わせる）。`FontCredit`（typography から移設）・`SongCredit`・`CreditRegistry` を定義。`FontCredit` の配布元は `source`（名称とアドレス混在の1文字列）を `sourceLabel`（名称）と `sourceUrl`（絶対アドレス）に分離。
- 変更 `src/typography/kineticText/types.ts`: `FontCredit` 定義を除き src/types/credits から同名で再公開（取り込み経路は不変）。
- 変更 `src/typography/kineticText/fontCredits.ts`: `ZEN_KAKU_GOTHIC_NEW_CREDIT` を sourceLabel="Google Fonts" / sourceUrl=絶対アドレス に更新。
- 変更 `src/typography/kineticText/{engine,fontRegistry}.test.ts`: FontCredit リテラルを新形に追従。
- 新規 `src/config/credits.ts`: `AI_PROVENANCE_STATEMENT`（値のみ）。
- 新規 `src/app/credits/registry.ts`: `buildCreditRegistry(song)` が分散データ（PCL_CREDIT・ZEN_KAKU_GOTHIC_NEW_CREDIT・AI_PROVENANCE_STATEMENT・Song）を束ねた単一の出典を返す。character は PCL_CREDIT 同一参照（二重定義回避）。
- 新規 `src/app/credits/creditsView.ts`: 開閉ボタン＋一覧の文書要素。document.body 直下（attribution.ts・overlay.ts と同じ作法）。Esc/閉じるで閉じ、aria属性付与、開閉ボタンは操作を受け取り一覧は開時のみ受け取る。リンクは別タブ安全リンク。
- 変更 `src/app/index.ts`: 診断・通常両モードで `createCreditsView(buildCreditRegistry(song))` を生成し dispose で後始末。#64 バッジ挙動は不変。
- 変更 `src/style.css`: `.credits-toggle`・`.credits-panel` 等。z-index:1100（覆い .overlay の 1000 より上）。
- 変更 `README.md`: ライセンス・出典節を一覧と一致（ミク指定文言の追記、フォント保留記述の解消、楽曲・AI明示）。
- 新規 `src/app/credits/registry.test.ts`: 完全性・外部アドレスhttps（ミクライセンス/楽曲出所/フォント配布元）・同梱パスは/始まり・楽曲出所はsongUrl完全一致・権利者にクリプトン社名・character==PCL_CREDIT。
- 新規 `src/app/credits/readmeConsistency.test.ts`: README を `import ... from "../../../README.md?raw"`（node:fs不使用、tsconfigはvite/clientのみ）で取り込み、達成基準の全項目（PCL5・フォント6・楽曲3・AI文言）の包含を元データ定数と照合。
- 新規 `scripts/credits-smoke.mjs` ＋ package.json `smoke:credits` ＋ ci.yml ステップ: ?smoke=1 で次を確認。初期は閉・z-index>覆い・開くと aria-expanded=true・規定文言を描画レベルで全網羅（ミク指定文言の subject/licenseName/権利者社名/guidelineNote、フォントの fontName/author/sourceLabel/license、楽曲の title/artist、AI不使用）・4種のリンク（ミクライセンスURL・フォント配布元URL・フォントライセンス本文（末尾一致）・楽曲出所の完全形 `^https://piapro.jp/t/E2i3/\d+$`）・閉じるボタンで隠れ aria-expanded=false・再オープン後 Esc で隠れる。#64 バッジは確認対象外。

## 主要な設計判断（Codex 4回レビューで確定。経緯と採否理由は計画ファイル参照）
- 表示部品・集約は src/app（src/ui はゲームHUD専用。overlay.ts:4「src/ui とは別物のため混在させない」、architecture.md:130）。
- 共有型は src/types（FontCredit 移設含む）。
- 配布元の名称/アドレス分離で、アドレス検証とリンク化を可能に。フォント配布元の `.source` 読取箇所は無く影響限定。
- 常時到達は z-index:1100＋開閉ボタンの操作受け取りで担保。診断擬似再生は ready で覆いが隠れるため、覆い表示中の実操作はスモークで検証せず、z-index数値比較と静的様式で担保（限界明記）。

## スコープ外（理由）
#77 の設定画面UI本体（SE消音・較正）。テクスチャ・舞台土台出典（#105未着手・#106保留、未統合）。効果音出典（合成音でファイル無し）。花/蝶/ひまわりの個別列挙（#79・未実装M5）。TextAlive謝辞（常設義務の明記なし）。

## 実装後のCodexレビューと対応
未push実装をCodexがレビュー（ブロッカー無し・マージ可能品質）。対応した指摘は次の2点。
- スモークの規定文言が部分的だった点 → REQUIRED_TEXTS を描画する全規定文言へ拡張し、フォント配布元URLとライセンス本文のリンク、閉じるボタンと aria-expanded 遷移の確認を追加。
- README の「以下と同じ内容」が、READMEにある補足行を含めると厳密でなかった点 → 「同じ出典を示す。補足の説明を加えている箇所がある」と文言を正した。
変更不要と判断した指摘: `src/types/credits.ts` が同層の `./character` を取り込む点。`src/types/README.md` と `docs/decisions/architecture.md` に「types は一切importしない」という規則は無く、`CharacterCredit` 自体が types 層のドメイン型であるため、上位層への依存でも循環でもない。

## 次の作業
未コミット（ユーザーの指示待ち）。#77 は creditsView と buildCreditRegistry を取り込んで設定画面へ統合する。
