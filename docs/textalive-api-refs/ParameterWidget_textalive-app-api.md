---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html"
ID:
createdAt: "2026-05-29T19:29:46+09:00"
---
## Interface ParameterWidget

リリックアプリ、スタイル、テンプレートで調整可能なパラメタ

Parameters that can be customized in lyric apps, styles, and templates

interface ParameterWidget {  
[className](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html#className)?: string;  
[initialValue](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html#initialValue)?: [ParameterValue](https://developer.textalive.jp/packages/textalive-app-api/types/ParameterValue.html);  
[name](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html#name): string;  
[params](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html#params)?: (string | number | boolean | \[string | number | boolean, string?\] | {  
\[value: string\]: string;  
})\[\];  
[title](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html#title)?: string | [RegionalText](https://developer.textalive.jp/packages/textalive-app-api/types/RegionalText.html);  
}

## Properties

### Optional className

className?: string

パラメタの種類（例: `Slider` ）

Type of this variable (e.g. `Slider`)

### Optional initialValue

initialValue?: [ParameterValue](https://developer.textalive.jp/packages/textalive-app-api/types/ParameterValue.html)

パラメタの初期値

Initial value for this parameter variable

### name

name: string

パラメタの名前

Name of this parameter variable

### Optional params

params?: (string | number | boolean | \[string | number | boolean, string?\] | {  
\[value: string\]: string;  
})\[\]

パラメタのオプション（例: [ParameterWidget.className](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ParameterWidget.html#className) が `Slider` のとき `[0, 100]` で値域 `0` から `100` のスライダーウィジェットが出現）

Options for constructing a parameter widget parsed from description e.g. `[0, 100]`

### Optional title

title?: string | [RegionalText](https://developer.textalive.jp/packages/textalive-app-api/types/RegionalText.html)

ユーザに提示するパラメタの名前

Human-readable representation of this varible