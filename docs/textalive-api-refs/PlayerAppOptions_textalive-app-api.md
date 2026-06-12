---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html"
ID:
createdAt: "2026-05-29T19:30:40+09:00"
---
## Interface PlayerAppOptions

リリックアプリのオプション

Lyric app options

interface PlayerAppOptions {  
[appAuthor](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html#appAuthor)?: string;  
[appName](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html#appName)?: string;  
[parameters](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html#parameters)?: [ParameterWidget](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html) \[\];  
[token](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html#token): string;  
}

## Properties

### Optional appAuthor

appAuthor?: string

アプリ作者の名前

Name of the author of this application

#### Deprecated

This value will be automatically retrieved from TextAlive API server.

### Optional appName

appName?: string

アプリの名前

Name of this application

#### Deprecated

This value will be automatically retrieved from TextAlive API server.

### Optional parameters

parameters?: [ParameterWidget](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html) \[\]

アプリの調整可能なパラメタ一覧

List of parameters

### token

token: string

アプリの開発者用トークン

Application token