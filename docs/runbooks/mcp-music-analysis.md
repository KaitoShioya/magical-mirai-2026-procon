# Runbook: mcp-music-analysis (librosa)

`uvx mcp-music-analysis` で起動する librosa ベースの音響解析MCP。テンポ/ビート/クロマ/MFCC を算出する。**参考曲（YouTube音源等）の特徴把握用**。課題曲の正確なビートは TextAlive 音楽地図（beatId固定）が正典なので、そちらと使い分ける。

---

## 1. 利用方法（黄金パス）

### ⚠ 大原則: mp3/mp4/AAC を直接 `load` しない → 必ずWAV変換
AAC-in-mp4 等を直接 `load` すると soundfile が読めず audioread フォールバックに落ち、**15分以上スタックする**（実際に発生）。必ず先に ffmpeg でモノラル22.05kHz WAVへ変換する。
```bash
ffmpeg -y -v error -i input.mp4 -ac 1 -ar 22050 out.wav   # WAVなら load 即時完了
```

### 基本フロー
```
1. (任意) download_from_youtube / download_from_url  → 一時mp4パス取得
2. ffmpeg で WAV化（Bashツールで実行）
3. load(file_path=out.wav)            → { "y_path": ".../out_y.csv" }
4. get_duration / tempo / beat_track / chroma_cqt / mfcc に y_path を渡す
```

### 長尺のスライス解析
```
load(file_path=song.wav, offset=70, duration=40)   # 70秒地点から40秒だけ
```
⚠ 出力CSVパスは `<stem>_y.csv` 固定。**スライスloadは同じCSVを上書きする**ため、全体ロードの結果を消す。順序に注意（必要な解析を都度回す）。

---

## 2. 機能リファレンス（MCPツール）

| ツール | 入力 | 出力 | 用途 |
|---|---|---|---|
| `download_from_youtube` | youtube_url | 一時mp4パス | 参考曲取得（yt-dlp） |
| `download_from_url` | url | 一時ファイルパス | 直リンク取得 |
| `load` | file_path, offset?, duration? | `{ y_path: "<stem>_y.csv" }` | 時系列を**テキストCSV**で保存 |
| `get_duration` | path_audio_time_series_y | 秒 | 長さ確認 |
| `tempo` | y, start_bpm?, max_tempo?, ... | `[bpm]` | テンポ推定（**start_bpm依存**） |
| `beat_track` | y, units?(frames/samples/time), start_bpm?, tightness? | `{ tempo, beats[] }` | ビート列 |
| `chroma_cqt` | y, hop_length? | クロマ行列 | 和声/類似度 |
| `mfcc` | y | MFCC行列 | 音色特徴 |

全解析ツールの第1引数は `path_audio_time_series_y`（= `load` が返した `y_path`）。

---

## 3. 機能詳細（確定知見）

### tempo は事前分布に敏感 → 必ず裏取り
`tempo` は `start_bpm` 次第で倍/半テンポの別解を返す（例: 同一曲で **117↔172 BPM** が出た）。
- `beat_track(units="time")` の隣接ビート間隔の中央値から `60000/interval_ms` で BPM を算出して照合する
- 速い曲は `start_bpm` を実テンポ付近に与える（例 `start_bpm=170`）と正解に寄る

実測値（本プロジェクト、WAV化後）:
| 曲 | BPM(中央値) | 拍間隔 | 長さ |
|---|---|---|---|
| TAKEOVER | 175 | 343ms | 3:57 |
| シャッターチャンス | 115 | 522ms | 3:10 |
| 世界最後の音楽隊 | 150 | 400ms | 4:10 |

### CSVは巨大（時系列がテキスト）
3分曲で `*_y.csv` が **110MB超**。全曲を素朴に回すと遅い。スライス（offset/duration）か、本当に必要な区間だけ解析する。

### MCPに無い解析はローカル librosa で（強力）
MCPは pyin（メロディ）等を持たない。`pip install librosa`（実績: **librosa 0.11.0**）でローカル実行すると pyin/chroma_cqt を直接叩け、解析の自由度が大きく上がる。
```python
import librosa, numpy as np
y, sr = librosa.load("out.wav", sr=22050, mono=True)
f0, vflag, vprob = librosa.pyin(y, fmin=110, fmax=700, sr=sr, hop_length=512)  # メロディ
chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)                # 和声
```
- **EDMフルミックスではメロディ抽出が困難**: TAKEOVERで pyin の有声判定は 6%（1157文字中66）のみ。楽器がボーカルf0をマスクする。→ 音程JUSTは**コードトーン格子**（TextAlive `getChords` ベース）を正とし、pyinは補助
- 繰り返しフレーズのクロマ類似度は高い（同テキスト平均0.967 vs ランダム0.943）が判別力は弱い → 反復構造はsongmapのテキスト等値/セグメントを正とする

---

## 4. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `load` が返らない/15分スタック | AAC/mp4直渡し → audioread fallback | 先に `ffmpeg -ac 1 -ar 22050` でWAV化 |
| 解析が全部同じ区間になる | スライスloadが `<stem>_y.csv` を上書き | 解析ごとにload→即解析。ファイル名を分けるならWAV側を分ける |
| BPMが倍/半でおかしい | `tempo` の start_bpm 依存 | `beat_track` のビート間隔中央値で裏取り、`start_bpm` を実測付近に |
| 処理が遅い | CSVが巨大（110MB+） | offset/duration でスライス、必要区間のみ |
| メロディ（pyin）がほぼ空 | フルミックスで声がマスク | コードトーン（TextAlive getChords）を正に。ボーカル分離(demucs等)は費用対効果次第 |
| `download_from_youtube` 失敗 | yt-dlp未導入/動画不可 | 環境確認。`download_from_url` で直リンク代替 |

### 関連
- WAV変換・スライスの回避策メモ: `~/.claude/.../memory/music-analysis-mcp-workaround.md`
- 課題曲の正確なビート/コードは TextAlive songmap（`docs/analysis/*.songmap.json`）が正典
