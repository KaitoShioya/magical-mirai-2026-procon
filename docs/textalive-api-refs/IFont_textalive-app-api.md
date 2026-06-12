---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IFont.html"
ID:
createdAt: "2026-05-29T19:25:56+09:00"
---
## Interface IFont

フォント情報

Font info

## Properties

### Readonly family

family: string

フォントファミリー / Font family

### Readonly size

size: number

フォントサイズ / Font size

### Readonly style

style: string

フォントのスタイル / Font style

## Methods

### deriveFamily

- deriveFamily(family): [IFont](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IFont.html)
- フォントファミリーだけ変更したフォント情報を生成する
	Derive font info with the specified font family
	#### Parameters
	- family: string
		フォントファミリー / Font family
	#### Returns IFont

### deriveSize

- deriveSize(size): [IFont](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IFont.html)
- フォントサイズだけ変更したフォント情報を生成する
	Derive font info with the specified font size
	#### Parameters
	- size: number
		フォントサイズ / Font size
	#### Returns IFont

### deriveStyle

- deriveStyle(style): [IFont](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IFont.html)
- フォントのスタイルだけ変更したフォント情報を生成する
	Derive font info with the specified font style
	#### Parameters
	- style: string
		フォントのスタイル / Font style
	#### Returns IFont

### eq

- eq(font): boolean
- #### Parameters
	- font: [IFont](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IFont.html)
		フォント情報 / Font
	#### Returns boolean
	フォント情報が一致するか否か / Whether the specified font info matches the current info

### toString

- toString(scaleFactor?): string
- #### Parameters
	- `Optional` scaleFactor: number
		Scale factor to multiply the size info \[px\]
	#### Returns string
	フォント情報のCSS用文字列表現 / CSS text that represents this font info