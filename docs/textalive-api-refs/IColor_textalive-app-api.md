---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html"
ID:
createdAt: "2026-05-29T19:25:33+09:00"
---
## Interface IColor

色情報

Color info

interface IColor {  
[a](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#a): number;  
[argb](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#argb): string;  
[b](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#b): number;  
[cssRgb](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#cssRgb): string;  
[cssRgba](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#cssRgba): string;  
[g](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#g): number;  
[r](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#r): number;  
[rgb](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#rgb): string;  
[rgba](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#rgba): string;  
[value](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#value): number;  
[eq](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#eq.eq-1) (color): boolean;  
[from](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#from.from-1) (color): void;  
[fromNumber](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#fromNumber.fromNumber-1) (val, withAlpha?): void;  
[fromString](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#fromString.fromString-1) (color): void;  
[toString](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html#toString.toString-1) (withAlpha?): string;  
}

#### Implemented by

- [Color](https://developer.textalive.jp/packages/textalive-app-api/classes/Color.html)

## Properties

### a

a: number

透明度 / Alpha

### Readonly argb

argb: string

色情報の16進数表現 (ARGB; e.g., 0x00112233) / Hex string (ARGB; e.g., 0x00112233)

### b

b: number

青 / Blue

### Readonly cssRgb

cssRgb: string

色情報のCSS互換表現 (RGB; e.g., rgba(17,34,51)) / Color info in CSS-compatible format (RGB; e.g., rgba(17,34,51))

### Readonly cssRgba

cssRgba: string

色情報のCSS互換表現 (RGBA; e.g., rgba(17,34,51,0)) / Color info in CSS-compatible format (RGBA; e.g., rgba(17,34,51,0))

### g

g: number

緑 / Green

### r

r: number

赤 / Red

### Readonly rgb

rgb: string

色情報の16進数表現 (RGB) / Hex string (RGB)

### Readonly rgba

rgba: string

色情報の16進数表現 (RGBA; e.g., #11223300) / Hex string (RGBA; e.g., #11223300)

### value

value: number

色情報の 32 bit 表現 / Color info in 32 bit integer

## Methods

### eq

- eq(color): boolean
- #### Parameters
	- color: [IColor](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html)
		色情報 / Color
	#### Returns boolean
	色情報が一致するか否か / Whether the specified color info matches the current info

### from

- from(color): void
- 色情報をセットする
	Set color info
	#### Parameters
	- color: string | number | [IColor](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html)
		色情報 / Information source
	#### Returns void

### fromNumber

- fromNumber(val, withAlpha?): void
- 色情報をセットする
	Set color info
	#### Parameters
	- val: number
		色情報の数値表現 (32 bit ARGB または 24 bit RGB) / Information source in number (32 bit ARGB or 24 bit RGB)
	- `Optional` withAlpha: boolean
		透明度付きか否か / Whether alpha value is included or not
	#### Returns void

### fromString

- fromString(color): void
- 16進数で表された文字情報の色情報をセットする
	Set color info (Hex string RGB or RGBA e.g., #123 or #11223300)
	#### Parameters
	- color: string
		色情報の文字列表現 / Information source in string
	#### Returns void

### toString

- toString(withAlpha?): string
- 色情報の文字列表現を得る
	Retrieve string representation of this color info
	#### Parameters
	- `Optional` withAlpha: boolean
		透明度付きにするか否か / Whether to include alpha value or not