---
source: "https://developer.textalive.jp/packages/textalive-app-api/types/FindTimedObjectOptions.html"
ID:
createdAt: "2026-05-29T19:35:22+09:00"
---
## Type alias FindTimedObjectOptions

FindTimedObjectOptions: {  
endTime?: number;  
} | {  
loose?: boolean;  
}

時刻付きオブジェクトの探索オプション

Find options for sorted timed objects

#### Type declaration

- ##### Optional endTime?: number
	指定された場合、探索対象の時刻とこの時刻情報がなす区間と重複する時刻付きオブジェクトを返す
	When specified, find an object that overlaps with the specified range rather than the timing

#### Type declaration

- ##### Optional loose?: boolean
	指定された場合、時刻付きオブジェクトは必ずしも探索対象の時刻を含んでいなくてもよい（二分探索の結果をそのまま返す）
	When specified, an object does not need to contain the specified timing (result from the binary tree search is always returned)