---
source: "https://developer.textalive.jp/events/magicalmirai2026/"
ID:
createdAt: "2026-05-29T19:38:47+09:00"
---
TextAlive App API は音楽に合わせてタイミングよく歌詞が動くWebアプリケーション（リリックアプリ）を開発できるJavaScript用のライブラリです。 [初音ミク「マジカルミライ 2026」](https://magicalmirai.com/2026) では、このAPIを使って、 **[『初音ミク「マジカルミライ 2026」楽曲コンテスト』の受賞作品](https://piapro.jp/pages/official_collabo/magical2026_musiccontest/result) にあわせて魅力的に動くリリックアプリ** をプログラミングするコンテストが開催されます。

このプログラミング・コンテストは、今年で6度目の開催となります。 [2020年](https://developer.textalive.jp/events/magicalmirai2020/) 、 [2021年](https://developer.textalive.jp/events/magicalmirai2021/) 、 [2022年](https://developer.textalive.jp/events/magicalmirai10th/) 、 [2023年](https://developer.textalive.jp/events/magicalmirai2023/) 、 [2024年](https://developer.textalive.jp/events/magicalmirai2024/) 、そして [昨年のサポートページ](https://developer.textalive.jp/events/magicalmirai2025/) や [入選作品](https://magicalmirai.com/2025/procon/entry.html) 、 [サンプルコード](https://developer.textalive.jp/app/examples/) を、ぜひご覧ください。

[![初音ミク「マジカルミライ 2020」プログラミング・コンテスト](https://developer.textalive.jp/images/events/magicalmirai2020/magicalmirai2020-banner.jpg)](https://developer.textalive.jp/events/magicalmirai2020/)

[![初音ミク「マジカルミライ 2021」プログラミング・コンテスト](https://developer.textalive.jp/images/events/magicalmirai2021/magicalmirai2021-banner.jpg)](https://developer.textalive.jp/events/magicalmirai2021/)

[![初音ミク「マジカルミライ」10th Anniversary プログラミング・コンテスト](https://developer.textalive.jp/images/events/magicalmirai10th/magicalmirai10th-banner.jpg)](https://developer.textalive.jp/events/magicalmirai10th/)

[![初音ミク「マジカルミライ 2023」プログラミング・コンテスト](https://developer.textalive.jp/images/events/magicalmirai2023/magicalmirai2023-banner.jpg)](https://developer.textalive.jp/events/magicalmirai2023/)

[![初音ミク「マジカルミライ 2024」プログラミング・コンテスト](https://developer.textalive.jp/images/events/magicalmirai2024/magicalmirai2024-banner.jpg)](https://developer.textalive.jp/events/magicalmirai2024/)

[![初音ミク「マジカルミライ 2025」プログラミング・コンテスト](https://developer.textalive.jp/images/events/magicalmirai2025/magicalmirai2025-banner.jpg)](https://developer.textalive.jp/events/magicalmirai2025/)

[プログラミング・コンテスト 公式サイトへ](https://magicalmirai.com/2026/procon/)

応募方法やリリックアプリの作り方の概要は、YouTube動画「 [TextAlive App API講座](https://youtu.be/CNAC8skuGSo) 」をご覧ください。なお、応募のスケジュールや、応募のきまりについては、昨年より更新されているため、必ず [公式サイト](https://magicalmirai.com/2026/procon/) をご覧ください。

このページ下部の「 [作品応募に向けて](#advice) 」もぜひ参考にしてみてください。

![](https://www.youtube.com/watch?v=CNAC8skuGSo)

TextAlive App API を使うと、Web上で公開されている楽曲と歌詞を利用して、タイミングよく歌詞が動くWebアプリケーションを開発できます。楽曲と歌詞はいずれもURLが [TextAlive サービスサイト](https://textalive.jp/) に登録されている必要がありますが、コンテスト参加者のみなさまは心配ご無用です。

コンテストの対象となる課題曲は 6 曲とも TextAlive への登録が済んでおり、API上で楽曲のURL（ピアプロまたはYouTubeのURLです）を指定すれば、それと紐づいた歌詞（いずれもピアプロのURLです）が自動的に読み込まれるので、すぐに演出をプログラミングできます。

APIを使うと、例えば次のようなリリックアプリが作れます。

次の作例では、HTML/CSS/JSのリンクをクリックするとソースコードを見ることができます。「EDIT ON CODEPEN」をクリックすると、ソースコードを編集できます。（スマートフォンでは動作しないので、パソコンで試してみてください。） もっと作例を見たいときは「 [サンプルコード](https://developer.textalive.jp/app/examples) 」をご覧ください。

<iframe height="640" title="TextAlive App API sample" src="https://codepen.io/arcatdmz/embed/abNXJgG?height=636&amp;theme-id=light&amp;default-tab=result" allowfullscreen=""></iframe>

TextAlive App API は `script` タグでWebサイトに読み込んだり、 npm パッケージ [`textalive-app-api`](https://www.npmjs.com/package/textalive-app-api) をインストールすることで使えるようになります。 API の呼び出しには「 [開発者登録](https://developer.textalive.jp/profile/) 」 で入手できるアプリトークンが必要となります。詳しい使い方は「 [TextAlive App API チュートリアル](https://developer.textalive.jp/app/) 」をご覧ください。

TextAlive App APIについて技術的に分からないことやバグ報告などがあれば、 [GitHub Issues](https://github.com/TextAliveJp/textalive-app-api/issues?q=is%3Aissue) までお願いいたします。

```markup
<script src="https://unpkg.com/axios/dist/axios.min.js"></script>
<script src="https://unpkg.com/textalive-app-api/dist/index.js"></script>
<script>
  const { Player } = TextAliveApp;
</script>
```
```bash
npm install textalive-app-api
```
```javascript
import { Player } from "textalive-app-api";
```

プログラミング・コンテストはクリプトン・フューチャー・メディア株式会社が主催し、産業技術総合研究所（産総研） Animāreプロジェクトが協力しています。基本的な情報やお問い合わせ先は [公式サイト](https://magicalmirai.com/2026/procon/) をご覧ください。ここでは、作品応募に向けて、技術面でのポイントをご紹介します。

プログラミング・コンテストへ作品を応募するには、作品のソースコードをソーシャルコーディングプラットフォーム「 [GitHub](https://github.com/) 」上にアップロードする必要があります。また、主催者による審査が終わるまで他の人に作品のソースコードが見られないようにするため、「プライベートリポジトリ」を作成する必要があります。

詳しい方法は [Web 検索](https://www.google.com/search?q=github+%E3%83%97%E3%83%A9%E3%82%A4%E3%83%99%E3%83%BC%E3%83%88%E3%83%AA%E3%83%9D%E3%82%B8%E3%83%88%E3%83%AA+%E4%BD%BF%E3%81%84%E6%96%B9) で見つかるチュートリアルを参考にしてみてください。

主催者による審査は、 [GitHub](https://github.com/) からダウンロードしたソースコードを実際のWebアプリケーションとして動作させて行われます。また、入選作品は主催者のWebサーバなどに配置され、一般に公開されてユーザ投票が行われ、入賞を競うことになります。

こうしたことから、今回、応募作品はHTTPサーバ上に設置するだけで動作する静的アプリケーションに限られています。

しかしながら、一般的なWebブラウザで動作するものであればよいので、さまざまなライブラリと組み合わせて開発して構いません。例えば、 [three.js](https://threejs.org/) 、 [PixiJS](https://www.pixijs.com/) 、 [p5js](https://p5js.org/) のように、映像演出に便利なライブラリは凝ったことをしようとすればほとんど必須かもしれません。

ネットワーク接続を前提としてよいので、Web APIの類を活用してもよいでしょう。Web標準に則ってデバイスのハードウェアを活用するAPIを使っても面白いかもしれません。（今年からの変更点として、応募フォームに動作環境を明記する必要があるのでご注意ください。）

応募フォームに記入できるアピールはプレーンテキストのみで情報量が限られていますが、リポジトリに配置できるREADMEは自由に編集可能で、画像ファイルを貼り込んだりすることもできます。

[サンプルコードのREADME](https://github.com/TextAliveJp/textalive-app-basic/#readme) のようにWebアプリケーションのビルド、実行手順を書くことはもちろん必要ですが、開発した作品の魅力をアピールできるチャンスとしても、ぜひ活用してください。

審査に際しては極力READMEファイルなどを見ながらWebアプリケーションを応募者の意図通り動作させようと試みますが、それでも応募者の環境で動いていたものが動かなくなってしまうことはありえます。

そのような場合の保険として、また、作品のアピールのため、応募時にはWebアプリケーションを設置したサイトのURLとデモ動画のURLを入力することをおすすめします。 動画撮影には、 [macOSの標準機能](https://support.apple.com/ja-jp/HT208721) や [Windowsの標準機能](https://support.microsoft.com/ja-jp/help/4027180/windows-10-record-a-game-clip-with-xbox-game-bar) が使えます。詳しくは [Webで検索](https://www.google.com/search?q=os%E6%A8%99%E6%BA%96+%E7%94%BB%E9%9D%A2%E3%82%AD%E3%83%A3%E3%83%97%E3%83%81%E3%83%A3) してみてください。

なお、審査自体は原則として作品そのものを対象として行われるため、デモアプリやデモ動画のURL入力は必須ではありませんのでご注意ください。

審査対象の楽曲は、Webアプリケーションの中で以下のように読み込むことができます。楽曲URLとして、 `https://piapro.jp/t/曲ID` のような短いものではなく、最後の数字まで含めた `https://piapro.jp/t/曲ID/数字` の形式でないと正しく読み込めないことにご注意ください。また、歌詞タイミングやサビのタイミング（音楽地図）が固定されるようにバージョン番号を指定しておいてください。

バージョン番号を使った音楽地図の固定について詳しくは [チュートリアル「楽曲情報の活用」ページのTips](https://developer.textalive.jp/app/song) をご覧ください。

今年の楽曲コンテストのグランプリ曲「こたえて」（imie さま）は、 [歌詞](https://piapro.jp/t/9o24) の3段落目が2段落目発声中のコーラスになっています。TextAlive App APIはこうしたコーラスを正しく表現できないため、コーラスの範囲の文字それぞれに1ミリ秒の長さのタイミング情報が割り当てられています。

コーラスの範囲の文字の正しいタイミング情報については別途 [こちら](https://developer.textalive.jp/events/magicalmirai2026/6W2N_chorus_timings.jsonc) からコメント付きJSON（.jsonc）をダウンロードできるようになっています。演出上の必要に応じてご活用ください。

```javascript
player.addListener({
  onAppReady: (app) => {
    if (!app.managed) {
      // こたえて / imie
      player.createFromSongUrl("https://piapro.jp/t/6W2N/20251215164617", {
        video: {
          // 音楽地図訂正履歴
          beatId: 4827293,
          chordId: 2963754,
          repetitiveSegmentId: 3086261,
      
          // 歌詞URL: https://piapro.jp/t/9o24
          // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2F6W2N%2F20251215164617
          lyricId: 126519,
          lyricDiffId: 28645
        },
      });

      // アフター・ザ・カーテン / Rulmry
      // player.createFromSongUrl("https://piapro.jp/t/zoqO/20251214200738", {
      //   video: {
      //     // 音楽地図訂正履歴
      //     beatId: 4827294,
      //     chordId: 2963755,
      //     repetitiveSegmentId: 3086262,
      // 
      //     // 歌詞URL: https://piapro.jp/t/EVO2
      //     // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FzoqO%2F20251214200738
      //     lyricId: 126591,
      //     lyricDiffId: 28627
      //   },
      // });

      // シャッターチャンス / 夜未アガリ
      // player.createFromSongUrl("https://piapro.jp/t/PNpQ/20251209170719", {
      //   video: {
      //     // 音楽地図訂正履歴
      //     beatId: 4827295,
      //     chordId: 2963756,
      //     repetitiveSegmentId: 3086263,
      // 
      //     // 歌詞URL: https://piapro.jp/t/wyWv
      //     // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FPNpQ%2F20251209170719
      //     lyricId: 126542,
      //     lyricDiffId: 28628
      //   },
      // });

      // 世界最後の音楽隊 / 夏山よつぎ×ど～ぱみん
      // player.createFromSongUrl("https://piapro.jp/t/B3yJ/20251215061727", {
      //   video: {
      //     // 音楽地図訂正履歴
      //     beatId: 4827296,
      //     chordId: 2963757,
      //     repetitiveSegmentId: 3086264,
      // 
      //     // 歌詞URL: https://piapro.jp/t/9U-6
      //     // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FB3yJ%2F20251215061727
      //     lyricId: 126594,
      //     lyricDiffId: 28629
      //   },
      // });

      // トリツクロジー / 鶴三
      // player.createFromSongUrl("https://piapro.jp/t/QBdL/20251215094303", {
      //   video: {
      //     // 音楽地図訂正履歴
      //     beatId: 4827297,
      //     chordId: 2963758,
      //     repetitiveSegmentId: 3086265,
      // 
      //     // 歌詞URL: https://piapro.jp/t/Nixq
      //     // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FQBdL%2F20251215094303
      //     lyricId: 126593,
      //     lyricDiffId: 28630
      //   },
      // });

      // TAKEOVER / Twinfield
      // player.createFromSongUrl("https://piapro.jp/t/E2i3/20251215092113", {
      //   video: {
      //     // 音楽地図訂正履歴
      //     beatId: 4827298,
      //     chordId: 2963759,
      //     repetitiveSegmentId: 3086266,
      // 
      //     // 歌詞URL: https://piapro.jp/t/zxWP
      //     // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FE2i3%2F20251215092113
      //     lyricId: 126533,
      //     lyricDiffId: 28631
      //   },
      // });
    }
  }
});
```

TextAliveは、産業技術総合研究所メディアインタラクション研究グループが研究開発しています。学術研究目的で公開しながら実証実験中です。本研究の一部は、JST CRONOS (JPMJCS25K1; Animāreプロジェクト) の支援を受けています。

本研究はウェブ上にコンテンツを公開されている多くの方々によってはじめて可能になったプロジェクトであり、ウェブを前提としたコンテンツ制作の可能性を追求しています。

[もっと詳しく知る](https://scrapbox.io/textalive/TextAlive)

[クレジット](https://scrapbox.io/textalive/%E3%82%AF%E3%83%AC%E3%82%B8%E3%83%83%E3%83%88)

TextAliveの実証実験として、以下のとおり『初音ミク「マジカルミライ 2026」プログラミング・コンテスト』の企画に協力しています。

- クリプトン・フューチャー・メディア株式会社
- 産業技術総合研究所（産総研） Animāreプロジェクト
- textalive-ml \[at\] aist.go.jp