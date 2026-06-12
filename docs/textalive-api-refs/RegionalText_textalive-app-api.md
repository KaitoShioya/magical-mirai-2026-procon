---
source: "https://developer.textalive.jp/packages/textalive-app-api/types/RegionalText.html"
ID:
createdAt: "2026-05-29T19:36:43+09:00"
---
## Type alias RegionalText

RegionalText: {  
\[lang: string\]: string;  
}

多言語対応文字列

- TextAlive の表示言語に応じて表示が切り替わる
- 現状、 `ja` キーで日本語、 `en` キーで英語の表記を指定可能

String type with multi-language support (`ja` for Japanese and `en` for English)