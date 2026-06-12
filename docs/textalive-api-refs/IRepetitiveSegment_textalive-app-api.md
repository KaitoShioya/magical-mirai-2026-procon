---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html"
ID:
createdAt: "2026-05-29T19:28:00+09:00"
---
## Interface IRepetitiveSegment

サビなどの繰り返し区間の情報 / Repetitive segment info (e.g., chorus segment)

interface IRepetitiveSegment {  
[duration](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#duration): number;  
[endTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#endTime): number;  
[index](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#index): number;  
[next](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#next): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html);  
[previous](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#previous): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html);  
[startTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#startTime): number;  
[contains](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#contains.contains-1) (time): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#overlaps.overlaps-1) (obj): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#overlaps.overlaps-2) (startTime, endTime): boolean;  
[progress](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html#progress.progress-1) (time): number;  
}

## Properties

### Readonly duration

duration: number

繰り返し区間の継続時間 \[ms\] / Duration \[ms\]

### endTime

endTime: number

### index

index: number

楽曲中の繰り返し区間の位置 / Index of this repetitive segment in the song

### next

next: [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html)

次の繰り返し区間 / Next repetitive segment

### previous

previous: [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html)

前の繰り返し区間 / Previous repetitive segment

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
- 指定された楽曲中の位置をこの繰り返し区間中の位置 `[0, 1]` にマッピングして返す
	Returns the position in this repetitive segment \[0, 1\]
	#### Parameters
	- time: number
		楽曲中の位置 / Position in a song