# profiles — 曲ごとの内容

- **責務**: 曲ごとの内容（譜面・効果音・カメラ軌跡・灯しとJUSTのパターン・見せ場マップ）。読込時に検証する定義（schema）と1曲目の内容（takeover）を内部に置く。これは設定ではなく内容であり、欠落時は明確に失敗させる。
- **依存の向き**: `profiles` は `engine` 等の中核から import されない（中核は曲固有の内容を引数または読込済みデータとして受け取る）。`profiles` 自身は中核を import しない。
- **担当Issue**: 定義 schema は #34、1曲目 takeover は #46
- 将来の内部構成: `schema` / `takeover`。詳細は `docs/decisions/architecture.md`。

## schema（Issue #34）

曲プロファイルJSONの型の契約と実行時バリデータを置く。

- `schema/profileSchema.ts` — `SongProfile` と全サブ型。ロード元・解析の必須項目（テンポ・ビート格子・コード進行・繰り返し区間・声量曲線・感情曲線・歌詞文字タイミング・歌詞密度・無和音区間・見せ場マップ）と、譜面派生フィールド（スロット・ノーツ・カメラ軌跡・色・操作音・多様性逓減区間・タップ上限）を1つの型に集約する。
- `schema/validateProfile.ts` — `validateProfile(value)` 検証関数。例外を投げず欠落・不正の一覧を返す純関数で、Node.js（CIの#96ゲート）とブラウザ（読込時）の双方から呼べる。値域の範囲は `src/config/tuning.ts`、ロード元の照合は `src/config/songs.ts` の `SONGS` を参照する。
- `schema/fixtures/minimalValidProfile.ts` — 検証テスト用の小さな正しい実例（実TAKEOVERデータではない）。
- `schema/validateProfile.test.ts` — 合格と各不正の不合格を固定するテスト。
- 検査の段階: 解析の必須項目は存在と構造を厳密に検査し、譜面派生フィールドは存在と基本不変条件と構造対応を検査する。協和性・被覆率・密度の数値整合の妥当性は #36・#46 の責務とする。
- 実プロファイルの生成（#45・#46）と検証ゲートのCI実行（#96）は本ディレクトリの検証関数を利用する。
