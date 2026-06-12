---
source: "https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html"
ID:
createdAt: "2026-05-29T19:23:20+09:00"
---
## Class Point

**Point**

Represents a point on a 2 dimensional x / y coordinate system.

---

Visit [http://createjs.com/](http://createjs.com/) for documentation, updates and examples.

Copyright (c) 2017 gskinner.com, inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

#### Implements

- [IPoint](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPoint.html)

## Constructors

### constructor

- new Point(x?, y?): [Point](https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html)
- #### Parameters
	- `Optional` x: number
		X position.
	- `Optional` y: number
		Y position.
	#### Returns Point

## Methods

### copy

- copy(point): [Point](https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html)
- Copies all properties from the specified point to this point.
	#### Parameters
	- point: [Point](https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html)
	#### Returns Point
	This point. Useful for chaining method calls.

### setValues

- setValues(x?, y?): [Point](https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html)
- Sets the specified values on this instance.
	#### Parameters
	- `Optional` x: number
		X position.
	- `Optional` y: number
		Y position.
	#### Returns Point
	This instance. Useful for chaining method calls.

### toString

- toString(): string
- Returns a string representation of this object.
	#### Returns string
	a string representation of the instance.