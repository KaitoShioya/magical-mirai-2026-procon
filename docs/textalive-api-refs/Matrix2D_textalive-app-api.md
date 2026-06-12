---
source: "https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html"
ID:
createdAt: "2026-05-29T19:22:53+09:00"
---
**Matrix2D**

Represents an affine transformation matrix, and provides tools for constructing and concatenating matrices.

This matrix can be visualized as:

```
[ a  c  tx
  b  d  ty
  0  0  1  ]
```

Note the locations of b and c.

---

Visit [http://createjs.com/](http://createjs.com/) for documentation, updates and examples.

Copyright (c) 2017 gskinner.com, inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

#### Implements

- [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)

## Constructors

### constructor

- new Matrix2D(a?, b?, c?, d?, tx?, ty?): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- `Optional` a: number
	- `Optional` b: number
	- `Optional` c: number
	- `Optional` d: number
	- `Optional` tx: number
	- `Optional` ty: number
	#### Returns Matrix2D

## Methods

### append

- append(a, b, c, d, tx, ty): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- a: number
	- b: number
	- c: number
	- d: number
	- tx: number
	- ty: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### appendTransform

- appendTransform(x, y, scaleX, scaleY, rotation, skewX, skewY, regX, regY): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- Generates matrix properties from the specified display object transform properties, and appends them to this matrix. For example, you can use this to generate a matrix representing the transformations of a display object:
	```
	var mtx = new createjs.Matrix2D();
	mtx.appendTransform(o.x, o.y, o.scaleX, o.scaleY, o.rotation);
	```
	#### Parameters
	- x: number
	- y: number
	- scaleX: number
	- scaleY: number
	- rotation: number
	- skewX: number
	- skewY: number
	- regX: number
	- regY: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### decompose

- decompose(target?): [DecomposedProps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/DecomposedProps.html)
- #### Parameters
	- `Optional` target: [DecomposedProps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/DecomposedProps.html)
	#### Returns DecomposedProps
	The target, or a new generic object with the transform properties applied.

### prepend

- prepend(a, b, c, d, tx, ty): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- a: number
	- b: number
	- c: number
	- d: number
	- tx: number
	- ty: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### prependMatrix

- prependMatrix(matrix): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- Prepends the specified matrix to this matrix. This is the equivalent of multiplying `(specified matrix) * (this matrix)`. For example, you could calculate the combined transformation for a child object using:
	```
	var o = myDisplayObject;
	var mtx = o.getMatrix();
	while (o = o.parent) {
	    // prepend each parent's transformation in turn:
	    o.prependMatrix(o.getMatrix());
	}
	```
	#### Parameters
	- matrix: [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### prependTransform

- prependTransform(x, y, scaleX, scaleY, rotation, skewX, skewY, regX, regY): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- Generates matrix properties from the specified display object transform properties, and prepends them to this matrix. For example, you could calculate the combined transformation for a child object using:
	```
	var o = myDisplayObject;
	var mtx = new createjs.Matrix2D();
	do  {
	    // prepend each parent's transformation in turn:
	    mtx.prependTransform(o.x, o.y, o.scaleX, o.scaleY, o.rotation, o.skewX, o.skewY, o.regX, o.regY);
	} while (o = o.parent);
	```
	#### Parameters
	- x: number
	- y: number
	- scaleX: number
	- scaleY: number
	- rotation: number
	- skewX: number
	- skewY: number
	- regX: number
	- regY: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### rotate

- rotate(angle): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- angle: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### scale

- scale(x, y): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- x: number
	- y: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### setValues

- setValues(a?, b?, c?, d?, tx?, ty?): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- `Optional` a: number
	- `Optional` b: number
	- `Optional` c: number
	- `Optional` d: number
	- `Optional` tx: number
	- `Optional` ty: number
	#### Returns Matrix2D
	This instance. Useful for chaining method calls.

### skew

- skew(skewX, skewY): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- skewX: number
	- skewY: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.

### toString

- toString(): string
- #### Returns string
	a string representation of the instance.

### transformPoint

- transformPoint(x, y, pt): [Point](https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html)
- #### Parameters
	- x: number
	- y: number
	- pt: [Point](https://developer.textalive.jp/packages/textalive-app-api/classes/Point.html)
	#### Returns Point
	This matrix. Useful for chaining method calls.

### translate

- translate(x, y): [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)
- #### Parameters
	- x: number
	- y: number
	#### Returns Matrix2D
	This matrix. Useful for chaining method calls.