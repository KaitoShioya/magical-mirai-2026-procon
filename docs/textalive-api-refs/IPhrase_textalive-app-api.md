---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPhrase.html"
ID:
createdAt: "2026-05-29T19:27:09+09:00"
---
## Interface IPhrase

フレーズ / Phrase

## Properties

### animate

animate: [RenderingUnitFunction](https://developer.textalive.jp/packages/textalive-app-api/types/RenderingUnitFunction.html)

このプロパティに関数が定義されているとき、 TextAlive の通常動作（割り当て済みテンプレートの `animate` 関数を呼ぶ）はスキップされ、この関数が呼ばれる

When `animate` function is defined, TextAlive default behavior (call `animate` functions of all assigned template instances) is suppressed and this function is called instead

### Readonly duration

duration: number

描画ユニットの長さ \[ms\] / Duration of this rendering unit \[ms\]

### endTime

endTime: number

### startTime

startTime: number

### Readonly text

text: string

文字ユニットに含まれるプレーンテキスト / Plain text contained in this text unit

## Methods

### contains

- contains(time): boolean
- Returns whether this time range contains the specified time (start and end inclusive).
	#### Parameters
	- time: number
		時刻 \[ms\] / Time \[ms\]
	#### Returns boolean

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
- 指定された楽曲中の位置をこの描画ユニット中の位置 `[0, 1]` にマッピングして返す
	Returns the position in this rendering unit \[0, 1\]
	#### Parameters
	- time: number
		楽曲中の位置 / Position in a song
	#### Returns number

### toString

- toString(): string
- この描画ユニットの文字表現 / String representation of this rendering unit