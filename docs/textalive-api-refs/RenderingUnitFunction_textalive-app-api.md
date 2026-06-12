---
source: "https://developer.textalive.jp/packages/textalive-app-api/types/RenderingUnitFunction.html"
ID:
createdAt: "2026-05-29T19:36:52+09:00"
---
- [textalive-app-api](https://developer.textalive.jp/packages/textalive-app-api/modules.html)
- [RenderingUnitFunction](https://developer.textalive.jp/packages/textalive-app-api/types/RenderingUnitFunction.html)

## Type alias RenderingUnitFunction

RenderingUnitFunction: ((now, u) => void)

定期的に呼び出される描画用関数 / Rendering function that runs periodically

#### Type declaration

- - (now, u): void
		- #### Parameters
		- now: number
		- u: [IRenderingUnit](https://developer.textalive.jp/packages/textalive-app-api/interfaces/IRenderingUnit.html)