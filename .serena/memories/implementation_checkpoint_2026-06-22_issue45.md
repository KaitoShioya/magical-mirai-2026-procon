# 実装チェックポイント（2026-06-22・Issue #45）

**状態: Issue #45（曲プロファイル生成スクリプト）の実装を完了。ブランチ `worktree-issue-45-profile-generation` で PR #173 を作成・push 済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。本Issueは各派生フィールドの生成関数を1本のプロファイルへ結線する入口である。入力の生成関数は和音名解決 [[implementation_checkpoint_2026-06-21_issue37]]・JUST音程7スロット [[implementation_checkpoint_2026-06-21_issue36]]・オンセット選択 [[implementation_checkpoint_2026-06-21_issue38]]・譜面パターン [[implementation_checkpoint_2026-06-22_issue39]]・ノーツ軌跡上配置 [[implementation_checkpoint_2026-06-21_issue40]]・密度設計 [[implementation_checkpoint_2026-06-21_issue43]]・タップ上限 [[implementation_checkpoint_2026-06-21_issue44]]、出力先の型と検証は曲プロファイルスキーマ [[implementation_checkpoint_2026-06-19_issue34]]。

## 位置づけ

マイルストーンM1「譜面・曲プロファイルパイプライン」の入口である。音楽地図ダンプ（`docs/analysis/<曲キー>.songmap.json`）から、検証関数 `validateProfile` を通る曲プロファイルJSONを半自動生成する。これにより解析先行ゲート（プロファイルが検証を通るまで演出・譜面工程へ進めない、`docs/research/04`・`docs/research/08`）の最上流が成立する。受け入れ基準は「TAKEOVERで一発生成できる」。

## 配置

- `src/profiles/generate/songmapAdapters.ts`（新規）: 音楽地図ダンプから各生成関数とスキーマが要求する入力形への変換を集約。
- `src/profiles/generate/buildProfile.ts`（新規）: 生成関数を結線し `SongProfile` を組み立て `validateProfile` に通す純粋関数。
- `src/profiles/takeover/takeoverInputs.ts`（新規）: TAKEOVER の曲別手動入力。
- `scripts/generate-profile.ts`（新規）: `vite-node` で実行するコマンド。
- `src/profiles/takeover/takeover.profile.json`（新規）: TAKEOVER の生成結果。
- `tsconfig.scripts.json`（新規）と `package.json` 更新（`profile:gen` スクリプト・`vite-node` 依存・`typecheck` への連結）。
- 既存6個の `src/profiles/generate/*.takeover.test.ts` を共有アダプタ呼び出しへ移行（受け入れ主張は不変）。

## 最重要の意思決定（すべてユーザー確定）

- **コマンドの実行手段は `vite-node`**。既存スクリプトは素の `.mjs` で `src/` の TypeScript を読み込まない（ブラウザでしか動かない TextAlive を扱うため）が、プロファイル生成は描画不要の純計算で生成関数（TypeScript）を直接呼ぶ必要がある。`node_modules` に `vite-node`（vitest 同梱）が既に存在し新規の最上位依存を実質増やさず実行できる。計算の中核は型検査・単体テスト対象の `src/` に置き、コマンド本体は薄く保つ。
- **手動設計フィールドは検証を通る暫定値で自動補完し、置換責務を後続Issueへ明記**。調（musicalKey）・カメラ軌跡（camera）・色（colors）・操作音（sfx）・多様性逓減区間（diversityZones）は音楽地図から導出できない。#45 は検証を通る最小の暫定値で埋め、camera は曲長から自動生成、diversityZones は空とする。実内容の確定は Issue #46（色・操作音・三部形式diversityZones・無和音treatment精緻化）と Issue #32（カメラ軌跡）へコメントで明記済み。
- **出力先は `src/profiles/<曲キー>/<曲キー>.profile.json` でコミット**。`src/profiles/README.md` が profiles 配下に takeover 内容を置く構成を示すため。

## 採用した数値と判定方法とその理由（すべて理由を先に述べる）

