---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontLoaderListener.html"
ID:
createdAt: "2026-05-29T19:24:40+09:00"
---
## Interface FontLoaderListener

interface FontLoaderListener {  
[onFontsLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontLoaderListener.html#onFontsLoad.onFontsLoad-1)?(fonts, reason?): void;  
}

##### Index

### Methods

[onFontsLoad?](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontLoaderListener.html#onFontsLoad)

## Methods

### Optional onFontsLoad

- onFontsLoad(fonts, reason?): void
- フォントが読み込まれたときに呼ばれる
	Called when fonts are loaded
	#### Parameters
	- fonts: [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html) \[\]
		読み込まれたフォントの一覧
	- `Optional` reason: [FontLoadingError](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontLoadingError.html)
		失敗したときの理由 / Reason for failures (if any)