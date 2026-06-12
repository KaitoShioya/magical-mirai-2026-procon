---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPoint.html"
ID:
createdAt: "2026-05-29T19:27:41+09:00"
---
## Interface IPoint

#### Implemented by

- [Point](https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html)

## Methods

### copy

- copy(IPoint): [IPoint](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPoint.html)
- Copies all properties from the specified point to this point.
	#### Parameters
	- IPoint: [IPoint](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPoint.html)
	#### Returns IPoint
	This point. Useful for chaining method calls.

### setValues

- setValues(x?, y?): [IPoint](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPoint.html)
- Sets the specified values on this instance.
	#### Parameters
	- `Optional` x: number
		X position.
	- `Optional` y: number
		Y position.
	#### Returns IPoint
	This instance. Useful for chaining method calls.

### toString

- toString(): string
- Returns a string representation of this object.
	#### Returns string
	a string representation of the instance.