---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayerApp.html"
ID:
createdAt: "2026-05-29T19:27:31+09:00"
---
## Interface IPlayerApp

リリックアプリの情報

Lyric app information

## Properties

アプリ作者の名前

Name of the author of this application

### Readonly host

host: [PlayerAppHost](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppHost.html)

TextAlive のホストに接続されている場合、その情報

TextAlive host information

### Readonly isConnecting

isConnecting: boolean

ホストへの接続中か否か

Whether the player is trying to connect to a host

### Readonly managed

managed: boolean

TextAlive のホストに接続されているか否か

Whether this app is connected to the TextAlive host or not

### name

name: string

アプリの名前

Name of this application

### Readonly options

options: [PlayerAppOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html)

リリックアプリのオプション

Lyric app options

### Readonly parameters

parameters: [ParameterValues](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterValues.html)

ホストから指定されているパラメタの現在値

Current parameter values

### Readonly server

server: PlayerAppServer

TextAlive API サーバの情報

TextAlive server info

### Readonly songOptions

songOptions: PlayerAppSongOptions

クエリパラメタまたはTextAliveホストにより指定されている楽曲データの読み込みオプション

Options to load song data specified by the query parameter or updated by the media message

### Readonly songUrl

songUrl: string

クエリパラメタまたはTextAliveホストにより指定されている再生対象の楽曲URL

- アプリは起動時にクエリパラメタを調べ、楽曲が指定されていれば自動的に [IPlayer.createFromSongUrl](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromSongUrl) で楽曲情報の読み込みを開始します（ホストに接続されていても、クエリパラメタによる指定がなければ空になります）
- アプリがTextAliveホストに接続されると、ホストの指示により楽曲が上書きされることがあります（この後に [PlayerAppListener.onAppMediaChange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppListener.html#onAppMediaChange) イベントが呼ばれます）

Song url specified by the query parameter or updated by the media message

- During the initialization of this app, it automatically looks for the song URL in the query parameter. When the song URL is specified, it loads the song by calling [IPlayer.createFromSongUrl](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromSongUrl).
- When the app is connected to a host, the host might overwrite the song URL, resulting in the [PlayerAppListener.onAppMediaChange](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppListener.html#onAppMediaChange) event.

### status

status: number

アプリの状態

Status of this application

## Methods

### connect

- connect(): Promise<boolean>
- ホストへの接続を試みる
	- 親フレームに 5 回までメッセージを送信する
	- 返事を 200 \[ms\] まで待つ
	- 最大で計 1 \[s\] 待つ
	Try connecting to a host
	- posts message to the parent frame for 5 times at most
	- waits for the ack response for 200 \[ms\]
	- takes up to 1 \[s\] to complete