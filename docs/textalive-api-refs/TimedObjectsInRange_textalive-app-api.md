---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html"
ID:
createdAt: "2026-05-29T19:33:04+09:00"
---
## Interface TimedObjectsInRange<T>

時区間駆動型APIの問い合わせ結果 / Query results for time-range-driven API

#### Type Parameters

- T extends [TimedObject](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html)

## Properties

### current

current: [T](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html#T)

指定区間の終了時にかぶっているオブジェクト / Timed object overlapping with the end time of the specified time range

### entered

entered: [T](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html#T) \[\]

指定区間内で開始したオブジェクト / Timed objects that started within the specified time range

### left

left: [T](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html#T) \[\]

指定区間内で終了したオブジェクト / Timed objects that ended within the specified time range

### next

next: [T](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html#T)

指定区間の直前にあるオブジェクト / The first timed object after the specified time range

### previous

previous: [T](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html#T)

指定区間の直前にあるオブジェクト / The last timed object before the specified time range