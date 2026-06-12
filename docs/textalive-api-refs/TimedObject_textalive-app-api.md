---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html"
ID:
createdAt: "2026-05-29T19:32:54+09:00"
---
## Interface TimedObject

時刻付きオブジェクト

Timed object

#### See

[TimedUnit](https://developer.textalive.jp/packages/textalive-app-api/classes/TimedUnit.html)

interface TimedObject {  
[endTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#endTime): number;  
[startTime](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#startTime): number;  
[contains](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#contains.contains-1) (time): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#overlaps.overlaps-1) (obj): boolean;  
[overlaps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html#overlaps.overlaps-2) (startTime, endTime): boolean;  
}

#### Implemented by

- [TimedUnit](https://developer.textalive.jp/packages/textalive-app-api/classes/TimedUnit.html)

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