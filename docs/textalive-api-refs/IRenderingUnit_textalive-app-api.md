---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html"
ID:
createdAt: "2026-05-29T19:27:51+09:00"
---
## Interface IRenderingUnit

描画ユニット:

- TextAlive における画面描画処理の最小単位
- 種類（フレーズ、単語、文字、グラフィック）を [getType](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#getType) で取得できる
- 前後のユニットを [previous](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#previous) と [next](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#next) で取得できる
- （存在する場合）親要素と子要素の一覧をそれぞれ [parent](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#parent) と [children](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#children) で取得できる
- 開始時刻、終了時刻、その差分を [startTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#startTime) [endTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#endTime) および [duration](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#duration) で取得できる

Rendering unit:

- The base interface for all rendering unit implementations in TextAlive
- [getType](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#getType) returns the implementation type (phrase, word, character, or graphic)
- [previous](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#previous) and [next](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#next) return the previous and next unit
- [parent](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#parent) and [children](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#children) return the parent unit and the list of child units (if applicable)
- [startTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#startTime) and [endTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#endTime) return the timing information and [duration](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#duration) returns the duration i.e. `endTime` - `startTime`

#### See

[TimedObject](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html)

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