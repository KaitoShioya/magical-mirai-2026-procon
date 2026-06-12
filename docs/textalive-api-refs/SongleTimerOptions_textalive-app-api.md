---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongleTimerOptions.html"
ID:
createdAt: "2026-05-29T19:32:13+09:00"
---
## Interface SongleTimerOptions

[SongleTimer](https://developer.textalive.jp/packages/textalive-app-api/classes/SongleTimer.html) の初期化オプション

Options for instantiating [SongleTimer](https://developer.textalive.jp/packages/textalive-app-api/classes/SongleTimer.html)

interface SongleTimerOptions {  
[accessToken](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongleTimerOptions.html#accessToken)?: string;  
[headless](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongleTimerOptions.html#headless)?: boolean;  
[secretToken](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongleTimerOptions.html#secretToken)?: string;  
[songle](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongleTimerOptions.html#songle)?: Songle;  
}

## Properties

### Optional accessToken

accessToken?: string

Songle Syncのアクセストークン

Access token for Songle Sync

#### See

[https://api.songle.jp/sync](https://api.songle.jp/sync)

### Optional headless

headless?: boolean

音源を貼り付けるか否か

Whether to embed audio source or not

### Optional secretToken

secretToken?: string

Songle Syncのシークレットトークン

Secret token for Songle Sync

#### See

[https://api.songle.jp/sync](https://api.songle.jp/sync)

### Optional songle

songle?: Songle

Songle APIのエントリーポイント

- `import Songle from "songle-api"` のようにして得られるオブジェクト
- 指定しなければ自動的に dynamic import または script タグの挿入によって読み込まれる

Songle API entrypoint

- The object that can be gained by calling `import Songle from "songle-api"`
- If not specified, Songle API gets initialized automatically through dynamic import or