---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html"
ID:
createdAt: "2026-05-29T19:25:45+09:00"
---
## Interface IDataLoader

読み込まれている音楽地図や歌詞などの情報にアクセスするためのインタフェース

This interface provides access to song map and lyrics information.

#### Hierarchy

- ISongExplorer
	- IDataLoader

## Properties

### Readonly fonts

fonts: [IFontLoader](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IFontLoader.html)

フォントの読み込みステータス / Font loading status

### Readonly lyrics

lyrics: [LyricsInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html)

歌詞の発声タイミング情報 / Lyrics timing info

### Readonly lyricsBody

lyricsBody: [LyricsBody](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsBody.html)

歌詞の情報 / Lyrics info

### Readonly lyricsId

lyricsId: number

歌詞の発声タイミング推定ID / Lyrics timing estimation ID

#### Deprecated

Use [LyricsInfo.id](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html#id-1) property instead

### Readonly permalink

permalink: string

TextAlive サービスのURL / TextAlive website url

### Readonly song

song: [Song](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html)

楽曲情報 / Song info

### Readonly songMap

songMap: [ISongMap](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html)

音楽地図情報 / Song map info

### Readonly text

text: string

歌詞テキスト / Lyrics text

#### Deprecated

Use [LyricsBody.text](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsBody.html#text) property instead

## Methods

### findBeat

- findBeat(time, options?): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html)
- 指定された位置のビート情報を取得する
	Find beat that overlaps with the specified timing
	#### Parameters
	- time: number
		位置 \[ms\] / Position \[ms\]
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
		取得オプション / Optional parameters for finding beat
	#### Returns IBeat
	ビート情報（見つからなければ `null` ） / Beat info (`null` if not found)

### findBeatChange

- findBeatChange(startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html) >
- 指定された時区間のビート情報の変化を取得する
	Look for beat transitions in the specified time range
	#### Parameters
	- startTime: number
		時区間の開始位置 \[ms\] / Start position \[ms\]
	- endTime: number
		時区間の終了位置 \[ms\] / End position \[ms\]
	#### Returns TimedObjectsInRange<IBeat>
	ビート情報の変化 / Beat transitions

### findChord

- findChord(time, options?): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html)
- 指定された位置のコード進行を取得する
	Find chord that overlaps with the specified timing
	#### Parameters
	- time: number
		位置 \[ms\] / Position \[ms\]
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
		探索オプション / Optional parameters for finding a chord
	#### Returns IChord
	コード進行（見つからなければ `null` ） / Chord info (`null` if not found)

### findChordChange

- findChordChange(startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) >
- 指定された時区間のコード進行の変化を取得する
	Look for chord progressions in the specified time range
	#### Parameters
	- startTime: number
		時区間の開始位置 \[ms\] / Start position \[ms\]
	- endTime: number
		時区間の終了位置 \[ms\] / End position \[ms\]
	#### Returns TimedObjectsInRange<IChord>
	コード進行の変化 / Chord progressions

### findChorus

- findChorus(time, options?): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html)
- 指定された位置のサビ情報を取得する
	Find a chorus part that overlaps with the specified timing
	#### Parameters
	- time: number
		位置 \[ms\] / Position \[ms\]
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
		取得オプション / Optional parameters for finding a chorus part
	#### Returns IRepetitiveSegment
	サビ情報（見つからなければ `null` ） / Chorus part info (`null` if not found)

### findChorusChange

- findChorusChange(startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html) >
- 指定された時区間のサビ情報の変化を取得する
	Look for chorus part transitions in the specified time range
	#### Parameters
	- startTime: number
		時区間の開始位置 \[ms\] / Start position \[ms\]
	- endTime: number
		時区間の終了位置 \[ms\] / End position \[ms\]
	#### Returns TimedObjectsInRange<IRepetitiveSegment>
	サビ情報の変化 / Chorus part transitions

### getBeats

- getBeats(): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html) \[\]
- 楽曲中のビートに関する情報を取得する
	Get beats in the current song
	#### Returns IBeat\[\]
	ビート情報（見つからなければ空の配列） / Beats (empty array if not found)

### getChords

- getChords(): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) \[\]
- 楽曲中のコード進行に関する情報を取得する
	Get chord info in the current song
	#### Returns IChord\[\]
	コード進行の情報（見つからなければ空の配列） / Chord info (empty array if not found)

### getChoruses

- getChoruses(): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html) \[\]
- 楽曲中のサビに関する情報を取得する
	Get chorus parts in the current song
	#### Returns IRepetitiveSegment\[\]
	サビ情報（見つからなければ空の配列） / Chorus parts (empty array if not found)

### getMaxVocalAmplitude

- getMaxVocalAmplitude(): number
- 楽曲中の最大声量を取得する
	Get maximum vocal amplitude
	- このメソッドを使うには [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) の初期化オプション（ [PlayerOptions#vocalAmplitudeEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#vocalAmplitudeEnabled) を `true` にする必要があります
	- To use this method, [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) constructor option [PlayerOptions#vocalAmplitudeEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#vocalAmplitudeEnabled) needs to be `true`
	#### Returns number
	最大声量
	#### See
	[PlayerOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html)

### getMedianValenceArousal

- getMedianValenceArousal(): [ValenceArousalValue](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html)
- V/A空間中の座標遷移の中央値を取得する
	Get median valence arousal value throughout the song
	- このメソッドを使うには [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) の初期化オプション（ [PlayerOptions#valenceArousalEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#valenceArousalEnabled) を `true` にする必要があります
	- To use this method, [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) constructor option [PlayerOptions#valenceArousalEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#valenceArousalEnabled) needs to be `true`
	#### Returns ValenceArousalValue
	座標値
	#### See
	[PlayerOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html)

### getValenceArousal

- getValenceArousal(time): [ValenceArousalValue](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html)
- 指定された位置のV/A空間中の座標を取得する
	Get valence arousal value at the specified timing
	- このメソッドを使うには [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) の初期化オプション（ [PlayerOptions#valenceArousalEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#valenceArousalEnabled) を `true` にする必要があります
	- To use this method, [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) constructor option [PlayerOptions#valenceArousalEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#valenceArousalEnabled) needs to be `true`
	#### Parameters
	- time: number
		位置 \[ms\] / Position \[ms\]
	#### Returns ValenceArousalValue
	座標値
	#### See
	[PlayerOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html)

### getVocalAmplitude

- getVocalAmplitude(time): number
- 指定された位置の声量を取得する
	Get vocal amplitude at the specified timing
	- このメソッドを使うには [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) の初期化オプション（ [PlayerOptions#vocalAmplitudeEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#vocalAmplitudeEnabled) を `true` にする必要があります
	- To use this method, [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) constructor option [PlayerOptions#vocalAmplitudeEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#vocalAmplitudeEnabled) needs to be `true`
	#### Parameters
	- time: number
		位置 \[ms\] / Position \[ms\]
	#### Returns number
	声量
	#### See
	[PlayerOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html)