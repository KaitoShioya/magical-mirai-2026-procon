---
source: "https://developer.textalive.jp/packages/textalive-app-api/classes/TimedUnit.html"
ID:
createdAt: "2026-05-29T19:23:47+09:00"
---
時刻付きオブジェクトの抽象クラス / Abstract implementation of timed object

この抽象クラスを継承し、 `startTime` および `endTime` プロパティを持つクラスを実装することで、時区間駆動APIなどで活用できるようになります。TypeScriptでの簡単な実装例を以下に示します。

By implementing a class that extends this abstract class and has `startTime` and `endTime` properties, it can be utilised by time-range-driven APIs. A simple example implementation in TypeScript is shown below.

```typescript
class MyObject extends TimedUnit {
  constructor(public startTime: number, public endTime: number) {
    super();
  }
}
```

#### Implements

- [TimedObject](https://developer.textalive.jp/packages/textalive-app-api/interfaces/TimedObject.html)

## Accessors

### duration

- get duration(): number