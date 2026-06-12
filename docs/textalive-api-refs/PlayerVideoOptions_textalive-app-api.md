---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html"
ID:
createdAt: "2026-05-29T19:31:36+09:00"
---
## Interface PlayerVideoOptions

TextAliveの動画オブジェクトを構築するためのオプション

Optional data to build the video object

interface PlayerVideoOptions {  
[altLyricsUrl](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html#altLyricsUrl)?: string;  
[video](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html#video)?: [PartialVideoEntry](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html);  
}

##### Index

### Properties

[altLyricsUrl?](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html#altLyricsUrl) [video?](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html#video)

## Properties

### Optional altLyricsUrl

altLyricsUrl?: string

歌詞テキストの読み込み元

Source URL of lyrics text

### Optional video

video?: [PartialVideoEntry](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html)

動画データ

Video data