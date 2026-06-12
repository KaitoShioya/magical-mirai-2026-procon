---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html"
ID:
createdAt: "2026-05-29T19:29:09+09:00"
---
## Interface LyricsInfo

歌詞発声タイミングの推定結果

Results of lyrics timing estimation

interface LyricsInfo {  
[diff](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html#diff): {  
id: number;  
};  
[failed](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html#failed)?: boolean;  
[id](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html#id-1): number;  
[processing](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html#processing)?: boolean;  
[url](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsInfo.html#url): string;  
}

## Properties

### diff

diff: {  
id: number;  
}

歌詞発声タイミングの訂正情報

Lyrics diff info

#### Type declaration

- ##### id: number

### Optional failed

failed?: boolean

Songle での推定が失敗したか否か

Songle analysis failure status

### id

id: number

歌詞発声タイミングのID

### Optional processing

processing?: boolean

Songle で推定中か否か

Songle analysis processing status

### url

url: string

歌詞URL

Lyrics url