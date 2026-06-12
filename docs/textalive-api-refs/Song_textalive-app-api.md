---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html"
ID:
createdAt: "2026-05-29T19:31:47+09:00"
---
## Interface Song

楽曲のメタ情報

interface Song {  
[artist](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html#artist): {  
name: string;  
};  
[code](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html#code): string;  
[created\_at](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html#created_at): string;  
[length](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html#length): number;  
[name](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html#name-1): string;  
[permalink](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html#permalink): string;  
[updated\_at](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html#updated_at): string;  
}

## Properties

### artist

artist: {  
name: string;  
}

アーティスト情報

Artist info

#### Type declaration

- ##### name: string
	アーティスト名

### code

code: string

楽曲コード (ID)

Unique string ID

### created\_at

created\_at: string

作成日時

Created date

### length

length: number

楽曲の再生時間長 \[s\]

- この値は低精度です
- 演出に利用する値は必ず Player インスタンスから取得してください

Song duration \[s\]

### name

name: string

楽曲タイトル

Song title

### permalink

permalink: string

楽曲のパーマリンクURL

Permalink URL

### updated\_at

updated\_at: string

更新日時

Updated date