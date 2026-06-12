---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html"
ID:
createdAt: "2026-05-29T19:31:02+09:00"
---
## Interface PlayerEventListener

Player のイベント

Player events

interface PlayerEventListener {  
[onDispose](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onDispose.onDispose-1)?(): void;  
[onMediaElementSet](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onMediaElementSet.onMediaElementSet-1)?(el): void;  
[onMediaSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onMediaSeek.onMediaSeek-1)?(position): void;  
[onPause](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onPause.onPause-1)?(): void;  
[onPlay](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onPlay.onPlay-1)?(): void;  
[onSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onSeek.onSeek-1)?(position): void;  
[onSeekComplete](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onSeekComplete.onSeekComplete-1)?(position): void;  
[onStop](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onStop.onStop-1)?(): void;  
[onThrottledTimeUpdate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onThrottledTimeUpdate.onThrottledTimeUpdate-1)?(position): void;  
[onTimeUpdate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onTimeUpdate.onTimeUpdate-1)?(position): void;  
[onTimerReady](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onTimerReady.onTimerReady-1)?(timer): void;  
[onVideoReady](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoReady.onVideoReady-1)?(v): void;  
[onVideoSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeek.onVideoSeek-1)?(position): void;  
[onVideoSeekEnd](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekEnd.onVideoSeekEnd-1)?(): void;  
[onVideoSeekStart](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekStart.onVideoSeekStart-1)?(): void;  
[onVolumeUpdate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVolumeUpdate.onVolumeUpdate-1)?(volume): void;  
}

## Methods

### Optional onDispose

- onDispose(): void
- プレイヤーが破棄されるときに呼ばれる
	Called when the player is disposed
	#### Returns void

### Optional onMediaElementSet

- onMediaElementSet(el): void
- 音源メディアの配置先となるDOM要素が変更されたときに呼ばれる
	Called when the media element is updated
	#### Parameters
	- el: HTMLElement
		音源メディアの配置先となるDOM要素 / Media element
	#### Returns void

### Optional onMediaSeek

- onMediaSeek(position): void
- 楽曲の再生位置が変更されたときに呼ばれる
	Called when the media playback position is updated
	#### Parameters
	- position: number
		再生位置 \[ms\]
	#### Returns void

### Optional onPause

- onPause(): void
- 再生が一時停止されたときに呼ばれる
	Called when the playback is paused
	#### Returns void

### Optional onPlay

- onPlay(): void
- 再生が始まったときに呼ばれる
	Called when the playback starts
	#### Returns void

### Optional onSeek

- onSeek(position): void
- 楽曲の再生位置がユーザ操作によって変更されたときに呼ばれる
	Called when the media playback position is manually updated
	#### Parameters
	- position: number
		再生位置 \[ms\]
	#### Returns void

### Optional onSeekComplete

- onSeekComplete(position): void
- 楽曲の再生位置変更が完了したときに呼ばれる
	Called when the media playback position is successfully updated after [onSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onSeek)
	#### Parameters
	- position: number
		再生位置 \[ms\]
	#### Returns void

### Optional onStop

- onStop(): void
- 再生が停止されたときに呼ばれる
	Called when the playback stops
	#### Returns void

### Optional onThrottledTimeUpdate

- onThrottledTimeUpdate(position): void
- 動画の再生位置が変更されたときに呼ばれる（あまりに頻繁な発火を防ぐため一定間隔に間引かれる）
	Called when the playback position is updated (throttled)
	#### Parameters
	- position: number
		再生位置 \[ms\]
	#### Returns void

### Optional onTimeUpdate

- onTimeUpdate(position): void
- 動画の再生位置が変更されたときに呼ばれる
	Called when the playback position is updated
	#### Parameters
	- position: number
		再生位置 \[ms\]
	#### Returns void

### Optional onTimerReady

- onTimerReady(timer): void
- 動画を再生するための [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html) の準備が整ったときに呼ばれる
	Called when [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html) is ready for playback
	#### Parameters
	- timer: [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html)
		Timer オブジェクト / Timer object
	#### Returns void

### Optional onVideoReady

- onVideoReady(v): void
- 動画オブジェクトの準備が整ったときに呼ばれる
	Called when a video object is constructed
	#### Parameters
	- v: [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html)
		動画オブジェクト / Video object
	#### Returns void

### Optional onVideoSeek

- onVideoSeek(position): void
- 動画のシーク操作が行われたときに呼ばれる
	Called when the video position is updated
	#### Parameters
	- position: number
		再生位置 \[ms\]
	#### Returns void

### Optional onVideoSeekEnd

- onVideoSeekEnd(): void
- 動画のシーク操作が終わったときに呼ばれる
	Called when the seeking operation ends
	#### Returns void

### Optional onVideoSeekStart

- onVideoSeekStart(): void
- 動画のシーク操作が始まったときに呼ばれる
	Called when the seeking operation starts
	#### Returns void

### Optional onVolumeUpdate

- onVolumeUpdate(volume): void
- 音量が変更されたときに呼ばれる
	Called when the player volume is updated
	#### Parameters
	- volume: number
		音量 / Volume \[0-100\]