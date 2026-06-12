---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimerInitOptions.html"
ID:
createdAt: "2026-05-29T19:33:26+09:00"
---
## Interface TimerInitOptions

[Timer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html) の動画読み込み時に呼ばれる [Timer.initialize](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#initialize) の引数の型情報

[Timer.initialize](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#initialize) parameter type definition

## Properties

### emitter

emitter: [PlayerEventListener](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html)

TextAlive のイベントリスナ向けにイベントを発行するためのエミッタ

Event emitter

### player

player: [IPlayer](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html)

Player インスタンス

Player instance

### updater

updater: [PlayerMediaPositionUpdateFunction](https://developer.textalive.jp/packages/textalive-app-api/types/PlayerMediaPositionUpdateFunction.html)