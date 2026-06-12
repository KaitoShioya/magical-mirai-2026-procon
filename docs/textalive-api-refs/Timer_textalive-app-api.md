---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html"
ID:
createdAt: "2026-05-29T19:33:16+09:00"
---
## Interface Timer

**Timer**

Player の音源の再生状態を管理するクラスが実装するインタフェースです。

Classes that manage music playback for Player should implement this interface.

interface Timer {  
[isPlaying](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#isPlaying): boolean;  
[position](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#position): number;  
[wait](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#wait): number;  
[dispose](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#dispose.dispose-1) (): void;  
[initialize](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#initialize.initialize-1) (options): Promise<void>;  
[pause](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#pause.pause-1) (): void;  
[play](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#play.play-1) (): void;  
[seek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#seek.seek-1) (position): void;  
[stop](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#stop.stop-1) (): void;  
}

#### Implemented by

- [BasicTimer](https://developer.textalive.jp/packages/textalive-app-api/classes/BasicTimer.html)
- [SongleTimer](https://developer.textalive.jp/packages/textalive-app-api/classes/SongleTimer.html)

## Properties

### Readonly isPlaying

isPlaying: boolean

再生中かどうか

Whether the music source is being played or not

### Readonly position

position: number

**現在の再生位置 \[ms\]**

`Timer` 実装クラスはこの値をリアルタイムに計算して返さなくてはなりません。 他にも再生位置を返す API が以下の2種類用意されていますが、実装手法の違いにより、この API が常に最も精確な値を返します。

- [IPlayer.mediaPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaPosition) は `Timer` 実装クラスによって定期的に更新されます
- [IPlayer.videoPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#videoPosition) は Player が定期的に呼び出す [IRenderingUnit.animate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#animate) が成功してから更新されます

この API を利用するアプリでは、動画のシーク操作に対応するために [PlayerEventListener.onVideoSeekStart](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekStart) [PlayerEventListener.onVideoSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeek) [PlayerEventListener.onVideoSeekEnd](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekEnd) イベントを適切にハンドルする必要があります。

**Current playback position \[ms\]**

`Timer` implementations need to calculate this property value in real time. While there are two other APIs to retrieve the current playback position as follows, this one returns the most precise value.

- [IPlayer.mediaPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaPosition) is updated by `Timer` implementations periodically
- [IPlayer.videoPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#videoPosition) is updated by Player after the periodic call to [IRenderingUnit.animate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#animate)

Applications utilizing this API need to handle [PlayerEventListener.onVideoSeekStart](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekStart) [PlayerEventListener.onVideoSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeek) [PlayerEventListener.onVideoSeekEnd](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekEnd) events appropriately so that the applications respond to the video seeking operation.

### wait

wait: number

再生位置情報の更新間隔 \[ms\]

Interval for updating playback position \[ms\]

## Methods

### dispose

- dispose(): void
- この `Timer` を破棄する
	Dispose this `Timer` instance
	#### Returns void

### initialize

- initialize(options): Promise<void>
- `Timer` の初期化（動画データの読み込みプロセスで一度だけ呼ばれます）
	Initialize this `Timer` instance (called during the video data loading process)
	#### Parameters
	- options: [TimerInitOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimerInitOptions.html)
		初期化オプション / Options for initalization process
	#### Returns Promise<void>

### pause

- pause(): void
- 再生を一時停止する
	Pause music playback
	#### Returns void

### play

- play(): void
- 再生を開始する
	Start music playback
	#### Returns void

### seek

- seek(position): void
- 再生位置を指定する
	Seek specified position in the current music playback
	#### Parameters
	- position: number
		再生位置 \[ms\] / Media position \[ms\]
	#### Returns void

### stop

- stop(): void
- 再生を停止する（一時停止したうえで先頭に巻き戻しする）
	Stop music playback (pause and then seek the beginning)