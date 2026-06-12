---
source: "https://developer.textalive.jp/app/song/"
ID:
createdAt: "2026-05-29T19:15:05+09:00"
---
## 2\. 楽曲情報の活用

このステップのポイント

TextAlive App が取得できる楽曲に関する情報には、 **楽曲制作者** の情報、 **音楽地図** （ビート、サビ、コード進行、感情値、声量の推定値） の情報、 **歌詞** のテキスト、品詞、タイミング情報があります。

詳しくは「 [4\. App のライフサイクル](https://developer.textalive.jp/app/life-cycle) 」で説明しますが、 [`onVideoReady`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoReady) イベントは楽曲情報の読み込みがすべて完了したタイミングで発行されます。

このページでは、楽曲情報について順番に説明していきます。以降、 `import { Player } from "textalive-app-api"` で取得できる [`Player`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) クラスのインスタンスを `player` という変数名で表します。

## 楽曲制作者

楽曲が Songle 上で登録されている場合、その制作者の情報には [`onSongLoad`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongLoaderListener.html#onSongLoad) イベントの引数または [`onVideoReady`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoReady) イベントが呼ばれたあと `player.`[`data`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html)`.`[`song`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/Song.html) でアクセスできます。

```json
{
  // 楽曲名
  "name": "四角い地球を丸くする",
  // 楽曲のURL
  "permalink": "..."
  // アーティスト名
  "artist": { "name": "TOKOTOKO（西沢さんP）" }
}
```

また、作詞者の情報は [`onTextLoad`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TextLoaderListener.html#onLyricsLoad) イベントの引数または `player.`[`data`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html)`.`[`lyricsBody`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsBody.html) でアクセスできます。

## 音楽地図の情報

楽曲が Songle 上で登録されている場合、その基本的な音楽地図情報には [`onSongMapLoad`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/SongLoaderListener.html#onSongMapLoad) イベントの引数または [`onVideoReady`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoReady) イベントが呼ばれたあと `player.`[`data`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html)`.`[`songMap`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html) でアクセスできます。

```json
{
  // ビート
  "beats": [...],
  // コード進行
  "chords": [...],
  // 繰り返し区間（サビ候補）
  "segments": [...],
  // ビート、コード進行、繰り返し区間のリビジョンID（バージョン番号）
  "revisions": {...}
}
```

現在再生中の位置にあるビートやサビの情報は [`player.findBeat(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#findBeat) や [`player.findChorus(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#findChorus) で取得できます。

また、特定のオプションを指定することで以下の情報にもアクセスできるようになります。楽曲地図をより詳細に読み込むことになるので、通信量は若干増加します。

### 感情値（V/A 空間の座標値）

[`Player`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) クラスの初期化時に与えるオプション [`valenceArousalEnabled`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#valenceArousalEnabled) を `true` にしておくと、 [`player.getValenceArousal(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#getValenceArousal) で再生位置の V/A 空間中の座標値を取得できます。

### 歌声の声量

[`Player`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html) クラスの初期化時に与えるオプション [`vocalAmplitudeEnabled`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerOptions.html#vocalAmplitudeEnabled) を `true` にしておくと、 [`player.getVocalAmplitude(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/classes/Player.html#getVocalAmplitude) で再生位置の歌声の声量値を取得できます。

音楽地図の情報に誤りがある場合は [Songle](https://songle.jp/) で訂正できます。仮に他の人が訂正した場合でも古い音楽地図情報を使い続けたい場合は、リビジョン ID（バージョン番号）を使って音楽地図を固定する必要があります。

- 現時点で読み込まれているリビジョン ID を知るには [`revisions`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ISongMap.html#revisions) プロパティを使います。
- 音楽地図を固定するには `player.`[`createFromSongUrl`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromSongUrl) の第二引数で [`video`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html#video)`.`[`beatId`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#beatId) などを指定します。

## 歌詞

歌詞が TextAlive 上で登録されていて取得に成功した場合、その情報には [`onVideoReady`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerEventListener.html#onVideoReady) が呼ばれたあと `player.`[`video`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html) から取得できます。

文字の情報は `video.firstChar` 単語の情報は `video.firstWord` フレーズの情報は `video.firstPhrase` で取得できます。それぞれ [`startTime`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ITextUnit.html#startTime) [`endTime`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ITextUnit.html#endTime) プロパティでミリ秒単位の発声区間が、 [`text`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ITextUnit.html#text) プロパティで文字情報が取得できるほか、 [`next`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ITextUnit.html#next) プロパティで次の文字、単語、フレーズが取得できる linked list になっています。

さらに、単語に関しては [`language`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IWord.html#language) プロパティで言語が、 [`pos`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IWord.html#pos) プロパティで品詞分解の結果が取得できます。現状では日本語（ `ja` ）と英語（ `en` ）に対応しています。

現在発声中のフレーズ、単語、文字はそれぞれ [`player.video.findPhrase(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html#findPhrase) 、 [`player.video.findWord(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html#findWord) 、 [`player.video.findChar(player.timer.position)`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IVideo.html#findChar) で取得できます。

v0.2.0- 歌詞のメタデータは `player.data.lyricsBody` でアクセスできます。

```json
{
  // 歌詞のタイトル
  "name": "四角い地球を丸くする",
  // 歌詞のURL
  "url": "..."
  // 作詞家名
  "artist": { "name": "TOKOTOKO（西沢さんP）" }
}
```

v0.2.0- 歌詞が TextAlive 上で登録されている場合でもあえてその情報を取得したくない場合は `video.lyricId` に `0` を指定します。

```javascript
p.createFromSongUrl("http://piapro.jp/t/C0lr/20180328201242", {
  video: { lyricId: 0 },
});
```

歌詞の発声タイミングに誤りがある場合は [TextAlive](https://textalive.jp/) で訂正できます。仮に他の人が訂正した場合でも古いタイミング情報を使い続けたい場合は、歌詞発声タイミングの ID と訂正 ID の組を使ってタイミング情報を固定する必要があります。

- 現時点で読み込まれているタイミングの ID を知るには [`onLyricsLoad`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TextLoaderListener.html#onLyricsLoad) イベントの第二引数か `player.`[`data`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html)`.`[`lyricsId`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IDataLoader.html#lyricsId) および [`lyrics.id`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/LyricsDiffInfo.html#id) プロパティを使います。
- 音楽地図を固定するには `player.`[`createFromSongUrl`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IPlayer.html#createFromSongUrl) の第二引数で [`video`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PlayerVideoOptions.html#video)`.`[`lyricId`](https://developer.textalive.jp/packages/textalive-app-api/interfaces/PartialVideoEntry.html#lyricId) などを指定します。

## 次のステップ

[3\. アニメーション](https://developer.textalive.jp/app/animation)