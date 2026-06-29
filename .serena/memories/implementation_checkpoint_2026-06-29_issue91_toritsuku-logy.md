# 実装チェックポイント 2026-06-29 Issue #91 トリツクロジー横展開（main統合版）

## 成果
課題曲「トリツクロジー」（作者 鶴三、曲キー toritsuku-logy、曲長140650ミリ秒）を、TAKEOVER・アフター・ザ・カーテンと同じく題名画面から選んで通しプレイできる実装済み曲にした。ブランチ worktree-issue-91-toritsuku-logy、PR #221。

## 並行開発との統合（重要）
本曲の開発中に、同じ Issue #91 のアフター・ザ・カーテン横展開（PR #220）が main にマージされた。両者は多曲化の共通基盤を別設計で独立実装していたため、main の設計を正として再統合した。
- main の設計を全面採用: 曲切替は実行時差し替え（applySong で曲依存オブジェクトを作り直す）＋ playback.loadSong（同一プレイヤーで別曲を再ロード。再読込しない）。曲束レジストリ src/profiles/index.ts の songBundle(key)。和音は正式な ChordQuality 追加方式。本編入りの簡易リードイン。
- 破棄した自分の設計: 再読込方式（URL引数＋ページ再読込）、resolveImplementedSong、window.__currentSongKey、sessionStorage 自動進行。これらは main のより整合的な設計に置き換えた。

## トリツクロジー固有で足した内容（main へ追加）
- 曲データ: docs/analysis/toritsuku-logy.songmap.json（拍154・サビ2区間）、src/profiles/toritsuku-logy/{toritsukuLogyInputs.ts(+test)・profile.ts・typographyChart.ts・toritsuku-logy.profile.json・toritsukuLogyProfile.gate.test.ts}。
- レジストリ追加: src/profiles/index.ts（songBundle）、scripts/generate-profile.ts（MANUAL_INPUTS_BY_KEY）、src/config/songs.ts（implemented:true）、src/config/songs.test.ts（実装済み3曲前提）、scripts/harness/profile-schema.mjs(+test)（第1層登録）、scripts/screens-smoke.mjs（開始3・準備中3）。
- 和音解析: トリツクロジー固有の m(9)/m(11)/m(13)/add9/sus2/sus4/dim を chordPitch.ts の QUALITY_TOKEN_TO_QUALITY で最も近い基本品質へ写す（main は m9/dim7/7(b13) を正式品質で既対応）。写して足る理由＝操作音は水滴音統一・判定はレーンと時間・notePatterns は音高値を読まず、slots[].pitches は実行時未使用（validateProfile が値域だけ検査）。
- 難易度調整（曲別上書きを buildProfile へ結線。main には無かったため移植）: ManualProfileInputs に density（DensityOptions の一部）と onset（OnsetOptions の一部）を追加。tapBudget の母数密度を譜面密度と連動（母数の1拍あたり密度＝既定値と譜面密度の大きい方）させ、実ノーツ数≤母数で一回性比率（上限＝母数の約6割）を維持。上書き無しの TAKEOVER・アフター・ザ・カーテンは母数も譜面も不変。
  - 値: サビ密度1.0（毎拍＝難易度のピーク）、サビ以外0.75（局所上限4拍に3ノーツで偏りが働く最大の0.25刻み値）。onset の声量・歌詞の重みを0.6→1.0。結果ノーツ121個・タップ上限78/130。サビで密・間奏で疎の起伏。

## 曲固有値の導出
musicalKey=変ロ短調（和音列の区間長加重最頻 Bb短調）。climaxAnchorMs=99386（後半で声量0.65+歌詞密度0.35が最大、第2サビ内）。camera=曲長と2サビ・climaxに節目を置く6点。色・操作音・多様性ラベルは流用。

## 検証
型検査3構成・全テスト・提出ビルド・両曲スモークが通過すること、および実音源の目視（難易度・偏り・水滴音/波紋/灯し/カメラ/歌詞同期・結果/成果物の曲名・TAKEOVER回帰）が良好であることを確認済み。main 統合後の再検証は本チェックポイント時点で実施中。
