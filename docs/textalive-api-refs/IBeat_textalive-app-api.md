---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html"
ID:
createdAt: "2026-05-29T19:25:00+09:00"
---
## Interface IBeat

ビート情報 / Beat info

interface IBeat {  
[duration](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#duration): number;  
[endTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#endTime): number;  
[index](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#index): number;  
[length](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#length): number;  
[next](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#next): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html);  
[position](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#position): number;  
[previous](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#previous): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html);  
[startTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#startTime): number;  
[contains](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#contains.contains-1) (time): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#overlaps.overlaps-1) (obj): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#overlaps.overlaps-2) (startTime, endTime): boolean;  
[progress](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html#progress.progress-1) (time): number;  
}

## Properties

### Readonly duration

duration: number

ビート間隔 \[ms\] / Duration \[ms\]

### Readonly endTime

endTime: number

#### Inherit Doc

### index

index: number

楽曲中のビート位置 / Index of this beat in the song

### length

length: number

小節中のビート数 / Number of beats in a bar

### next

next: [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html)

次のビート / Next beat

### position

position: number

小節中のビート位置 / Index in the bar

### previous

previous: [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html)

前のビート / Previous beat

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
- 指定された楽曲中の位置をこのビート中の位置 `[0, 1]` にマッピングして返す
	Returns the position in this beat \[0, 1\]
	#### Parameters
	- time: number
		楽曲中の位置 / Position in a song