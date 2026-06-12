---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/VideoDuplicateLoadingError.html"
ID:
createdAt: "2026-05-29T19:34:22+09:00"
---
- [textalive-app-api](https://developer.textalive.jp/packages/textalive-app-api/modules.html)
- [VideoDuplicateLoadingError](https://developer.textalive.jp/packages/textalive-app-api/interfaces/VideoDuplicateLoadingError.html)

## Interface VideoDuplicateLoadingError

interface VideoDuplicateLoadingError {  
[video](https://developer.textalive.jp/packages/textalive-app-api/interfaces/VideoDuplicateLoadingError.html#video): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >;  
}

#### Hierarchy

- Error
	- VideoDuplicateLoadingError

##### Index

### Properties

[video](https://developer.textalive.jp/packages/textalive-app-api/interfaces/VideoDuplicateLoadingError.html#video)

## Properties

### video

video: Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >

読み込み中の動画を返すPromise / Promise that returns the video currently being loaded