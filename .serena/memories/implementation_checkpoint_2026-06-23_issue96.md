# 実装チェックポイント（2026-06-23・Issue #96）

**状態: Issue #96（解析先行スキーマ検証ゲート）の実装を完了。ブランチ `worktree-issue-96-analysis-first-schema-gate` で PR #183（Closes #96、base main）を作成・push 済み。型検査・全1347テスト・クラウドゲート・本番ビルドすべて緑。Codex の未push実装レビューで「重大・中程度の指摘なし・push/PR 可」判定済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。本ゲートはマイルストーンM1「譜面・曲プロファイルパイプライン」の最上流・格下げ不可のゲートで、検査対象は #46 が生成したコミット済み成果物 [[implementation_checkpoint_2026-06-22_issue46]]。スキーマ機構は #95 が用意した登録簿（`scripts/harness/schema-check.mjs`）、深い検証関数は #34 の `validateProfile`。

## 位置づけ

正典は `docs/research/08-quality-assurance.md` §3（ゲート表）・§5（先行順序）・§1（クラウドはファイル存在＋スキーマ検査のみ）。現状CIの `npm run quality:cloud` と `npm run test` は配線済みだが、曲プロファイルの検査が1件も登録されておらず登録0件で無条件合格していた。本実装でゲートを実体化した。

## 設計（資料の2信号を2層に役割分担。ユーザー確定: 両方採用、鮮度検査も含める）

- **第1層 構造検査（クラウド経路・純Node・ajv）**: `scripts/harness/profile-schema.mjs` が JSON Schema でコミット済み `src/profiles/takeover/takeover.profile.json` の必須項目の存在・型・列挙・数値域・文字列パターン・非空配列を検査。`schema-check.mjs` の登録簿へ `registerProfileSchemas()` で登録し `run-cloud.mjs` 入口で呼ぶ。`docs/research/08` §1 の「クラウドはスキーマ検査だけ」に該当。
- **第2層 深い検査＋鮮度検査（テスト経路・vitest）**: `src/profiles/takeover/takeoverProfile.gate.test.ts` がコミット済みJSONそのものを `validateProfile`（連続被覆・slots↔chords1対1対応・source照合・ncRanges対応などJSON Schemaで表現不能な交差検証）にかけ、加えて `buildProfile` 再生成物と `toEqual` で構造一致（鮮度）を照合。§5 の「工程の正しさ」を担保。

## 重要な意思決定（すべてユーザー確定。Codex二重レビューで着手可判定）

- **スキーマの値域・整数性・列挙は `validateProfile.ts` の単一フィールド検査と同一にする**。一致させれば値域不正を取りこぼさず、かつコミット済み成果物は既にその検査を通っているため過剰制約による誤判定が起きない。各制約はプラン本文に `validateProfile.ts` の対応行付きで確定記載。
- **フィールド間の関係は第1層で表現しない**。JSON Schema表現不能（連続被覆・1対1対応・source照合・isClimaxちょうど1つ・スロット数5〜9・tapBudget比率）は第2層の `validateProfile` が担う。
- **`additionalProperties` は禁止しない**。責務は「必須項目を全て備える」確認であり追加項目禁止ではない。任意項目 `typographyChart` や将来項目で誤検出しないため。非検出範囲（必須キーを保ったまま余剰キーが増える場合）は鮮度検査（再生成物との構造一致）が補完。
- **非空（minItems:1）を課す対象**: beats・chords・repetitiveSegments・lyricChars・showcases・slots（と各pitches）・camera・colors.xAxisStops・loudnessCurve.values・emotionCurve.points・lyricDensity.windows。空は解析データの欠落を意味するため。`ncRanges`・`notes`・`diversityZones` は `validateProfile` も `asArray`（空許容）のため非空を課さない。
- **鮮度検査の比較は解析後オブジェクトの `toEqual`**。文字列比較は整形差・キー順で誤検出するため。`buildProfile` は時刻・乱数非依存の決定的関数（拍長の中央値＋純変換）なので再生成物は一意。

## 確定事実（推測排除のため実コード確認済み）

- コミット済み `takeover.profile.json` に `typographyChart` は無く（#33のタイポ譜面は別ファイル `typographyChart.ts` に独立保持）、`buildProfile` も生成しない。よって鮮度の構造比較は任意項目差で破綻しない。
- 検査対象パスは `fileURLToPath(new URL("../../src/profiles/takeover/takeover.profile.json", import.meta.url))` で絶対解決（`schema-check.mjs` の `runOneCheck` が `file` をそのまま `readFile` するため作業ディレクトリ非依存にする）。
- CIは既に `npm run test`（`.github/workflows/ci.yml` 40行）と `npm run quality:cloud`（133〜138行、コメントで「#96が登録した時点で実検査が効く」と明記）を実行。CI編集は不要。

## 変更ファイル

- 新規 `scripts/harness/profile-schema.mjs`（`SONG_PROFILE_SCHEMA`・`TAKEOVER_PROFILE_PATH`・`TAKEOVER_PROFILE_CHECK_KEY`・冪等な `registerProfileSchemas`）。
- 修正 `scripts/harness/run-cloud.mjs`（入口で `registerProfileSchemas()` を呼ぶ。`options.checks` 明示指定の尊重は保持）。
- 新規 `scripts/harness/profile-schema.test.mjs`（構造検査の合格、必須欠落・列挙違反・数値域違反・非空違反・パターン違反の退行検知、登録の冪等性。計9テスト）。
- 新規 `src/profiles/takeover/takeoverProfile.gate.test.ts`（深い検査＋鮮度検査。計2テスト）。

## 検証結果（端から端まで実施）

- `npm run typecheck` 緑。`npm run test` 全1347テスト緑（新規11テスト含む）。
- `npm run quality:cloud` → `[song-profile-takeover] 合格` 終了コード0。
- 負の確認: コミット済みJSONから `showcases` を削ると `[song-profile-takeover] 不合格: ... must have required property 'showcases'` 終了コード1（確認後にgitで復元済み）。
- `npm run build:app` 成功・`dist` は `index.html` のみ（診断ページ非増加＝規約適合）。

## 非対象

協和性・被覆率・密度の数値整合（#36・#46）、実機GPUゲート（#97〜#102）、CIワークフロー編集（配線済）、他曲プロファイル検査（M8。検査キーに曲キーを含め拡張余地のみ残す）。
