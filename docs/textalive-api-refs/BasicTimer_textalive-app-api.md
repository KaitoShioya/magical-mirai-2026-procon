---
source: "https://developer.textalive.jp/packages/textalive-app-api/classes/BasicTimer.html"
ID:
createdAt: "2026-05-29T19:21:02+09:00"
---
## Class BasicTimer

**Basic timer**

もっともシンプルな [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html) の実装:

- 音源を再生しません
- デバッグ時などに有用です

The simplest [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html) implementation:

- No audio elements are embedded (thus no sound playback)
- Useful for debugging

#### Implements

- [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html)

## Accessors

### isPlaying

- get isPlaying(): boolean
- 再生中かどうか
	Whether the music source is being played or not
	#### Returns boolean

### position

- get position(): number
- **現在の再生位置 \[ms\]**
	`Timer` 実装クラスはこの値をリアルタイムに計算して返さなくてはなりません。 他にも再生位置を返す API が以下の2種類用意されていますが、実装手法の違いにより、この API が常に最も精確な値を返します。
	- [IPlayer.mediaPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaPosition) は `Timer` 実装クラスによって定期的に更新されます
	- [IPlayer.videoPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#videoPosition) は Player が定期的に呼び出す [IRenderingUnit.animate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#animate) が成功してから更新されます
	この API を利用するアプリでは、動画のシーク操作に対応するために [PlayerEventListener.onVideoSeekStart](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekStart) [PlayerEventListener.onVideoSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeek) [PlayerEventListener.onVideoSeekEnd](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekEnd) イベントを適切にハンドルする必要があります。
	**Current playback position \[ms\]**
	`Timer` implementations need to calculate this property value in real time. While there are two other APIs to retrieve the current playback position as follows, this one returns the most precise value.
	- [IPlayer.mediaPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaPosition) is updated by `Timer` implementations periodically
	- [IPlayer.videoPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#videoPosition) is updated by Player after the periodic call to [IRenderingUnit.animate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#animate)
	Applications utilizing this API need to handle [PlayerEventListener.onVideoSeekStart](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekStart) [PlayerEventListener.onVideoSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeek) [PlayerEventListener.onVideoSeekEnd](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoSeekEnd) events appropriately so that the applications respond to the video seeking operation.
	#### Returns number

### wait

- get wait(): number
- 再生位置情報の更新間隔 \[ms\]
	Interval for updating playback position \[ms\]
	#### Returns number
- set wait(val): void
- 再生位置情報の更新間隔 \[ms\]
	Interval for updating playback position \[ms\]
	#### Parameters
	- val: number
	#### Returns void

## Methods

### dispose

- dispose(): void
- この `Timer` を破棄する
	Dispose this `Timer` instance
	#### Returns void

### initialize

- initialize(\_\_namedParameters): Promise<void>
- `Timer` の初期化（動画データの読み込みプロセスで一度だけ呼ばれます）
	Initialize this `Timer` instance (called during the video data loading process)
	#### Parameters
	- \_\_namedParameters: [TimerInitOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimerInitOptions.html)
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

- seek(time): void
- 再生位置を指定する
	Seek specified position in the current music playback
	#### Parameters
	- time: number
		再生位置 \[ms\] / Media position \[ms\]
	#### Returns void

### stop

- stop(): void
- 再生を停止する（一時停止したうえで先頭に巻き戻しする）
	Stop music playback (pause and then seek the beginning)