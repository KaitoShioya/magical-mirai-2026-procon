---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html"
ID:
createdAt: "2026-05-29T19:27:22+09:00"
---
interface IPlayer {  
[app](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#app): [IPlayerApp](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayerApp.html);  
[banner](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#banner): IPlayerBanner;  
[data](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#data): [IDataLoader](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html);  
[fps](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#fps): number;  
[isLoading](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#isLoading): boolean;  
[isPlaying](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#isPlaying): boolean;  
[isVideoSeeking](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#isVideoSeeking): boolean;  
[mediaBannerElement](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaBannerElement): HTMLElement;  
[mediaElement](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaElement): HTMLElement;  
[mediaPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaPosition): number;  
[mediaSourceElement](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaSourceElement): HTMLElement;  
[options](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#options): [PlayerOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html);  
[timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#timer): [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html);  
[video](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#video): [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html);  
[videoPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#videoPosition): number;  
[volume](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#volume): number;  
[wait](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#wait): number;  
[addListener](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#addListener.addListener-1) (listener): void;  
[createFromJSON](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromJSON.createFromJSON-1) (json, options?): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >;  
[createFromSongPath](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromSongPath.createFromSongPath-1) (songPath, options?): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >;  
[createFromSongUrl](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromSongUrl.createFromSongUrl-1) (songUrl, options?): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >;  
[createFromText](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromText.createFromText-1) (text, options?): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >;  
[dispose](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#dispose.dispose-1) (): void;  
[endVideoSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#endVideoSeek.endVideoSeek-1) (): void;  
[findBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#findBeat.findBeat-1) (time, options?): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html);  
[findBeatChange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#findBeatChange.findBeatChange-1) (startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html) >;  
[findChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#findChord.findChord-1) (time, options?): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html);  
[findChordChange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#findChordChange.findChordChange-1) (startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) >;  
[findChorus](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#findChorus.findChorus-1) (time, options?): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html);  
[findChorusBetween](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#findChorusBetween.findChorusBetween-1) (startTime, endTime): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html);  
[findChorusChange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#findChorusChange.findChorusChange-1) (startTime, endTime): [TimedObjectsInRange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObjectsInRange.html) < [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html) >;  
[getBeats](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#getBeats.getBeats-1) (): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html) \[\];  
[getChords](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#getChords.getChords-1) (): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) \[\];  
[getChoruses](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#getChoruses.getChoruses-1) (): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html) \[\];  
[getMaxVocalAmplitude](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#getMaxVocalAmplitude.getMaxVocalAmplitude-1) (): number;  
[getMedianValenceArousal](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#getMedianValenceArousal.getMedianValenceArousal-1) (): [ValenceArousalValue](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html);  
[getValenceArousal](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#getValenceArousal.getValenceArousal-1) (time): [ValenceArousalValue](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html);  
[getVocalAmplitude](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#getVocalAmplitude.getVocalAmplitude-1) (time): number;  
[removeListener](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#removeListener.removeListener-1) (listener): boolean;  
[requestMediaSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#requestMediaSeek.requestMediaSeek-1) (position): boolean;  
[requestPause](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#requestPause.requestPause-1) (): boolean;  
[requestPlay](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#requestPlay.requestPlay-1) (): boolean;  
[requestStageUpdate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#requestStageUpdate.requestStageUpdate-1) (): Promise<number>;  
[requestStop](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#requestStop.requestStop-1) (): boolean;  
[setVideoPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#setVideoPosition.setVideoPosition-1) (position): Promise<number>;  
[startVideoSeek](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#startVideoSeek.startVideoSeek-1) (): void;  
}

#### Implemented by

- [Player](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html)

## Methods

### createFromSongPath

- createFromSongPath(songPath, options?): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >
- #### Parameters
	- songPath: string
	- `Optional` options: [PlayerVideoOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html)
	#### Returns Promise<IVideo>
	動画オブジェクト / Video object

### createFromSongUrl

- createFromSongUrl(songUrl, options?): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >
- #### Parameters
	- songUrl: string
	- `Optional` options: [PlayerVideoOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html)
	#### Returns Promise<IVideo>
	動画オブジェクト / Video object

### createFromText

- createFromText(text, options?): Promise< [IVideo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) >
- #### Parameters
	- text: string
	- `Optional` options: [PlayerVideoOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html)
	#### Returns Promise<IVideo>
	動画オブジェクト / Video object

### findBeat

- findBeat(time, options?): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html)
- #### Parameters
	- time: number
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
	#### Returns IBeat
	ビート情報（見つからなければ `null` ） / Beat info (`null` if not found)

### findChord

- findChord(time, options?): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html)
- #### Parameters
	- time: number
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
	#### Returns IChord
	コード進行（見つからなければ `null` ） / Chord info (`null` if not found)

### findChorus

- findChorus(time, options?): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html)
- #### Parameters
	- time: number
	- `Optional` options: [FindTimedObjectOptions](https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html)
	#### Returns IRepetitiveSegment
	サビ情報（見つからなければ `null` ） / Chorus part info (`null` if not found)

### getChords

- getChords(): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) \[\]
- #### Returns IChord\[\]
	コード進行の情報（見つからなければ空の配列） / Chord info (empty array if not found)

### getMaxVocalAmplitude

- getMaxVocalAmplitude(): number
- #### Returns number
	最大声量

### getVocalAmplitude

- getVocalAmplitude(time): number
- #### Parameters
	- time: number
	#### Returns number
	声量

### removeListener

- removeListener(listener): boolean
- #### Parameters
	- listener: any
	#### Returns boolean
	削除の成否 / Whether the listener was successfully removed or not

### requestPause

- requestPause(): boolean
- #### Returns boolean
	一時停止の成否

### requestPlay

- requestPlay(): boolean
- #### Returns boolean
	開始の成否

### requestStageUpdate

- requestStageUpdate(): Promise<number>
- #### Returns Promise<number>
	動画の現在位置 \[ms\] / Video position \[ms\]

### requestStop

- requestStop(): boolean
- #### Returns boolean
	停止の成否