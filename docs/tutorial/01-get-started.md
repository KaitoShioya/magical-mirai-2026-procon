---
source: "https://developer.textalive.jp/app/"
ID:
createdAt: "2026-05-29T19:13:59+09:00"
---
## 1\. 開発の始め方

## TextAlive App API とは

TextAlive App API は、 **音楽に合わせてタイミングよく歌詞が動くWebアプリケーション（リリックアプリ）** を開発できるJavaScript用のライブラリです。 `script` タグでWebサイトに読み込んだり、 npm パッケージ [`textalive-app-api`](https://www.npmjs.com/package/textalive-app-api) をインストールすることで、楽曲のサビやビートなどの楽曲地図情報を取得したり、歌詞のタイミング情報を取得したりできるようになります。

このAPIを使うと、一曲のために作り込んだ演出はもちろんのこと、 [TextAlive](https://textalive.jp/) に登録されているさまざまな楽曲に合わせて動作する演出をプログラミングできます。また、 [Songle Sync](https://api.songle.jp/sync) を使って周りの人と同期した演出をプログラミングすることも可能です。 さらに、このAPIを使って開発されたWebアプリケーションは、所定の登録プロセスを経ることで、 TextAlive 本サイト上で「スタイル」として選択可能になる予定です。

ぜひ、TextAlive App APIを活用して音楽と歌詞の魅力を引き出す多様なアプリケーションを開発してみてください。なお、 API の呼び出しには「 [開発者登録](https://developer.textalive.jp/profile/) 」 で入手できるアプリトークンが必要となります。 APIの更新履歴は [TextAlive App APIの開発履歴](https://scrapbox.io/textalive/TextAlive_App_API%E3%81%AE%E9%96%8B%E7%99%BA%E5%B1%A5%E6%AD%B4) のページをご覧ください。

TextAlive App APIについて技術的に分からないことやバグ報告などがあれば、 [GitHub Issues](https://github.com/TextAliveJp/textalive-app-api/issues?q=is%3Aissue) または [Gitter Chat](https://gitter.im/textalive-app-api/community) までお願いいたします。

[![](https://developer.textalive.jp/images/apps/dance.gif)](https://github.com/TextAliveJp/textalive-app-dance)

[![](https://developer.textalive.jp/images/apps/p5js.gif)](https://github.com/TextAliveJp/textalive-app-p5js)

[![](https://developer.textalive.jp/images/apps/lyric-tiles.gif)](https://github.com/TextAliveJp/textalive-app-lyric-tiles)

## TextAlive App 開発を始めるには

TextAlive App API を使ったアプリケーションの開発には、 HTML や JavaScript などの Web フロントエンドに関する基本的な知識が必要です。

API を使い始めるには、以下の二通りの方法があります。

```bash
npm install textalive-app-api
```
```javascript
import { Player } from "textalive-app-api";
```

npm パッケージ [`textalive-app-api`](https://www.npmjs.com/package/textalive-app-api) をインストールすれば開発を始められます。

[Parcel](https://parceljs.org/) や [Webpack](https://webpack.js.org/) など、 npm パッケージを利用して Web アプリケーションを開発できるツールを別途用意する必要があります。 TypeScript の型定義ファイルも一緒にインストールされるので、 [Visual Studio Code](https://code.visualstudio.com/) など TypeScript に対応した開発環境ではコード補完が可能です。

本格的な Web アプリケーションの開発にはこちらの方法がおすすめです。ほとんどすべてのサンプルコードが、こちらの方法で開発されています。

```markup
<script src="https://unpkg.com/axios/dist/axios.min.js"></script>
<script src="https://unpkg.com/textalive-app-api/dist/index.js"></script>
<script>
  const { Player } = TextAliveApp;
</script>
```

HTML ファイルに `script` タグを 2 行書いて、Web ブラウザで開けば開発を始められます。

2 行目が TextAlive App API 本体で、1 行目の [`axios`](https://github.com/axios/axios) は App API が内部で利用している通信用のライブラリです。

この行以降、グローバル変数 `TextAliveApp` を通して App API にアクセスできるようになります。ちょっと API を試したいときや、小規模な Web アプリケーションの開発にはこちらの方法がおすすめです。

どちらの方法でも使える機能は同じです。途中で npm パッケージを使う方法に切り替えることもできるので、まずは手軽に `script` タグを使って試してみてもよいでしょう。

## 開発者登録と最初の一歩

TextAlive App は、 `textalive-app-api` ライブラリがエクスポートしている `Player` クラスのインスタンスを作り、このインスタンスが配るイベントのハンドラを書いていけば開発できます。

ただし、 `Player` クラスのコンストラクタには [開発者登録](https://developer.textalive.jp/profile) して入手したアプリトークンを渡す必要があります。もっともシンプルなコード例は以下のようになります。

```javascript
import { Player } from "textalive-app-api";

// 単語が発声されていたら #text に表示する
const animateWord = function (now, unit) {
  if (unit.contains(now)) {
    document.querySelector("#text").textContent = unit.text;
  }
};

// TextAlive Player を作る
const player = new Player({ app: { token: "your token" } });
player.addListener({
  // 動画オブジェクトの準備が整ったとき（楽曲に関する情報を読み込み終わったとき）に呼ばれる
  onVideoReady: (v) => {
    // 定期的に呼ばれる各単語の "animate" 関数をセットする
    let w = player.video.firstWord;
    while (w) {
      w.animate = animateWord;
      w = w.next;
    }
  },
});
```
```html
<span id="text"></span>
```

## サンプルコード

[CodePen](https://codepen.io/) や [JSFiddle](https://jsfiddle.net/) のような Web 上の開発環境を使うと、自分のパソコン上に環境をセットアップしなくてもすぐに TextAlive App API を試すことができます。

下に埋め込まれているのは `script` タグで TextAlive App API を読み込んでいる [CodePen 上のサンプルコード](https://codepen.io/arcatdmz/pen/abNXJgG) です。サンプルコードの一覧は「 [サンプルコードを見る](https://developer.textalive.jp/app/examples) 」ボタンをクリックしてください。

<iframe height="640" title="TextAlive App API sample" src="https://codepen.io/arcatdmz/embed/abNXJgG?height=636&amp;theme-id=light&amp;default-tab=result" frameborder="0" allowfullscreen=""></iframe>

## Debugger による動作チェックと「TextAlive ホスト」

TextAlive App の動作チェックをするには「 [TextAlive App Customizer](https://developer.textalive.jp/app/run) 」にアクセスして **TextAlive App URL** 欄に App の URL を入力してください。この場合、再生すべき楽曲の URL や再生状態を管理するコントロールは Debugger 側で決まります。 Debugger のように TextAlive App の状態を管理するものを「 **TextAlive ホスト** 」と呼びます。

TextAlive App は TextAlive ホストと接続されている場合、再生コントロールなどの実装をユーザ自身が書く必要はありません。

一方、ローカル開発では TextAlive App がホストと接続されていない（TextAlive の外側で動作する）ため、アプリケーションの振る舞いをテストするためには、サンプルとして読み込むメディアを指定したり、再生コントロールを用意したりといったコードが必要になります。これは、次のように書くことができます。

```javascript
player.addListener({
  onAppReady: (app) => {
    if (!app.songUrl) {
      // URLを指定して楽曲をもとにした動画データを作成
      p.createFromSongUrl("your favorite media url here...");
    }
    if (!app.managed) {
      // 再生コントロールを表示
      showControls();
    }
  },
});
```

TextAlive App がホストと接続されているときには、 `onAppReady` 以外にも `onAppMediaChange` イベントなどが発火することがあります。これらのイベントの詳細については「 [4\. App のライフサイクル](https://developer.textalive.jp/app/life-cycle) 」をご覧ください。

ローカル開発では通常 HTTP プロトコルが利用されますが、「 [TextAlive App Customizer](https://developer.textalive.jp/app/run) 」は HTTPS プロトコルでホストされています。 HTTPS のサイト内に HTTP のコンテンツを貼り込むことはできないため、ローカルで開発中の TextAlive App をテストするには工夫が必要です。

例えば [ngrok](https://ngrok.com/) など、ローカルで開発中の Web アプリケーションを HTTPS 経由でアクセス可能にするサービスを利用するとよいでしょう。

## 次のステップ

[2\. 楽曲情報を活用する](https://developer.textalive.jp/app/song)