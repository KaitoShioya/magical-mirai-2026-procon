---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IFontLoader.html"
ID:
createdAt: "2026-05-29T19:26:46+09:00"
---
## Interface IFontLoader

## Properties

### Readonly failed

failed: [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html) \[\]

読み込みに失敗したフォントの一覧 / List of fonts failed to load

### Readonly loaded

loaded: [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html) \[\]

読み込まれたフォントの一覧 / List of fonts succeeded to load

## Methods

### isLoading

- isLoading(): boolean
- 読み込みプロセスの有無 / Whether fonts are currently loaded or not
	#### Returns boolean

### load

- load(fonts): Promise< [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html) \[\]>
- フォントを読み込む
	Load fonts
	#### Parameters
	- fonts: (string | [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html))\[\]
		フォント名の一覧 / List of font family names
	#### Returns Promise<FontInfo\[\]>
	読み込めたフォントの一覧 / List of fonts suceeded to load

### loadAll

- loadAll(): Promise< [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html) \[\]>
- 利用可能なすべてのフォントを読み込む
	Load all available fonts
	#### Returns Promise<FontInfo\[\]>
	読み込めたフォントの一覧 / List of fonts suceeded to load