# Supply Adapter 契約 (P4-B1)

Connector Factory (Devin) が実装する adapter が満たすべき契約。
**Devin セッションのプロンプトはこのファイルを最初に読ませる。** ここに書かれていない挙動は実装しない。

adapter の役割はただ 1 つ:

> 供給元 (オフィス移転業者・什器商社) のデータ 1 レコードを `NormalizedSupplyItem` に変換する。

DB への書き込み・マッチング・通知は adapter の責務ではない。取り込みは OFFICE RELAY 側が行う。

---

## 型

```ts
export type NormalizedSupplyItem = {
  external_id: string;          // 供給元でのレコード ID (再取り込みの冪等キー)
  title: string;                // 例: "エグゼクティブデスク W1600"
  description: string | null;
  category: ItemCategory;       // 下の対応表で正規化する
  quantity: number;             // 1 以上の整数
  condition: "excellent" | "good" | "fair" | null;
  location: { lat: number; lon: number } | { address: string };
  pickup_deadline: string;      // ISO8601 (撤去期限)。ここが NSM の分母になる
  media_urls: string[];         // 空配列可
};

export type ItemCategory =
  | "desk" | "chair" | "monitor" | "whiteboard" | "cabinet" | "partition" | "other";

export type AdapterResult = {
  items: NormalizedSupplyItem[];
  rejected: { row: number; reason: string }[];
};

export interface SupplyAdapter {
  readonly sourceId: string;
  parse(input: string): AdapterResult;   // CSV 文字列 / JSON 文字列
}
```

## 必須ルール

1. **欠損は拒否**: `title` / `quantity` / `location` / `pickup_deadline` のいずれかが取れないレコードは
   `items` に入れず `rejected` に理由付きで積む。**推測で埋めない。**
2. `quantity` は正の整数。`"20台"` / `"20 pcs"` からの数値抽出は可。0 以下・解析不能は拒否。
3. `pickup_deadline` は ISO8601 (タイムゾーン付き) に正規化する。`2026/09/30` のような曖昧な表記は
   Asia/Tokyo の 23:59 として解釈してよい。過去日付は拒否しない (取り込み側で `expired` になる)。
4. `category` は上記の列挙に写像する。判定できなければ `other`。**新しい値を勝手に増やさない。**
5. 例外を投げない。1 行の失敗で全体を落とさず、必ず `rejected` に落とす。
6. 副作用禁止: ネットワークアクセス・DB アクセス・環境変数の読み取りをしない。純粋な変換関数にする。
7. secret をコミットしない。サンプルデータは匿名化する。
8. コアのマッチングロジック (`supabase/migrations/*_matching.sql`) と既存マイグレーションは変更しない。

## 実装場所とテスト

```
supabase/functions/_shared/adapters/<source_slug>.ts       実装 (SupplyAdapter を default export)
supabase/functions/_shared/adapters/<source_slug>.test.ts  fixture を使ったユニットテスト
```

テストに必ず含めるケース:

- 正常な 2 行以上の変換
- `pickup_deadline` 欠損 → `rejected`
- `quantity` が `"20台"` 表記 → `20`
- 未知のカテゴリ表記 → `other`

`deno test supabase/functions/_shared/adapters/` が通ること、`deno check` が通ることを PR の説明に書く。

## カテゴリ対応表 (最低限)

| 供給元の表記例 | category |
|---|---|
| デスク / 机 / テーブル / desk | `desk` |
| チェア / 椅子 / イス / chair | `chair` |
| モニタ / ディスプレイ / monitor | `monitor` |
| ホワイトボード / whiteboard | `whiteboard` |
| キャビネット / 書庫 / ロッカー | `cabinet` |
| パーティション / 間仕切り | `partition` |
| 上記以外 | `other` |
