---
source: "https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html"
ID:
createdAt: "2026-05-29T19:23:06+09:00"
---
#### Implements

- [IPlayer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html)

## Methods

### createFromJSON

- createFromJSON(json, options?): Promise<Video>
- #### Parameters
	- json: [VideoData](https://developer.textalive.jp/packages/textalive-app-api/interfaces/VideoData.html)
	- `Optional` options: [PlayerVideoOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html)
	#### Returns Promise<Video>
	動画オブジェクト / Video object

### createFromSongPath

- createFromSongPath(songPath, options?): Promise<Video>
- #### Parameters
	- songPath: string
	- `Optional` options: [PlayerVideoOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html)
	#### Returns Promise<Video>
	動画オブジェクト / Video object

### createFromSongUrl

- createFromSongUrl(songUrl, options?): Promise<Video>
- #### Parameters
	- songUrl: string
	- `Optional` options: [PlayerVideoOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html)
	#### Returns Promise<Video>
	動画オブジェクト / Video object

### createFromText

- createFromText(text, options?): Promise<Video>
- #### Parameters
	- text: string
	- `Optional` options: [PlayerVideoOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html)
	#### Returns Promise<Video>
	動画オブジェクト / Video object

### findBeat

- findBeat(time, options?): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html)
- #### Parameters
	- time: number
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
	#### Returns IBeat
	ビート情報（見つからなければ `null` ） / Beat info (`null` if not found)

### findChord

- findChord(time, options?): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html)
- #### Parameters
	- time: number
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
	#### Returns IChord
	コード進行（見つからなければ `null` ） / Chord info (`null` if not found)

### findChorus

- findChorus(time, options?): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html)
- #### Parameters
	- time: number
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
	#### Returns IRepetitiveSegment
	サビ情報（見つからなければ `null` ） / Chorus part info (`null` if not found)

### getChords

- getChords(): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) \[\]
- #### Returns IChord\[\]
	コード進行の情報（見つからなければ空の配列） / Chord info (empty array if not found)

### getMaxVocalAmplitude

- getMaxVocalAmplitude(): number
- #### Returns number
	最大声量

### getVocalAmplitude

- getVocalAmplitude(time): number
- #### Parameters
	- time: number
	#### Returns number
	声量

### removeListener

- removeListener(listener): boolean
- #### Parameters
	- listener: any
	#### Returns boolean
	削除の成否 / Whether the listener was successfully removed or not

### requestPause

- requestPause(): boolean
- #### Returns boolean
	一時停止の成否

### requestPlay

- requestPlay(): boolean
- #### Returns boolean
	開始の成否

### requestStageUpdate

- requestStageUpdate(): Promise<number>
- #### Returns Promise<number>
	動画の現在位置 \[ms\] / Video position \[ms\]

### requestStop

- requestStop(): boolean
- #### Returns boolean
	停止の成否