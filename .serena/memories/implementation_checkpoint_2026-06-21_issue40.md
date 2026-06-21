# 実装チェックポイント（2026-06-21・Issue #40）

**状態: Issue #40（ノーツ軌跡上配置）の実装を完了。ブランチ `worktree-issue-40-note-trajectory` で PR #161 を作成・push 済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。入力の前段は中間ノーツ生成 [[implementation_checkpoint_2026-06-21_issue38]]、出力先の型は曲プロファイルスキーマ [[implementation_checkpoint_2026-06-19_issue34]]、再利用する軌跡補間器は [[implementation_checkpoint_2026-06-20_issue13]]（カメラ軌跡評価器 #13）。設計正典は [[phase2_design_checkpoint_2026-06-14]]、開発基盤の現状は [[dev_infrastructure_notes]]。

## 位置づけ

マイルストーンM1「譜面・曲プロファイルパイプライン」の処理である。`docs/research/04-ux-and-chart-design.md` §4 が定めるノーツ生成の4段階のうち第4段「各ノーツをその時刻のカメラ軌跡上の位置へ置く」を担う。出力は曲プロファイルの `notes` フィールドの `trajectoryPosition` 項目で、前段は中間ノーツ生成（#38、`id`・`timeMs`・`beatIndex`・`sectionKind` を持つ `OnsetNote`）、後段は曲プロファイル生成スクリプト（#45）とTAKEOVERプロファイル生成（#46、最終 `Note` の組み立て）。受け入れ基準は「配置がカメラ軌跡上に乗る」。

## 配置の意味（資料から一意に確定）

`trajectoryPosition` は、そのノーツの時刻におけるカメラ軌跡上のカメラ位置（注視点ではない）である。出典は `docs/idea/concept-final.md` §4「各ノーツポイントは軌跡上の固定位置に置かれる」・§7「ノーツ点の真下が、楽曲終了後のひまわりの配置位置になる」、`docs/research/04` §4「各ノーツを、その時刻のカメラの軌跡上の位置へ置く」。判定（#48・#49）が使うのと同一の軌跡補間器 `src/utils/cameraTrajectory.ts` の `poseAt(timeMs).position` を保存形へ写すことで、配置が判定と同じ軌跡上に乗ることを構成上保証する。配置の真下への投影によるひまわり位置の算出は本Issueの対象外で #60・#62・#63 が担う。

## 配置

`src/profiles/generate/noteTrajectory.ts`（新規）。曲プロファイルの1フィールドを生成する純粋関数であり、同じく曲プロファイルのフィールドを生成する中間ノーツ生成（#38）・JUST音程7スロット生成（#36）と責務が同種のため先例にそろえた。

## 最重要の意思決定（すべて理由を先に述べる）

- **引数の軌跡型を最小構造型 `TrajectorySampler`（`startTimeMs`・`endTimeMs`・`poseAt(timeMs):{position:Vec3}` のみ）にする**。軌跡補間器 `cameraTrajectory.ts` は three.js を実行時に取り込み、その公開インターフェース `CameraTrajectory` は本Issueが使わない軌跡上速度・軌跡上距離・距離から時刻への逆変換も含む。生成層は three.js を実行時に取り込まない方針である。最小構造型を自前定義すると、本モジュールは `cameraTrajectory.ts` を型としても取り込まず three.js への依存も持たず不要機能へ結合しない。`CameraTrajectory` はこの形を構造的に満たすため、呼び出し側は `createCameraTrajectory(profile.camera)` の戻り値を無変換で渡せる。`Vec3` のみ `../schema/profileSchema` から型として取り込む。
- **異常を発生源で止める**。`poseAt` は範囲外の時刻を端点へクランプし、非数（NaN）は比較が偽になって安全に扱えない。非有限値を素通しすると曲外や不正な時刻のノーツが端点や不正座標へ潰れ、ノーツごとの固定位置（concept-final §4）を静かに壊す。呼び出し側はJSONを生成する #45・#46 で異常はJSON混入前に止める必要がある。よって軌跡側の契約違反（時刻範囲が非有限・`startTimeMs < endTimeMs` を満たさず長さが正でない・算出座標が非有限）と入力ノーツの異常（識別子が空・時刻が非有限・時刻が範囲外）を文脈付きの例外で失敗させ、メッセージに識別子・入力配列内の番号・問題の値・許容範囲を含める。
- **時刻範囲の検査を厳密（`startTimeMs < endTimeMs`）にしゼロ長軌跡を拒否する**。現実に渡る軌跡は `createCameraTrajectory` の戻り値で、同関数は2点以上かつ時刻が厳密増加するキーフレームを要求するため戻り値は常に `startTimeMs < endTimeMs` を満たす。時刻範囲が0の軌跡は全ノーツが同一点へ潰れ固定位置を壊すため、実補間器の契約に揃えて拒否する。
- **座標は代入のみで写し算術しない**。`poseAt` の戻り値の座標をそのまま新規オブジェクト `{x,y,z}` へ写すことで、保存値がその時刻の軌跡上位置と一致し、注視点の混入や参照漏れを防ぐ。
- **スコープ境界**。Y軸スロット索引と譜面パターンの付与は #39、最終 `Note` の組み立てとJSON書き込みは #45・#46、判定の軌跡上距離と速さは保存せず #48 が実行時に導出、軌跡補間器の補間精度の検査は #13、実カメラでの視認確認と本編駆動は #59。

