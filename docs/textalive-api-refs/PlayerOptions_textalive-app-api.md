---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html"
ID:
createdAt: "2026-05-29T19:31:17+09:00"
---
## Interface PlayerOptions

Player の初期化オプション

Player initialization options

#### See

[IPlayer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html)

interface PlayerOptions {  
[app](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#app)?: [PlayerAppOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html);  
[fontFamilies](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#fontFamilies)?: (string | [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html))\[\];  
[lyricsFetchTimeout](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#lyricsFetchTimeout)?: number;  
[mediaBannerPosition](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#mediaBannerPosition)?: [PlayerBannerPosition](https://developer.textalive.jp/packages/textalive-app-api/types/PlayerBannerPosition.html);  
[mediaElement](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#mediaElement)?: string | HTMLElement;  
[throttleInterval](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#throttleInterval)?: number;  
[timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#timer)?: [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html);  
[valenceArousalEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#valenceArousalEnabled)?: boolean;  
[vocalAmplitudeEnabled](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#vocalAmplitudeEnabled)?: boolean;  
}

## Properties

### Optional app

app?: [PlayerAppOptions](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerAppOptions.html)

リリックアプリの情報; このプロパティがセットされていると、再生メディアをURLのクエリパラメタから取得したり、アプリのホストとの接続を試みたりします。

Lyric app options. When this property is set, the player parses query string to gain initial media information and tries communicating with the app host.

### Optional fontFamilies

fontFamilies?: (string | [FontInfo](https://developer.textalive.jp/packages/textalive-app-api/interfaces/FontInfo.html))\[\]

読み込むフォントの一覧を指定できます。 `null` が指定されると、利用可能なすべてのフォントが読み込まれます。

A list of font families to load. When `null` is set, all available fonts are loaded.

### Optional lyricsFetchTimeout

lyricsFetchTimeout?: number

歌詞テキストの読み込みを諦めるタイムアウト時刻です。指定しないか `0` を指定した場合はタイムアウトしません。

Timeout for fetching lyrics text \[ms\].

### Optional mediaElement

mediaElement?: string | HTMLElement

音源メディアの配置先となるDOM要素; 音源を埋め込むコンテナとして利用されるDOM要素です。

A HTML element to host media elements.

### Optional throttleInterval

throttleInterval?: number

時刻のアップデートイベントが発行されすぎるのを防ぐために使われるスロットリング機構の発行間隔です。

An interval for emitting throttled events \[ms\].

#### See

[PlayerEventListener.onThrottledTimeUpdate](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onThrottledTimeUpdate)

### Optional timer

timer?: [Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html)

Player の音源の再生状態を管理する `Timer` インスタンスです。

A timer instance that controls the player status.

### Optional valenceArousalEnabled

valenceArousalEnabled?: boolean

V/A空間の座標値を取得するか否か

Whether to load valence arousal data or not

### Optional vocalAmplitudeEnabled

vocalAmplitudeEnabled?: boolean

声量情報を取得するか否か

Whether to load vocal amplitude data or not