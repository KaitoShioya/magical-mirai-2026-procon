---
source: "https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html"
ID:
createdAt: "2026-05-29T19:33:59+09:00"
---
## Interface ValenceArousalValue

V/A空間の座標値

- 感情価、覚醒度とも `[-1, 1]` の範囲に正規化された値
- 曲内の相対的な変化 **ではなく** 曲間で比較可能な絶対値

Valence arousal data

- Both valence and arousal values range from -1 to 1
- The values do NOT represent relative changes within a song but absolute values comparable with values in other songs

interface ValenceArousalValue {  
[a](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html#a): number;  
[v](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html#v): number;  
}

##### Index

### Properties

[a](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html#a) [v](https://developer.textalive.jp/packages/textalive-app-api/interfaces/ValenceArousalValue.html#v)

## Properties

### a

a: number

覚醒度 \[-1, 1\]

Arousal \[-1, 1\]

### v

v: number

感情価 \[-1, 1\]

Valence \[-1, 1\]