---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html"
ID:
createdAt: "2026-05-29T19:29:58+09:00"
---
## Interface PartialVideoEntry

TextAlive の動画データを上書きする情報

Optional data to overwrite TextAlive video data

interface PartialVideoEntry {  
[beatId](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#beatId)?: number;  
[chordId](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#chordId)?: number;  
[json](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#json)?: [VideoData](https://developer.textalive.jp/packages/textalive-app-api/interfaces/VideoData.html);  
[lyricDiffId](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#lyricDiffId)?: number;  
[lyricId](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#lyricId)?: number;  
[repetitiveSegmentId](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#repetitiveSegmentId)?: number;  
}

## Properties

### Optional beatId

beatId?: number

ビート情報のリビジョンID / Beat info revision ID

### Optional chordId

chordId?: number

コード進行の情報のリビジョンID / Chord info revision ID

### Optional json

json?: [VideoData](https://developer.textalive.jp/packages/textalive-app-api/interfaces/VideoData.html)

動画の実データ / Video data

### Optional lyricDiffId

lyricDiffId?: number

歌詞訂正ID / Lyrics diff ID

### Optional lyricId

lyricId?: number

歌詞ID

- `-1`: 最新の歌詞情報が使われる
- `0`: 歌詞情報を読み込まない
- それ以外: 指定されたIDの歌詞情報が使われる

Lyrics ID

### Optional repetitiveSegmentId

repetitiveSegmentId?: number

サビなどの繰り返し区間のリビジョンID / Repetitive segment revision ID