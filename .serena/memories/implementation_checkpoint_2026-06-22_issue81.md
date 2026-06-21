# 実装チェックポイント Issue #81 フォントのサブセット化

実装完了。ブランチ `worktree-issue-81-font-subset-verify`。型検査・単体テスト（1139件、うち `scripts/build-font-subset.test.mjs` は6件＝既存4＋新規2）すべて成功。

## 残ギャップの特定（着手前調査の結論）
Issue #81（M7、area:compliance / P1-high、設計根拠 docs/research/05 §2、受け入れ基準「サブセットで全歌詞描画・容量削減」）の中核は先行 Issue #20 で実装済みだった。すなわち、生成スクリプト `scripts/build-font-subset.mjs`（TAKEOVER の `docs/analysis/takeover.songmap.json` の `phrases[].text` ＋ 印字可能ASCII（0x20-0x7E）＋ 全角約物を文字集合に、`assets/fonts-source/ZenKakuGothicNew-Bold.ttf`〔.gitignore済み〕から subset-font で `.woff` 生成、fontkit で両段階の欠字検査、欠字あれば失敗。公開関数 `extractRequiredChars`・`findMissingChars` を export）、コミット済み `public/fonts/zen-kaku-gothic-new-subset.woff`（58264バイト、Vite で同一オリジン `/fonts/...woff` 配信）、`public/fonts/zen-kaku-gothic-new-OFL.txt` 同梱、README フォント節、アプリ内クレジット（`fontCredits.ts`＋`creditsView`）。

よって TAKEOVER について受け入れ基準は機能的に充足済みで、残るギャップは「コミット済みサブセットが歌詞文字を欠字ゼロで収録し続けることを保証する自動検査が無い」一点だった。既存テストは擬似 songmap での純粋関数テストのみで、実 songmap と実 `.woff` の整合（ドリフト）を検査していなかった。

## 実装内容（ファイル）
- 変更 `scripts/build-font-subset.test.mjs`: 実データ検証の describe を追加（テスト2本）。`node:fs`・`node:url` の `fileURLToPath`・`fontkit` を追加 import。テスト1=実 `takeover.songmap.json` を既存 `extractRequiredChars` に渡して必要文字集合を得て、コミット済み `.woff` を `fontkit.create` で解析し `findMissingChars` で欠字ゼロを表明（字形の網羅＝ドリフト検査）。テスト2=`.woff` のバイト数が上限 `SUBSET_BYTE_LIMIT`=200000 未満を表明（容量削減の表明）。パスは scripts/ から `new URL("../...", import.meta.url)` ＋ `fileURLToPath` で生成スクリプト本体と同じ相対関係で解決。`vitest.config.ts` の include が `scripts/**/*.test.mjs` を拾うため `npm test` とCIで自動実行。
- 変更 `README.md`: フォント節の「課題曲の歌詞に現れる文字へサブセット化して同梱している。」を「課題曲 TAKEOVER の歌詞に現れる文字へサブセット化して同梱している。」へ是正（現状ロードは TAKEOVER のみ・複数曲誤読の排除）。作者・ライセンス表記は不変。README 整合性テスト `src/app/credits/readmeConsistency.test.ts`（17件）は合格。

## 容量上限値200000バイトの根拠（理由先述）
目的は、サブセット化していない完全なフォントの誤コミットを捕捉すること。配布しない元フォントは現環境に無く正確なバイト数を実測再確認できないため、元フォントの具体値は根拠に用いない。第一に、数千の字形を収録する完全な日本語フォントは数十万バイトから百万バイト超になりこの上限を必ず超える。第二に、現サブセット（371文字・58264バイト）の約3.4倍であり、歌詞や基本文字集合の通常の増加では超えないため正当な更新を誤って失敗させない。

## 着手前の実測（裏取り）
ワークツリー（origin/main 由来）の `takeover.songmap.json` は430893バイトで、調査時のローカル main の411213バイトより新しい。この新しい songmap でも `extractRequiredChars` の必要文字は371文字・欠字0で、コミット済み `.woff`（58264バイト、内部名 familyName=Zen Kaku Gothic New / postscriptName=ZenKakuGothicNew-Bold 保持）が収録済み。songmap のサイズ差は歌詞以外のフィールド差であり文字集合は不変。再生成は不要だった。OFL本文1行目に "with Reserved Font Name" 句が無く予約フォント名なしのため、サブセットが元の名前を保持してもライセンスに反しない。

## 規約適合の確認（読み取り）
`index.html` に外部フォント参照（Google Fonts 等）なし＝同一オリジン配信。`public/fonts/zen-kaku-gothic-new-OFL.txt` 同梱。`src/typography/kineticText/fontCredits.ts` に Zen Kaku Gothic New / SIL Open Font License 1.1 のクレジット登録あり（`creditsView` が表示）。

## スコープ外（理由）
他の課題曲のサブセット対応は M8 横展開（Issue #88 シャッターチャンス・#89 世界最後の音楽隊）の範囲。現状 `src/config/songs.ts` で `implemented: true` は TAKEOVER のみ（`songs.test.ts` が強制）。M8 で他曲を有効化する際は、生成スクリプトの抽出対象 songmap・検証テストの対象 songmap・README のフォント節の対象曲名の3点をその曲を含めて更新する必要がある。実ブラウザでの最終描画確認は本編歌詞描画の結線（Issue #33・#59）の範囲で、本 Issue の自動テストは字形の網羅を保証する。

## 設計経緯（Codex 二重チェックレビュー2回で確定）
プランは Codex のレビューを2回反映した。反映した主な指摘は次のとおり。実 songmap を一時改変する実効性確認は手戻し漏れの危険があり不要（既存純粋関数テストが欠字検出を担保）として削除。README の TAKEOVER 明記を必須是正に格上げ。容量上限の根拠を、実測再確認できない「元フォント約1.1MB」依存から、数千字収録の完全フォントは必ず20万バイト超という論理依存へ書き換え。欠字時の再生成は元フォント取得（ネットワーク依存・現環境に元フォント無し）に依存するため通常完了経路から外し復旧手順として別枠化。Codex の着手判定は Go。

## 提出状況
ブランチ `worktree-issue-81-font-subset-verify` にコミット（8fa999d）し origin へ push 済み。Pull Request #171（base: main、本文に Closes #81）を作成済み。実装後に Codex の妥当性レビューを実施し、総合判定 Conditional-Go（修正必須の不備なし）。唯一の条件「追加テスト2本が依存導入済み環境で合格すること」は、本ワークツリーでの個別実行で6テスト全合格、および継続的検査が `npm ci`（開発依存の fontkit を導入）の後に `npm run test`（対象に `scripts/**/*.test.mjs` を含む）で当該2本を実行することの確認により解消済み。

## 次の作業
M7 の他タスク。他曲サブセットは M8（#88・#89）で本チェックポイントの「スコープ外」の更新3点を実施。
