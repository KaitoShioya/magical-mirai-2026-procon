# Runbook: claude-video-vision plugin

ローカル動画/YouTube URL からフレーム抽出＋（任意で）音声解析を行い、Claudeが映像を「見る」ためのMCPプラグイン。本プロジェクトでは参考MV・テキスト表現リファレンスの視覚解析に使用。

---

## 1. 利用方法（黄金パス）

### セットアップ
```
video_setup(backend="local")   # 依存チェック。ffmpeg/yt-dlpの有無を返す
```
- backend: `local`（whisper.cpp）/ `gemini-api`（要 GEMINI_API_KEY）/ `openai`
- **本環境では whisper.cpp 未導入** → ローカル文字起こし不可。歌詞は既知なので **`skip_audio:true`・transcription無し**で映像のみ解析する運用が確実
- YouTube URLは yt-dlp 経由でDL（導入済み）

### 推奨フロー（30秒超の動画は必須）
```
1. video_info(path)                    # 長さ・解像度・fps確認（軽量）
2. video_analyze(path, filters={scene_changes:true, motion:true, exposure:true})
                                        # シーン構造を把握（フレーム抽出しない）
3. video_watch(path, skip_audio:true, frame_mode:"images", resolution:512,
               segments=[...])         # 重要区間に可変fpsを割当てフレーム取得
```
- **3分超を一括高fpsで watch しない**（フレーム過多）。総フレームは ~70枚程度に抑える
- `video_analyze` のシーン変化・モーション結果を見て、変化の多い区間ほど高fps、静的区間は低fpsを `segments` で割当てる

### 短尺（〜十数秒）の簡易取得
```
video_watch(path, fps:3, resolution:640, frame_mode:"images", skip_audio:true)
```

---

## 2. 機能リファレンス（MCPツール）

| ツール | 主パラメータ | 出力 | 用途 |
|---|---|---|---|
| `video_setup` | backend, whisper_engine?, whisper_model? | 依存状況 | 初回チェック |
| `video_info` | path | duration/resolution/codec/fps/has_audio | メタdata（処理しない） |
| `video_analyze` | path, filters{} | scene_changes/motion/exposure/silence/black/freeze/blur/loudness/transcription | 構造把握（フレーム抽出なし） |
| `video_watch` | path, fps/segments, resolution, frame_mode, skip_audio, start_time/end_time, view_sample | フレーム（画像 or 説明）＋音声解析 | 実際に「見る」 |
| `video_configure` | backend, default_fps, frame_resolution, max_frames... | 設定保存 | 既定値調整 |

### video_watch の主オプション
- `frame_mode`: `"images"`（base64画像でClaudeが直接見る）/ `"descriptions"`（テキスト化・トークン節約）
- `segments`: `[{start:"00:00:23", end:"00:00:30", fps:4, resolution?}]` 形式で**区間別に可変fps**（グローバルfpsを上書き）
- `resolution`: フレーム横幅px（128〜2048）。512〜640で十分なことが多い
- `skip_audio`: true で音声処理を完全スキップ（whisper未導入環境で確実）
- `view_sample`: N枚だけ等間隔抽出（ざっと俯瞰）

### video_analyze の filters
`scene_changes`(scdet) / `motion`(siti) / `exposure`(signalstats) / `silence` / `black_intervals`(blackdetect) / `freeze` / `blur` / `loudness`(ebur128) / `transcription`

---

## 3. 機能詳細（確定知見）

- **YouTube URL の `video_info` で resolution が `0x0`・codec `unknown` と出ることがある**が、解析自体は通る（DL前メタ取得の制約。実害なし）
- **入力スケール感**: 本セッションでは 11秒動画を `fps:3, resolution:640` で約33フレーム、3分超MVは `video_analyze`→区間別segments で ~70フレームに制御して解析できた
- **音声解析を使う場合**: backend を `gemini-api`（GEMINI_API_KEY は `.env` にある）にすれば whisper無しでも文字起こし可能。ただし歌詞既知なら不要、`skip_audio:true` が速くて確実
- **長尺で音声チャンク化が走った場合**、結果の `audio.warnings` / `analysis.audio_warnings` にチャンク境界・リトライ・失敗が出る → ユーザーに共有
- **frame_mode="descriptions"** はフレームをテキスト化してトークンを大幅節約（多数フレームを俯瞰したいときに有効。`frame-describer` サブエージェントが担う）

### 本プロジェクトでの解析実績（参考）
- `docs/idea/video/DXW0aT6FKSlkqBq2.mp4`（テキスト表現リファレンス, 11秒）: フレーム解析で「1文字1拍スマッシュカット」等の技法を抽出 → `docs/refs/reference-analysis.md`
- シャッターチャンスMV / the hole MV（YouTube）: `video_analyze`→区間segments で構成・配色・音ハメ技法を抽出

---

## 4. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `video_setup` が Missing Dependencies (whisper.cpp) | ローカル文字起こし未導入 | `skip_audio:true` で映像のみ、または backend=`gemini-api` |
| フレームが多すぎ/処理が重い | 長尺を一括高fps | `video_analyze`で構造把握→`segments`で区間別fps、総~70枚に制限 |
| `video_info` で 0x0 / unknown | YouTube URLのメタ取得制約 | 無視可。`video_watch`は通る |
| 音声解析が空 | whisper未導入 or skip_audio | 文字起こしが要るなら backend=gemini-api（GEMINI_API_KEY） |
| YouTube DL失敗 | yt-dlp/動画側制約 | `video_setup`でyt-dlp状況確認、別URL/ローカルファイル |
| トークン消費が大きい | 画像フレーム多数 | `frame_mode:"descriptions"` or `view_sample` で俯瞰 |

### 運用メモ
- whisper未導入のため、本プロジェクトの映像解析は原則 `skip_audio:true`・transcription無し（歌詞は `docs/musics/*.md` で既知）
- 音響的解析（テンポ/ビート）が要るときは映像から音声分離 → `mcp-music-analysis`（→ `mcp-music-analysis.md`）へ
