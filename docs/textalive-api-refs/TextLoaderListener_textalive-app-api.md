---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/TextLoaderListener.html"
ID:
createdAt: "2026-05-29T19:32:43+09:00"
---
## Interface TextLoaderListener

interface TextLoaderListener {  
[onLyricsLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TextLoaderListener.html#onLyricsLoad.onLyricsLoad-1)?(lyrics, reason?): void;  
[onTextLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TextLoaderListener.html#onTextLoad.onTextLoad-1)?(lyricsBody, reason?): void;  
}

##### Index

### Methods

[onLyricsLoad?](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TextLoaderListener.html#onLyricsLoad) [onTextLoad?](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TextLoaderListener.html#onTextLoad)

## Methods

### Optional onLyricsLoad

- onLyricsLoad(lyrics, reason?): void
- 歌詞テキストの発声タイミング情報が読み込まれたときに呼ばれる
	Called when lyrics timing information is loaded
	#### Parameters
	- lyrics: [LyricsInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html)
		発声タイミングの情報 / Lyrics timing info
	- `Optional` reason: Error
		失敗したときの理由 / Reason for failures (if any)
	#### Returns void

### Optional onTextLoad

- onTextLoad(lyricsBody, reason?): void
- 歌詞テキストが読み込まれたときに呼ばれる
	Called when lyrics text is loaded
	#### Parameters
	- lyricsBody: [LyricsBody](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsBody.html)
		歌詞テキスト
	- `Optional` reason: Error
		失敗したときの理由 / Reason for failures (if any)