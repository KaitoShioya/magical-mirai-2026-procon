---
source: "https://developer.textalive.jp/packages/textalive-app-api/classes/Color.html"
ID:
createdAt: "2026-05-29T19:22:26+09:00"
---
## Class Color

**Color**

色情報 / Color info

#### Implements

- [IColor](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html)

## Properties

### a

a: number

透明度 / Alpha

### b

b: number

青 / Blue

### g

g: number

緑 / Green

### r

r: number

赤 / Red

## Accessors

### argb

- get argb(): string
- 色情報の16進数表現 (ARGB; e.g., 0x00112233) / Hex string (ARGB; e.g., 0x00112233)
	#### Returns string

### cssRgb

- get cssRgb(): string
- 色情報のCSS互換表現 (RGB; e.g., rgba(17,34,51)) / Color info in CSS-compatible format (RGB; e.g., rgba(17,34,51))
	#### Returns string

### cssRgba

- get cssRgba(): string
- 色情報のCSS互換表現 (RGBA; e.g., rgba(17,34,51,0)) / Color info in CSS-compatible format (RGBA; e.g., rgba(17,34,51,0))
	#### Returns string

### hexA

- get hexA(): string
- #### Returns string

### hexRgb

- get hexRgb(): string
- #### Returns string

### rgb

- get rgb(): string
- 色情報の16進数表現 (RGB) / Hex string (RGB)
	#### Returns string

### rgba

- get rgba(): string
- 色情報の16進数表現 (RGBA; e.g., #11223300) / Hex string (RGBA; e.g., #11223300)
	#### Returns string

### value

- get value(): number
- 色情報の 32 bit 表現 / Color info in 32 bit integer
	#### Returns number
- set value(val): void
- 色情報の 32 bit 表現 / Color info in 32 bit integer
	#### Parameters
	- val: number
	#### Returns void

### valueArgb

- get valueArgb(): number
- #### Returns number

### valueRgb

- get valueRgb(): number
- #### Returns number

## Methods

### eq

- eq(color): boolean
- #### Parameters
	- color: [Color](https://developer.textalive.jp/packages/textalive-app-api/classes/Color.html)
		色情報 / Color
	#### Returns boolean
	色情報が一致するか否か / Whether the specified color info matches the current info

### from

- from(color?): void
- 色情報をセットする
	Set color info
	#### Parameters
	- `Optional` color: string | number | [IColor](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IColor.html)
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