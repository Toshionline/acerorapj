import { assertEquals } from "jsr:@std/assert@1";
import adapter, { toCategory, toDeadline, toQuantity } from "./tokyo-office-partners.ts";

const HEADER = "管理番号,品名,分類,数量,状態ランク,所在地,搬出期限,写真URL";

const FIXTURE = [
  HEADER,
  "TOP-1001,オフィスデスク W1200 木目,机,32台,B,東京都新宿区西新宿2-1-1,2026/09/30,https://example.com/img/1001.jpg",
  "TOP-1002,事務用回転椅子 肘なし,椅子,48台,C,東京都新宿区西新宿2-1-1,2026/09/30,",
  "TOP-1003,液晶ディスプレイ 24インチ,モニタ,15台,A,東京都新宿区西新宿2-1-1,2026-10-15T18:00:00+09:00,",
].join("\n");

Deno.test("正常な複数行を変換する", () => {
  const { items, rejected } = adapter.parse(FIXTURE);
  assertEquals(rejected, []);
  assertEquals(items.length, 3);
  assertEquals(items[0], {
    external_id: "TOP-1001",
    title: "オフィスデスク W1200 木目",
    description: null,
    category: "desk",
    quantity: 32,
    condition: "good",
    location: { address: "東京都新宿区西新宿2-1-1" },
    pickup_deadline: "2026-09-30T23:59:00+09:00",
    media_urls: ["https://example.com/img/1001.jpg"],
  });
  assertEquals(items[1].category, "chair");
  assertEquals(items[1].condition, "fair");
  assertEquals(items[1].media_urls, []);
  assertEquals(items[2].condition, "excellent");
});

Deno.test("pickup_deadline 欠損は rejected", () => {
  const { items, rejected } = adapter.parse(
    [HEADER, "TOP-2001,オフィスデスク,机,10台,B,東京都新宿区西新宿2-1-1,,"].join("\n"),
  );
  assertEquals(items, []);
  assertEquals(rejected, [{ row: 2, reason: "必須項目を解決できません: pickup_deadline" }]);
});

Deno.test("必須項目が複数欠けても 1 行だけ落として続行する", () => {
  const { items, rejected } = adapter.parse(
    [
      HEADER,
      "TOP-3001,,机,,B,,2026/09/30,",
      "TOP-3002,ミーティングテーブル,机,4台,A,東京都渋谷区代々木1-1-1,2026/09/30,",
    ].join("\n"),
  );
  assertEquals(items.length, 1);
  assertEquals(items[0].external_id, "TOP-3002");
  assertEquals(rejected, [
    { row: 2, reason: "必須項目を解決できません: title, quantity, location" },
  ]);
});

Deno.test("数量は台数表記から抽出し 0 以下・解析不能は拒否する", () => {
  assertEquals(toQuantity("20台"), 20);
  assertEquals(toQuantity("20 pcs"), 20);
  assertEquals(toQuantity("１２台"), 12);
  assertEquals(toQuantity("1,200"), 1200);
  assertEquals(toQuantity("0台"), null);
  assertEquals(toQuantity("応相談"), null);
});

Deno.test("未知のカテゴリ表記は other", () => {
  assertEquals(toCategory("観葉植物"), "other");
  assertEquals(toCategory("収納 スチールロッカー 6人用"), "cabinet");
  assertEquals(toCategory("間仕切り"), "partition");
  assertEquals(toCategory("ホワイトボード 脚付"), "whiteboard");
});

Deno.test("曖昧な日付は Asia/Tokyo 23:59、解析不能は null", () => {
  assertEquals(toDeadline("2026/09/30"), "2026-09-30T23:59:00+09:00");
  assertEquals(toDeadline("2026-9-5"), "2026-09-05T23:59:00+09:00");
  assertEquals(toDeadline("2026-10-15T18:00:00+09:00"), "2026-10-15T09:00:00.000Z");
  assertEquals(toDeadline("年内をめど"), null);
});

Deno.test("引用符付き・空入力でも例外を投げない", () => {
  const { items, rejected } = adapter.parse(
    [HEADER, '"TOP-4001","オフィスデスク, 木目","机","6台","B","東京都港区1-1","2026/12/01",'].join(
      "\n",
    ),
  );
  assertEquals(rejected, []);
  assertEquals(items[0].title, "オフィスデスク, 木目");
  assertEquals(adapter.parse(""), { items: [], rejected: [] });
  assertEquals(adapter.parse(HEADER), { items: [], rejected: [] });
});
