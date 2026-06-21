# 実装チェックポイント（2026-06-22・Issue #106）

**状態: Issue #106（舞台土台モデルの素材源・出典・規約適合の最終確定）の文言・記録の確定を実装。ブランチ `worktree-issue-106-stage-compliance`。機能コード（ローダー・幾何生成・glb）は変更せず、文言と記録のみ確定。**
**用途**: セッション喪失時の復帰点（マイルストーンM7・規約適合）。前段は [[implementation_checkpoint_2026-06-21_issue105]]（舞台土台の実装）。正典は `docs/idea/concept-final.md`、規約は `docs/concept.md`、研究は `docs/research/05-asset-procurement.md` 第4節。

## 最重要の意思決定（ユーザー確定＋一次資料）

- **素材経路は国土地理院 地理院地図の3D機能のダウンロード出力**: ユーザーが3D機能と明言。`model/lake/` は dem.csv・texture.png・texture.pgw・index.html（地理院ビュアー）の構成。提出 `public/models/stage/lake-stage_v01.glb` は頂点形状のみでテクスチャ非同梱（`scripts/build-stage-model.mjs` は `dem.csv` のみ入力、`texture.png` 不使用）。
- **承認申請は不要・出所の明示のみで適合**: 立体地図FAQ（https://cyberjapandata.gsi.go.jp/3d/qa/qa.html）が、色を含まない標高の地形（STL形式）を「出所の明示のみでお使いいただけます」と定め、申請が要るのは地図画像を色として焼き込むカラー版（VRML形式）に限る。本作はテクスチャ非同梱のため申請不要。
- **加工・同梱・再配布・主催者利用は許諾済み**: 国土地理院コンテンツ利用規約（https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html）が公共データ利用規約（第1.0版）を適用。同規約は出典記載と加工明示を条件に複製・翻案・第三者再配布・商用を認める。glbを版管理から外す必要はなく据え置く。
- **応募のきまり111行（第三者素材の権利処理保証）に当てはめ**: 公共データ利用規約の範囲で出所明示と加工明示により充足。AI非生成（実測標高＋人間の変換工程）。
- **出所明示の文字列**: 「国土地理院」「地理院」「地理院地図」又は「地理院地図3D」。確定した出典名は「国土地理院 地理院地図（3D機能の数値標高データ）」。

## 実装した文言・記録の確定（8編集）

1. `src/config/stage.ts`: 冒頭注釈・`provenance`・`sourceCredit`（source/note）を確定。保留文言を除去。
2. `src/types/credits.ts`: 42行注釈の保留文言を確定済みへ。47行の `source` 例示を確定 source 表記へ整合。
3. `README.md`: 舞台土台の地形の節を確定（素材源名・加工した旨の定型句「国土地理院の数値標高データを加工して作成」・申請不要根拠・誤認防止）。
4. `docs/research/05-asset-procurement.md`: 第4節39行散文を確定へ。確定の照合結果の小節を追加（立体地図FAQ引用・テクスチャ非同梱・公共データ利用規約による再配布・応募のきまり111行への当てはめ）。出典一覧に国土地理院の一次資料5件を参照日付きで追加。
5. `docs/idea/concept-final.md`: 第2節20行・第16節158行・第18節181行を確定へ。
6. `docs/decisions/app-overall-decisions.md`: 142行を確定へ。
7. `src/rendering/README.md`: 15行の素材源名を取得経路（3D機能）を含む表記へ整合。
8. 本チェックポイント。

## 検証

- 型検査 `npm run typecheck`、単体テスト `npm test`（特に `src/app/credits/readmeConsistency.test.ts`）、ビルド `npm run build` を Node 22 で実施。
- 保留文言の取りこぼし確認（保留語と舞台土台を指す名詞でグレップ、`.claude/worktrees/` を除外）。
- 提出 glb がテクスチャや画像を含まないこと（頂点形状のみ）を確認。
- クレジット表示の「舞台土台の地形」節に確定文言が表示されることを目視。

## 除外した一致（理由付き）

- `docs/research/research-roadmap.md` 9行（同型の未確定記述）は、同ファイルが起草時点の計画記録として保全される進行表であり、確定仕様は正典 `concept-final.md` を正とするため更新しない。
- ロードマップ図（`docs/dev-roadmap-graph.md`・`docs/dev-roadmap-gantt.md`）はIssue状態で反映される進捗図のため更新しない。
- ミクのモーション関連の保留（Issue #93・#94）は別件のため触れない。

## 次の主要作業

1. PRのマージ（本チェックポイント push 後、ゴール基準の再レビューを経て）。
2. 後続のM7規約タスク: #79（AI生成物排除監査、舞台土台のAI非生成の確定材料を引き渡す）・#86（応募フォーム提出物準備）・#87（提出コミット凍結）。
