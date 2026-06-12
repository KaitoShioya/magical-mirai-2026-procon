---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html"
ID:
createdAt: "2026-05-29T19:25:23+09:00"
---
## Interface IChord

コード進行の情報 / Chord info

interface IChord {  
[duration](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#duration): number;  
[endTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#endTime): number;  
[index](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#index): number;  
[name](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#name): string;  
[next](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#next): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html);  
[previous](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#previous): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html);  
[startTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#startTime): number;  
[contains](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#contains.contains-1) (time): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#overlaps.overlaps-1) (obj): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#overlaps.overlaps-2) (startTime, endTime): boolean;  
[progress](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html#progress.progress-1) (time): number;  
}

## Properties

### Readonly duration

duration: number

コード進行の継続時間 \[ms\] / Duration \[ms\]

### endTime

endTime: number

### index

index: number

楽曲中のコード進行位置 / Index of this chord in the song

### name

name: string

コード進行 / Chord

### next

next: [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html)

次のコード / Next chord

### previous

previous: [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html)

前のコード / Previous chord

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
- 指定された楽曲中の位置をこのコード進行中の位置 `[0, 1]` にマッピングして返す
	Returns the position in this chord \[0, 1\]
	#### Parameters
	- time: number
		楽曲中の位置 / Position in a song