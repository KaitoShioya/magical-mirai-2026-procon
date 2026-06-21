# takeover — TAKEOVERの曲プロファイル（Issue #46）

- **責務**: 1曲目TAKEOVERの完成プロファイルを音楽地図のダンプと手動定義から組み立て、検証器を通る `SongProfile` を作る。成果物の `takeover.profile.json` を生成・コミットする。
- **依存の向き**: 解析データから派生フィールドを作る `../generate` の生成関数、曲非依存のカメラ軌跡評価器 `../../utils/cameraTrajectory`、ロード設定 `../../config/songs` を取り込む。曲非依存の中核（`engine` 等）は取り込まない。
- **担当Issue**: 組み立てと検証は #46。生成処理の任意曲対応・汎用CLI化は #45。プロファイルをアプリへ読み込み本編でカメラを駆動する結線と実データでの視認品質の確認は #59（アーキテクチャ3.6節）。

## ファイル

- `manualData.ts` — 手動定義の正典。カメラキーフレーム・タップ効果色・操作音・無和音区間の埋め方・調・テンポを責務ごとに分けて持つ。
- `buildTakeoverProfile.ts` — 音楽地図のダンプを表す型 `TakeoverSongmap` と純粋関数 `buildTakeoverProfile(songmap)`。
- `index.ts` — 公開窓口（組み立て関数・型・手動定義の再エクスポート）。完成プロファイルJSONの取り込みは行わない（#59の責務）。
- `takeover.profile.json` — 生成・コミットする完成プロファイル（成果物）。
- `buildTakeoverProfile.test.ts` — 常時実行の検証ゲート（読み取りのみ）。
- `generateProfile.gen.test.ts` — 環境変数 `GEN_TAKEOVER_PROFILE` のときだけ成果物JSONを書き出す生成テスト。

## 生成・検証の手順

```sh
npm run build:profile-takeover   # 成果物 takeover.profile.json を書き出す
npm run typecheck                # 型検査
npm test                         # 全テスト（常時実行の検証ゲートを含む。生成テストは飛ぶ）
```

クリーンな取得状態では成果物JSONがまだ無いため、先に `npm run build:profile-takeover` を実行してから `npm test` を実行する。検証ゲートの成果物JSON一致検査は、JSONが存在するときだけ比較する。

## 手動定義の注記

- カメラの6キーフレームは★暫定である。軌跡上速度が正であることは機械検査で固定するが、見栄え（滑らかさ・構図）の確認は #59 で行う。
- 多様性逓減区間の reprise は第3サビ（時刻165674.6〜187874.6ミリ秒）に揃える。見せ場の最終アンカー189000ミリ秒とは約1秒ずれるが、いずれも楽曲最終部（最後の「Clap to the Beat」を含む区間）を指す。
