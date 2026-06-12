---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppListener.html"
ID:
createdAt: "2026-05-29T19:30:30+09:00"
---
## Interface PlayerAppListener

interface PlayerAppListener {  
[onAppLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppListener.html#onAppLoad.onAppLoad-1)?(app, error?): void;  
[onAppMediaChange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppListener.html#onAppMediaChange.onAppMediaChange-1)?(songUrl, videoPromise?): void;  
[onAppParameterUpdate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppListener.html#onAppParameterUpdate.onAppParameterUpdate-1)?(name, value): void;  
[onAppReady](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppListener.html#onAppReady.onAppReady-1)?(app): void;  
}

## Methods

### Optional onAppLoad

- onAppLoad(app, error?): void
- TextAlive App API サーバとの接続時に呼ばれる
	#### Parameters
	- app: [IPlayerApp](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayerApp.html)
		TextAlive App API サーバに関する情報 / TextAlive app API server info
	- `Optional` error: string
		エラーメッセージ / Error message
	#### Returns void

### Optional onAppMediaChange

- onAppMediaChange(songUrl, videoPromise?): void
- リリックアプリの再生すべき楽曲URLが変更されたときに呼ばれる
	Called when a media URL to play is updated
	#### Parameters
	- songUrl: string
		楽曲URL / Song URL
	- `Optional` videoPromise: Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >
		動画オブジェクトと [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html) の準備が整ったときに解決される Promise オブジェクト / A promise to resolve after the video object and [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html) gets ready
	#### Returns void

### Optional onAppParameterUpdate

- onAppParameterUpdate(name, value): void
- リリックアプリのパラメタが更新されたときに呼ばれる
	Called when a parameter value of this lyric app is updated
	#### Parameters
	- name: string
		パラメタ名 / Parameter name
	- value: [ParameterValue](https://developer.textalive.jp/packages/textalive-app-api/types/ParameterValue.html)
		パラメタ値 / Parameter value
	#### Returns void

### Optional onAppReady

- onAppReady(app): void
- リリックアプリ ホストとの接続時に呼ばれる
	Called when connection to a lyric app host is established
	#### Parameters
	- app: [IPlayerApp](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayerApp.html)
		リリックアプリのホストに関する情報 / Lyric app host info