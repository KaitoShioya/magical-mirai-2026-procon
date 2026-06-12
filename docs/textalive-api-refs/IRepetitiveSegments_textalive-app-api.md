---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegments.html"
ID:
createdAt: "2026-05-29T19:28:11+09:00"
---
## Interface IRepetitiveSegments

全繰り返し区間の情報 / Information of all repetitive segments

interface IRepetitiveSegments {  
[chorus](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegments.html#chorus): boolean;  
[duration](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegments.html#duration): number;  
[segments](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegments.html#segments): [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html) \[\];  
}

## Properties

### chorus

chorus: boolean

サビかどうか / Whether this repetitive segment info is chorus part or not

### duration

duration: number

繰り返し区間の継続時間 / Duration

### segments

segments: [IRepetitiveSegment](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRepetitiveSegment.html) \[\]

繰り返し区間の配列 / Array of repetitive segments