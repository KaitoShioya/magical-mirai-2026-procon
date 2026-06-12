---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html"
ID:
createdAt: "2026-05-29T19:28:41+09:00"
---
## Interface IVideo

動画（描画ユニット [IRenderingUnit](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html) を格納する入れ物）

Video (A container for [IRenderingUnit](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html) objects)

## Methods

### contains

- contains(time): boolean
- Returns whether this time range contains the specified time (start and end inclusive).
	#### Parameters
	- time: number
		時刻 \[ms\] / Time \[ms\]
	#### Returns boolean

### findChar

- findChar(time, options?): [IChar](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChar.html)
- 指定した再生位置の文字を取得する / Get character object in the current video
	#### Parameters
	- time: number
		position \[ms\]
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
		optional parameters for finding character
	#### Returns IChar

### findCharChange

- findCharChange(startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IChar](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChar.html) >
- 指定された時区間の文字発声情報を取得する
	Look for characters in the specified time range
	#### Parameters
	- startTime: number
	- endTime: number
	#### Returns TimedObjectsInRange<IChar>

### findIndex

- findIndex(unit): number
- 指定した描画オブジェクトのインデックスを取得する / Get index of the specified rendering unit
	#### Parameters
	- unit: [IRenderingUnit](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html)
		描画オブジェクト / Rendering unit
	#### Returns number
	インデックス / Index

### findPhrase

- findPhrase(time, options?): [IPhrase](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPhrase.html)
- 指定した再生位置のフレーズを取得する / Get phrase object in the current video
	#### Parameters
	- time: number
		position \[ms\]
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
		optional parameters for finding phrase
	#### Returns IPhrase

### findPhraseChange

- findPhraseChange(startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IPhrase](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPhrase.html) >
- 指定された時区間のフレーズ発声情報を取得する
	Look for phrases in the specified time range
	#### Parameters
	- startTime: number
	- endTime: number
	#### Returns TimedObjectsInRange<IPhrase>

### findWord

- findWord(time, options?): [IWord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IWord.html)
- 指定した再生位置の単語を取得する / Get word object in the current video
	#### Parameters
	- time: number
		position \[ms\]
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
		optional parameters for finding word
	#### Returns IWord

### findWordChange

- findWordChange(startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IWord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IWord.html) >
- 指定された時区間の単語発声情報を取得する
	Look for words in the specified time range
	#### Parameters
	- startTime: number
	- endTime: number
	#### Returns TimedObjectsInRange<IWord>

### getChar

- getChar(index): [IChar](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChar.html)
- 指定したインデックスの文字を取得する / Get character with the specified index
	#### Parameters
	- index: number
		文字のインデックス / Phrase index
	#### Returns IChar

### getPhrase

- getPhrase(index): [IPhrase](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPhrase.html)
- 指定したインデックスのフレーズを取得する / Get phrase with the specified index
	#### Parameters
	- index: number
		フレーズのインデックス / Phrase index
	#### Returns IPhrase

### getWord

- getWord(index): [IWord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IWord.html)
- 指定したインデックスの単語を取得する / Get word with the specified index
	#### Parameters
	- index: number
		単語のインデックス / Word index
	#### Returns IWord

### overlaps

- overlaps(obj): boolean
- Returns whether the specified range overlaps with this time range (start and end inclusive).
	#### Parameters
	- obj: [TimedObject](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html)
		時刻付きオブジェクト / Timed object
	#### Returns boolean
- overlaps(startTime, endTime): boolean
- Returns whether the specified range overlaps with this time range (start and end inclusive).
	#### Parameters
	- startTime: number
		開始時刻 \[ms\] / Start time \[ms\]
	- endTime: number
		終了時刻 \[ms\] / End time \[ms\]
	#### Returns boolean

### progress

- progress(time): number
- 指定された位置を `[0, 1]` にマッピングして返す
	Returns the position in \[0, 1\]
	#### Parameters
	- time: number
		位置 / Position in this video