## 実装した内容

- 新規 `src/profiles/generate/noteTrajectory.ts`: 関数 `placeNotesOnTrajectory`、型 `TrajectoryNoteInput`（`id`・`timeMs`）・`TrajectorySampler`・`NoteTrajectoryPlacement`（`id`・`trajectoryPosition`）、内部ヘルパ `assertFinite`。import は `import type { Vec3 } from "../schema/profileSchema"` のみ。
- 新規 `src/profiles/generate/noteTrajectory.test.ts`: 合成キーフレームから `createCameraTrajectory` で軌跡補間器を構築する単体テスト15件。実カメラキーフレームは #46 まで存在しないため実データのテストは作らず、その理由をテスト冒頭コメントに明記。
- 更新 `src/profiles/generate/README.md`: Issue #40 の節を追記（責務・公開関数・引数の軌跡型と理由・異常の扱い・依存の向き・後段との契約・テスト方針）。

## レビューと検証（事実）

- Codex に設計・プランを2往復レビュー依頼。第1回で6件（最小構造型 `TrajectorySampler` で完全な `CameraTrajectory` 型への結合を避ける、非有限値の明示拒否、最近傍距離テストは同義反復で検出力が無いため削除し独立算出した `poseAt` 値との深い等価へ置換、軌跡側契約違反のテスト追加、README追記対象を生成層READMEに限定、実データテスト不在の根拠をコメント明文化）をすべて反映。第2回で最終論点1件（時刻範囲の検査を厳密 `startTimeMs < endTimeMs` にしゼロ長軌跡を拒否）を反映。反映後の再レビューで残る懸念・誤りなしを確認。実装後の妥当性レビュー（subagent）は全7観点で問題なし・このままpush可の総合判定。
- `npm run typecheck`（`tsconfig.json` と `tsconfig.node.json` の両方）: 型エラーなし。`createCameraTrajectory` の戻り値を引数 `TrajectorySampler` へ無変換で渡せることを型で確認。
- `npm test`（vitest）: 74ファイル966テスト全通過（本Issueで15を新規追加。既存を破壊せず）。
- 受け入れ基準の保証: 各算出位置が、テスト内で時刻から独立に算出した `poseAt(timeMs).position` と一致することを深い等価で表明。判定方法の採用理由は、本関数が座標へ算術せず代入で写すだけであり `poseAt` は同一入力に対し決定論で同一値を返すため、独立算出値と保存値が同一の数値になるからである。あわせて順序・件数・識別子の保持、空入力、決定論、入力ノーツの異常での例外と両端での成功、軌跡側の契約違反での例外を表明。
- 依存規則: 中核（engine・chart・scoring・input・audio）・profiles 以外・tools・rendering・three.js を実行時にも型としても import しない。`cameraTrajectory.ts` を型としても取り込まず、schema からは `Vec3` を型としてのみ取り込む。

## 次の主要作業

1. PR #161 のレビュー・マージ。
2. M1 の続き: 譜面パターン適用 #39（`slotIndex`・`pattern` 付与）、曲プロファイル生成スクリプト #45、TAKEOVER曲プロファイル生成 #46（#38・#39・#40 の出力を `id` で結合し最終 `Note` を組み立て）、解析先行スキーマ検証ゲート #96。
