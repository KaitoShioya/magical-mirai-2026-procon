// 使い方説明の内容（世界観・操作方法・成果物）。ロード中の覆い（src/app/overlay.ts）と
// 「これはなに？」パネル（src/app/howTo/howToView.ts）の両方が、この単一の出典を共有する（重複を作らない）。
// 出典は docs/idea/concept-final.md の §1〜§4。文字列のみの純データで、外部依存を持たない。

/** 使い方説明の1節。見出しと、1つ以上の段落（各要素が1段落）を持つ。 */
export interface HowToSection {
  heading: string;
  paragraphs: string[];
}

/** 使い方説明の全体。題名と、節の並びを持つ。 */
export interface HowToContent {
  title: string;
  sections: HowToSection[];
}

/** 本作の使い方説明。世界観・操作方法・成果物の3節からなる。 */
export const HOW_TO_CONTENT: HowToContent = {
  title: "遊び方",
  sections: [
    {
      heading: "世界観",
      paragraphs: [
        "深夜の雨が降る湖の3次元空間が舞台です。",
        "初音ミクが湖の中心に常に在ります。カメラが歌詞の空間を移動して、歌詞を立体的に見せます。",
      ],
    },
    {
      heading: "操作方法",
      paragraphs: [
        "画面の左側を縦に7つのレーンに分け、各レーンがその瞬間の和音の構成音に対応します。",
        "落ちてくるノーツが判定線に重なる瞬間に、そのレーンを1回触れます。触れた瞬間（タイミング）と触れたレーン（音程）で反応が決まります。",
        "外れ音はありません。どの操作でも必ず協和音が鳴ります。",
      ],
    },
    {
      heading: "成果物",
      paragraphs: [
        "楽曲が終わると、あなたの反応に応じて、ひまわり（橙色の光）と蝶（青色の光）が湖面に灯ります。",
        "その情景をカメラで撮影して保存できます。",
      ],
    },
  ],
};
