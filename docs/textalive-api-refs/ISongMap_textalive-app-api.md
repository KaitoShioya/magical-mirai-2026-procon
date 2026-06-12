---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html"
ID:
createdAt: "2026-05-29T19:28:21+09:00"
---
## Interface ISongMap

音楽地図の情報

Song map info

interface ISongMap {  
[beats](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html#beats): [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html) \[\];  
[chords](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html#chords): [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) \[\];  
[revisions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html#revisions): {  
beatId?: number;  
chordId?: number;  
repetitiveSegmentId?: number;  
};  
[segments](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html#segments): [IRepetitiveSegments](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegments.html) \[\];  
}

## Properties

### Readonly beats

beats: [IBeat](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IBeat.html) \[\]

ビート

Beat

### Readonly chords

chords: [IChord](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChord.html) \[\]

コード進行

Chord

### revisions

revisions: {  
beatId?: number;  
chordId?: number;  
repetitiveSegmentId?: number;  
}

音楽地図のリビジョンID

#### Type declaration

- ##### Optional beatId?: number
	ビート情報のリビジョンID / Beat info revision ID
- ##### Optional chordId?: number
	コード進行の情報のリビジョンID / Chord info revision ID
- ##### Optional repetitiveSegmentId?: number
	サビなどの繰り返し区間のリビジョンID / Repetitive segment revision ID

### Readonly segments

segments: [IRepetitiveSegments](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegments.html) \[\]

繰り返し区間

Repetitive segments