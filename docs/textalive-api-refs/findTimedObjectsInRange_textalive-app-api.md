---
source: "https://developer.textalive.jp/packages/textalive-app-api/functions/findTimedObjectsInRange.html"
ID:
createdAt: "2026-05-29T19:37:46+09:00"
---
- findTimedObjectsInRange< [T](https://developer.textalive.jp/packages/textalive-app-api/functions/findTimedObjectsInRange.html#findTimedObjectsInRange.T) >(sortedArray, startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [T](https://developer.textalive.jp/packages/textalive-app-api/functions/findTimedObjectsInRange.html#findTimedObjectsInRange.T) >
- #### Type Parameters
	- T extends [TimedObject](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html)
	#### Parameters
	- sortedArray: [T](https://developer.textalive.jp/packages/textalive-app-api/functions/findTimedObjectsInRange.html#findTimedObjectsInRange.T) \[\]
	- startTime: number
	- endTime: number
	#### Returns TimedObjectsInRange<T>
	指定された時区間に存在するオブジェクトを返す / Returns the objects in the specified time range