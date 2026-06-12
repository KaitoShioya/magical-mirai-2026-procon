---
source: "https://developer.textalive.jp/app/animation/"
ID:
createdAt: "2026-05-29T19:16:56+09:00"
---
## 3\. アニメーション

このステップのポイント

TextAlive で文字やグラフィックがアニメーションする演出を作るためには、いくつか方法があります。

## animate(now, unit)

「 [1\. 開発の始め方](https://developer.textalive.jp/app/#programming-experience) 」のシンプルなコード例では、 [`onVideoReady`](https://developer.textalive.jp/app/life-cycle#onVideoReady) イベントで得られた動画データ内の各 [文字](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChar.html) の [`animate`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IChar.html#animate) プロパティに以下のような関数を代入しています。

```javascript
function (now, unit) {
  if (unit.contains(now)) {
  // 冗長ですが if 文は次のようにも書けます:
  // if (unit.startTime <= now && unit.endTime > now) {
    document.querySelector("#text").text(unit.text);
  }
}
```

この関数が定期的に実行されることで、 `text` という ID を持った画面上の DOM 要素に発声中の単語が表示されます。

このように、TextAlive App API では歌詞のフレーズ、単語、文字の [`animate`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#animate) プロパティに代入されている関数が楽曲再生中に自動的に実行され続けます。実行間隔は `player.`[`wait`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#wait) で指定できます。

なお、発声区間中のどれくらいまで進行したかは `unit.`[`progress(now)`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html#progress) で簡単に取得できます。この関数の返値は時間経過に沿って `0` から `1` まで単調に増加します。アニメーションにメリハリをつけるには、適切なイージング関数を [`Ease`](https://developer.textalive.jp/packages/textalive-app-api/classes/Ease.html) から探してくるとよいでしょう。例えば `let x = Ease.`[`cubicIn(unit.progress(now))`](https://developer.textalive.jp/packages/textalive-app-api/classes/Ease.html#cubicIn) ` * width` のようにして使います。

イージング関数でどのようなアニメーションが実現できるかについては、 [TweenJS Example: Spark Demo - CreateJS](https://www.createjs.com/demos/tweenjs/Tween_SparkTable.html) が分かりやすいです。

TextAlive は CreateJS のイージング関数をそのまま利用しており、上記のデモページで確認できるものはすべて用意されています。

## onTimeUpdate(position)

[PlayerEventListener](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html) を登録することで再生状態に関するイベントを取得できます。

```javascript
p.addListener({
  onTimeUpdate: (position) =>
    console.log("再生位置のアップデート:", position, "ミリ秒"),
});
```

`onTimeUpdate` は前述の `animate(now, unit)` と同じタイミングで呼ばれます。したがって、このイベントリスナの中に映像演出に関するコードを記述する事も可能です。

## player.timer.position

これまでに記述した方法は、基本的に `player.`[`wait`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#wait) で指定した間隔で映像演出に関するコードを定期実行するというものでした。どちらの方法でも、TextAlive が精確な再生時刻の情報を提供してくれました。

しかしながら、Web ブラウザでのアニメーション演出に慣れた人であれば、 [`requestAnimationFrame`](https://developer.mozilla.org/ja/docs/Web/API/Window/requestAnimationFrame) 関数などを使って、より Web ブラウザの都合に合わせた高効率なアニメーションのプログラミングを行いたいと考えるかもしれません。また、 [p5.js](https://p5js.org/get-started/) の `draw()` のように、描画タイミングが選べない関数を定義しなくてはならないフレームワークを使いたいと思うかもしれません。

そうした場合は `player.`[`timer`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html)`.`[`position`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#position) を使うことで、TextAlive のコールバック関数の外でも、TextAlive の現在の再生時刻を精確に取得することができます。（TextAlive には他にも [`mediaPosition`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#mediaPosition) や [`videoPosition`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#videoPosition) のような再生時刻を返すプロパティがありますが、いずれも精確性の面で劣るものです。詳しくは [`Timer.position`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Timer.html#position) の API ドキュメントをご覧ください。）

あとは [`player.findBeat(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#findBeat) を使って現在のビート情報を取得したり、 [`player.video.findPhrase(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html#findPhrase) を使って発声中のフレーズを取得したりして、自由に映像演出をプログラミングできます。

**2024/05/12 追記;** [v0.4.0](https://scrapbox.io/textalive/TextAlive_App_API%E3%81%AE%E9%96%8B%E7%99%BA%E5%B1%A5%E6%AD%B4#664011a33c16b10000e62ff1) から、特定の区間に起きたこと（起きること）をまとめて取得できるAPI「 [時区間駆動型API (time-range-driven API)](https://scrapbox.io/textalive/%E6%99%82%E5%8C%BA%E9%96%93%E9%A7%86%E5%8B%95%E5%9E%8BAPI) 」が実装されました。 描画ループごとに呼び出すことを念頭に設計されており、楽曲再生中にパーティクルを生成したり破棄したりといった処理に便利です。 例えば [`player.findBeatChange(lastPosition, player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#findBeatChange) のようにして、前回から今回までの間に完了したビートや新たに差し掛かっているビートなどの情報をまとめて取得できます。

## 次のステップ

[4\. App のライフサイクル](https://developer.textalive.jp/app/life-cycle)