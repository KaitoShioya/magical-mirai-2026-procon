# 実装チェックポイント 2026-06-28 TAKEOVER譜面の再設計と画面振動のノーツ同期

## 概要
TAKEOVER の自動生成譜面（ノーツの発生タイミング配置と音程番号 slotIndex 1〜7 の割り当て）を音楽ゲームとして面白く再設計し、あわせて画面振動をノーツの消滅に同期させた。変更は曲プロファイル生成層 `src/profiles/` と統括 `src/app/index.ts` に閉じ、判定・採点・多様性スコア（`src/scoring`・`src/input`）と描画（`src/rendering`）は不変。ブランチ `worktree-issue-takeover-chart-redesign`、PR #203（base=main）。GitHub Issue は権限分類で新規作成不可のため未作成（ブランチ名で対応）。

## 背景（解消した不満）
1. 同テンポの箇所でノーツ配置が単調に同じ（旧 onsetNotes は拍格子のみ・休符無し）。
2. 同じ音程番号が連続して退屈（旧 notePatterns は声量+感情の勢い値で中央集中・最大連続6・移動の92.7%が±1）。
3. サビが密で単調で難しいのに面白くない（旧はサビ各64拍全埋め、density.ts の密度プランが未結線）。

## 意思決定（ユーザー確定）
- 配置基準: 拍格子＋音楽的強調（小節内拍位置・コード変化・声量・歌詞密度）で選別＋休符/溜め。
- 番号割当: コードトーン土台＋配置語彙（階段/トリル/跳躍/意図的同音）＋反単調規則。
- 難易度: 中庸＋上達で多様性スコアが伸びる。サビは物量でなく複雑さ・対比で。
- リズム粒度: 四分音符グリッド内に限定。判定（beats[beatIndex].startTimeMs 基準）と多様性逓減（beatOffset キー、3サビ同リズム前提）を変えず、サブビートは導入しない。
- 実機目視による段階調整: サビ密度を毎拍→0.75→0.5へ低減、跳躍間引き leapStride を3→4、回帰サビの番号変換を「1.5倍拡大」→「+2平行移動」、選別を「等間隔」→「局所上限付き強調」。最終的に①②③解消・難易度中庸・単調さ解消を確認。

## 実装範囲とファイル
- `src/profiles/generate/onsetNotes.ts`: 拍選別を密度プラン（区間分類・区間別目標数）＋強調信号の消費へ全面書き換え。選別は `selectWithLocalCap`（強調スコア降順に選ぶが windowBeats=4 拍の窓に windowCap=3 個までの局所上限を守り、足りなければ未選択を等間隔で補う）。OnsetBeat に position・lengthInBar を追加。サビ3反復は反復不変信号（小節内拍位置＋先頭サビの声量・歌詞＋相対コード変化）から同一の相対拍位置集合を作り全反復へ写す。サビ拍数不一致は文脈付き例外。出口で同一 beatIndex 重複を例外検査。
- `src/profiles/generate/notePatterns.ts`: 番号割当を勢い値から刷新。コードトーンを土台に、フレーズ先頭ごとの起点音域分散（`seedSlotByOrdinal`、循環係数3）、配置語彙（声量・小節内拍位置で選択）、跳躍優先位置（フレーズ先頭>コード境界>強拍、leapStride で間引き）、同一連続上限 maxRun=2、サビ役割変換（変奏 −2／回帰 +2 の平行移動）。`pattern` は確定後 slotIndex 差から決める既存方式を維持。未使用フィールド emotion を除去。
- `src/profiles/generate/density.ts`: DEFAULT_DENSITY_OPTIONS.chorusDensityPerBeat を 1.0→0.5。密度値は countTargetNotes が0.25で割る都合で0.25刻みに限る。
- `src/profiles/generate/buildProfile.ts`: 密度プランをオンセット選別へ結線、番号割当へ拍・フレーズ先頭時刻・diversityZones を渡す。最終 Note 配列の同一 beatIndex 重複検査を追加。
- `src/profiles/generate/songmapAdapters.ts`: toOnsetBeats に position・lengthInBar、`toPhraseOnsetsMs`（空フレーズ・空単語を飛ばす）・`toChordChangeTimesMs` を追加、toOnsetInput を密度部品受け取りへ拡張。
- `src/profiles/generate/README.md`: 上記に合わせ #38・#39・#43 の節を新設計へ全面更新。
- `src/profiles/takeover/takeover.profile.json`: `npm run profile:gen` で再生成（総ノーツ291）。
- 実データ・単体テスト更新: onsetNotes/notePatterns/density/lanternPlacement の takeover テストと単体テストを新基準・新生成値へ更新。`takeoverProfile.gate.test.ts` に同一 beatIndex 重複0検査を追加。`tapBudget.takeover.test.ts` は不変（fullPossible は拍・サビ由来で notes 非依存）。
- `src/app/index.ts`: 画面振動の発火を全拍→ノーツのある拍（noteBeatIndices で絞る）へ限定。clock 再同期（didResync）時に `beatScheduler.syncTo(gameTimeMs)` で基準を貼り直し、飛び区間の一括発火による先頭ノーツの振動欠落を解消。

## 達成基準と実測値（再生成 takeover.profile.json）
閾値の根拠を先に述べ値を示す。
- 同一番号の連続: 四分音符格子で同番号連続は同一スロット連打であり過剰は単調・疲労を生む。最大2。実測 最大2（旧6）。
- 番号の音域: 中央集中の解消には全7スロット使用かつ最頻が過半でないことを要する。最頻≤35%・全7各≥3%。実測 最頻16〜18%・全7使用（旧 3〜5に92%・最上7は1回）。
- 番号移動の躍動: ±1の隣接刻みに偏ると這うように単調。番号が変わった移動のうち跳躍（差の絶対値≥2）を20〜45%。実測 約40〜43%（旧7.3%）。
- 一回性の維持: 全ノーツを押し切れない密度が一回性を成立させる。総ノーツ数>タップ上限260。実測 291。
- 拍の一意性: 多様性逓減のキー衝突と判定の同時刻化を避ける。同一 beatIndex 重複0。実測 0。
- サビ: 各反復32ノーツで3反復が同一 beatOffset 集合を共有し、連続反復組で番号が30%以上変化。局所密度は最大2.5ノーツ/秒・最大連続3拍。

## 検証結果（Node 22）
- `npm run typecheck`: 緑。
- `npm test`: 138ファイル・1707件 全緑（鮮度検査＝コミット済みJSONが生成器の再生成物と一致、同一 beatIndex 重複0検査を含む）。
- 実機ブラウザの目視確認: 不満①②③の解消、難易度が中庸、画面振動がノーツ消滅に同期して躍動感が出ること、スタート直後の同期ずれ解消を確認（ユーザー承認）。
- `npm run quality:fps` は実GPU要のため当環境未計測。総ノーツ434→291で性能悪化なし。

## 留意事項
- 画面振動の時刻源は落下UI（`playScreen` の `play.currentGameTimeMs()` = world.gameTimeMs）と振動（同 world.gameTimeMs）で同一。再同期時の基準貼り直しはタブ復帰・シーク時のずれにも有効。
- tapBudget（fullPossible=434・limit=260）は不変。実ノーツ数<母数は #44 設計境界の意図。
- サビ共有テンプレートは「3反復が同一拍数」を前提とし、異なる曲（横展開）では例外で停止する。横展開時に要再設計。
- 暫定値（★実機調整）: chorusDensityPerBeat=0.5、leapStride=4、maxRun=2、windowBeats=4・windowCap=3、強調スコアの各重み。