- **無和音区間の埋め方の既定規則 ＝ 直前の和音が存在し非「N」なら「直前和音を保持」、それ以外は「調の音階」**。検証関数 `validateProfile` と無和音解決 `resolveNoChordRegions` の双方が「直前和音を保持」に対し「直前に非「N」和音が境界で隣接」を要求するため、曲頭（直前なし）と連続「N」を「調の音階」に倒して違反を避ける。曲別上書きは和音索引（整数）で指定する（浮動小数点の時刻と異なり厳密一致で照合できるため）。
- **和音の終了時刻を曲長で丸める**。音楽地図は最終和音の終了時刻を曲長より微小に超えて記録することがある（TAKEOVERは19ミリ秒超過）。検証関数は和音の連続被覆には末尾の超過を許容するが、無和音区間には許容差1ミリ秒しか認めず、かつ無和音区間と和音の「N」区間の1ミリ秒一致を要求する。両者を同値にするため和音・無和音区間・スロットの素の終了時刻を曲長で丸める。曲長以内の和音は不変。
- **代表テンポ ＝ `round(60000 / 拍の長さの中央値)`**。中央値は曲尾の長さ0の拍や曲頭の不規則な拍といった外れ値に対し平均より頑健。TAKEOVERの中央値342.9ミリ秒から175を再現。
- **暫定カメラは曲長から自動生成（曲頭0と曲尾＝曲長の2点）**。検証（曲頭0・曲尾が曲長以上）とカメラ軌跡評価器（2点以上・時刻が厳密増加）の要求を満たす最小構成。曲長から末尾時刻を導くため曲別入力へ曲長を重複して書かず、曲長変更にも追従する。
- **`climaxAnchorMs` は手動入力で189000**（`docs/decisions/app-overall-decisions.md` §3.5 の189秒地点の回帰）。見せ場生成ではオプション引数、密度生成では入力フィールドとして渡す（関数ごとに位置が異なる）。

## 実装した内容

- 共有アダプタ `songmapAdapters.ts`: 型 `RawSongmap` と変換関数（`toBeats`・`toChords`・`toRepetitiveSegments`・`toChorusSegments`・`toOnsetBeats`・`toDensityBeats`・`toBeatsMs`・`toLoudnessCurve`・`toEmotionCurve`・`toLyricChars`・`toLyricCharOnsetsMs`・合成の `toOnsetInput`・`toTapBudgetInput`・`toShowcaseInput`）。感情曲線の刻みは vaCurve の隣接2点の時刻差から導出。
- `buildProfile.ts`: 関数 `buildProfile`・`buildNcRanges`（テスト目的で公開）、型 `ManualProfileInputs`。処理順は songmap変換→無和音区間→スロット（全和音区間に無和音解決を施してから生成）→見せ場→歌詞密度（密度プランから windowMs と windows のみ抽出）→タップ上限→ノーツ（オンセット→パターン付与→軌跡上配置を識別子で突き合わせ）→代表テンポ→組み立てと検証。
- `buildProfile.test.ts`: 実TAKEOVERで検証合格・主要不変条件（スロット数＝和音区間数、無和音解決後の和音名が「N」でない、最終見せ場が1つ、slotIndex範囲、タップ上限比率0.4〜0.8、テンポ175）、treatment既定規則（合成データで曲頭scale・直前非Nのprevious・連続Nのscale）と上書き、暫定camera検出。
- `takeoverInputs.ts`: musicalKey（ファ短調、主音クラス5）・climaxAnchorMs（189000）を確定値、colors・sfx を暫定値、diversityZones を空、camera は未指定（自動生成）、プレースホルダ目録付き。
- `generate-profile.ts`: 未登録の曲キーを `SONGS.find` で明示拒否（`findSong` の無言フォールバックを使わない）。検証合格時のみ書き出し、不合格時は誤り一覧を出して終了コード非ゼロ。
- `tsconfig.scripts.json`: コマンドを型検査するための設定（Node型＋DOMライブラリ、起点ファイルから到達するファイルのみ検査）。`typecheck` スクリプトに連結。

## レビューと検証（事実）

- 実装前後に CodeX と独立 Plan エージェントで設計・実装を複数回レビュー。実装後のレビューはマージ可（必須修正なし）と判定。レビューで挙がった2点を解消: コマンドを型検査対象に追加、暫定カメラを曲長から自動生成して曲長の重複保持を除去。
- `npm run typecheck`（`tsconfig.json`・`tsconfig.node.json`・`tsconfig.scripts.json` の3設定）: 型エラーなし。
- `npx vitest run`: 全86ファイル1147件合格（移行した6テストと新規 `buildProfile.test.ts` を含む）。
- `npm run profile:gen`: TAKEOVER生成に成功し検証合格。生成結果はノーツ434・和音210・スロット210・見せ場6・タップ上限260（母数434の6割）・テンポ175で設計資料と一致。再実行で生成物がバイト一致し決定論を確認。

## スコープ外（本Issueでは実装しない）

- TAKEOVERの実カメラ軌跡（#32・#46）・実配色・実操作音・三部形式diversityZones・和音索引24（32915〜34286ミリ秒の歌唱中無和音）を「調の音階」へ上書きする精緻化（#46）。多様性逓減区間の自動抽出の高度化（#42）。解析先行スキーマ検証ゲートのCI組み込み（#96）。残り課題曲のプロファイル生成（#88〜#91）。
