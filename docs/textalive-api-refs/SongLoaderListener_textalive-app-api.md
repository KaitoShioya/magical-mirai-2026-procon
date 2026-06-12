---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongLoaderListener.html"
ID:
createdAt: "2026-05-29T19:31:58+09:00"
---
## Interface SongLoaderListener

interface SongLoaderListener {  
[onSongLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongLoaderListener.html#onSongLoad.onSongLoad-1)?(song, reason?): void;  
[onSongMapLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongLoaderListener.html#onSongMapLoad.onSongMapLoad-1)?(songMap, reason?): void;  
[onValenceArousalLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongLoaderListener.html#onValenceArousalLoad.onValenceArousalLoad-1)?(valenceArousal, reason?): void;  
[onVocalAmplitudeLoad](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongLoaderListener.html#onVocalAmplitudeLoad.onVocalAmplitudeLoad-1)?(vocalAmplitude, reason?): void;  
}

## Methods

### Optional onSongLoad

- onSongLoad(song, reason?): void
- 楽曲の基本情報が読み込まれたときに呼ばれる
	Called when song is loaded
	#### Parameters
	- song: SongleSong
		楽曲情報 / Song info
	- `Optional` reason: Error
		失敗したときの理由 / Reason for failures (if any)
	#### Returns void

### Optional onSongMapLoad

- onSongMapLoad(songMap, reason?): void
- 楽曲地図が読み込まれたときに呼ばれる
	Called when song map is loaded
	#### Parameters
	- songMap: [ISongMap](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html)
		楽曲地図 / Song map
	- `Optional` reason: Error
		失敗したときの理由 / Reason for failures (if any)
	#### Returns void

### Optional onValenceArousalLoad

- onValenceArousalLoad(valenceArousal, reason?): void
- V/A空間の情報が読み込まれたときに呼ばれる
	- 実際のV/A空間の座標情報は [ISongExplorer.getValenceArousal](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html#getValenceArousal) を使って取得してください
	Called when valence arousal info is loaded
	- To retrieve valence/arousal metrics, call [ISongExplorer.getValenceArousal](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html#getValenceArousal)
	#### Parameters
	- valenceArousal: ValenceArousal
		V/A空間の情報（未整形のデータ）
	- `Optional` reason: Error
		失敗したときの理由 / Reason for failures (if any)
	#### Returns void

### Optional onVocalAmplitudeLoad

- onVocalAmplitudeLoad(vocalAmplitude, reason?): void
- 声量の情報が読み込まれたときに呼ばれる
	- 実際の声量情報は [ISongExplorer.getVocalAmplitude](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html#getVocalAmplitude) を使って取得してください
	Called when vocal amplitude is loaded
	- To retrieve vocal amplitude information, call [ISongExplorer.getVocalAmplitude](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html#getVocalAmplitude)
	#### Parameters
	- vocalAmplitude: VocalAmplitude
		声量の情報（未整形のデータ）
	- `Optional` reason: Error
		失敗したときの理由 / Reason for failures (if any)