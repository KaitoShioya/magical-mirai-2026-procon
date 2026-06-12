---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html"
ID:
createdAt: "2026-05-29T19:24:27+09:00"
---
## Interface FontInfo

フォント情報

Font info

interface FontInfo {  
[compactUrl](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#compactUrl)?: string;  
[en](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#en): string;  
[google](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#google)?: boolean;  
[group](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#group)?: string;  
[ja](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#ja)?: string;  
[key](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#key): string;  
[typesquare](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#typesquare)?: boolean;  
[url](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html#url)?: string;  
}

## Properties

### Optional compactUrl

compactUrl?: string

CSSのURL (頻出文字のみを抽出したサブセット)

URL of the CSS file (Subset fonts for frequently-used chars)

### en

en: string

英語フォントファミリー名

English font family name

### Optional google

google?: boolean

Google Fonts フォントか否か

Whether this font is provided by Google Fonts or not

### Optional group

group?: string

フォントのグループ名

Optional font group name

### Optional ja

ja?: string

日本語フォントファミリー名

Japanese font family name

### key

key: string

フォントのキー (文字列ID)

Font key (string ID)

### Optional typesquare

typesquare?: boolean

モリサワ TypeSquare フォントか否か

Whether this font is provided by Morisawa TypeSquare or not

### Optional url

url?: string

CSSのURL

URL of the CSS file