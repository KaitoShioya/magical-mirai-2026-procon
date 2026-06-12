---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html"
ID:
createdAt: "2026-05-29T19:26:59+09:00"
---
interface IMatrix2D {  
[a](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#a): number;  
[b](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#b): number;  
[c](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#c): number;  
[d](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#d): number;  
[tx](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#tx): number;  
[ty](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#ty): number;  
[append](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#append.append-1) (a, b, c, d, tx, ty): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[appendMatrix](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#appendMatrix.appendMatrix-1) (matrix): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[appendTransform](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#appendTransform.appendTransform-1) (x, y, scaleX, scaleY, rotation, skewX, skewY, regX?, regY?): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[clone](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#clone.clone-1) (): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[copy](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#copy.copy-1) (matrix): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[decompose](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#decompose.decompose-1) (target?): [DecomposedProps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/DecomposedProps.html);  
[equals](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#equals.equals-1) (matrix): boolean;  
[identity](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#identity.identity-1) (): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[invert](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#invert.invert-1) (): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[isIdentity](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#isIdentity.isIdentity-1) (): boolean;  
[prepend](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#prepend.prepend-1) (a, b, c, d, tx, ty): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[prependMatrix](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#prependMatrix.prependMatrix-1) (matrix): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[prependTransform](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#prependTransform.prependTransform-1) (x, y, scaleX, scaleY, rotation, skewX, skewY, regX?, regY?): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[rotate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#rotate.rotate-1) (angle): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[scale](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#scale.scale-1) (x, y): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[setValues](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#setValues.setValues-1) (a?, b?, c?, d?, tx?, ty?): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[skew](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#skew.skew-1) (skewX, skewY): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
[toString](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#toString.toString-1) (): string;  
[transformPoint](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#transformPoint.transformPoint-1) (x, y, pt?): [IPoint](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPoint.html);  
[translate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html#translate.translate-1) (x, y): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html);  
}

#### Implemented by

- [Matrix2D](https://developer.textalive.jp/packages/textalive-app-api/classes/Matrix2D.html)

## Methods

### append

- append(a, b, c, d, tx, ty): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
- #### Parameters
	- a: number
	- b: number
	- c: number
	- d: number
	- tx: number
	- ty: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### appendTransform

- appendTransform(x, y, scaleX, scaleY, rotation, skewX, skewY, regX?, regY?): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
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
	- `Optional` regX: number
	- `Optional` regY: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### decompose

- decompose(target?): [DecomposedProps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/DecomposedProps.html)
- #### Parameters
	- `Optional` target: [DecomposedProps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/DecomposedProps.html)
	#### Returns DecomposedProps
	The target, or a new generic object with the transform properties applied.

### prepend

- prepend(a, b, c, d, tx, ty): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
- #### Parameters
	- a: number
	- b: number
	- c: number
	- d: number
	- tx: number
	- ty: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### prependMatrix

- prependMatrix(matrix): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
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
	- matrix: [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### prependTransform

- prependTransform(x, y, scaleX, scaleY, rotation, skewX, skewY, regX?, regY?): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
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
	- `Optional` regX: number
	- `Optional` regY: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### rotate

- rotate(angle): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
- #### Parameters
	- angle: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### scale

- scale(x, y): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
- #### Parameters
	- x: number
	- y: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### setValues

- setValues(a?, b?, c?, d?, tx?, ty?): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
- #### Parameters
	- `Optional` a: number
	- `Optional` b: number
	- `Optional` c: number
	- `Optional` d: number
	- `Optional` tx: number
	- `Optional` ty: number
	#### Returns IMatrix2D
	This instance. Useful for chaining method calls.

### skew

- skew(skewX, skewY): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
- #### Parameters
	- skewX: number
	- skewY: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.

### toString

- toString(): string
- #### Returns string
	a string representation of the instance.

### transformPoint

- transformPoint(x, y, pt?): [IPoint](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPoint.html)
- #### Parameters
	- x: number
	- y: number
	- `Optional` pt: any
	#### Returns IPoint
	This matrix. Useful for chaining method calls.

### translate

- translate(x, y): [IMatrix2D](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IMatrix2D.html)
- #### Parameters
	- x: number
	- y: number
	#### Returns IMatrix2D
	This matrix. Useful for chaining method calls.