// 供給元「東京オフィス移転パートナーズ」(integration_sources 77777777-...-000000000001) の
// CSV を NormalizedSupplyItem に変換する adapter。docs/adapter-contract.md の契約に従う。
//
// ヘッダ: 管理番号,品名,分類,数量,状態ランク,所在地,搬出期限,写真URL
import { headerIndex, parseCsv } from "./csv.ts";
import type { AdapterResult, ItemCategory, NormalizedSupplyItem, SupplyAdapter } from "./types.ts";

const SOURCE_ID = "77777777-7777-4777-8777-000000000001";

const COLUMNS = {
  external_id: "管理番号",
  title: "品名",
  category: "分類",
  quantity: "数量",
  condition: "状態ランク",
  location: "所在地",
  pickup_deadline: "搬出期限",
  media: "写真URL",
} as const;

const CATEGORY_RULES: [RegExp, ItemCategory][] = [
  [/(デスク|机|テーブル|desk|table)/i, "desk"],
  [/(チェア|椅子|イス|いす|chair)/i, "chair"],
  [/(モニタ|ディスプレイ|monitor|display)/i, "monitor"],
  [/(ホワイトボード|whiteboard)/i, "whiteboard"],
  [/(キャビネット|書庫|ロッカー|収納|棚|cabinet|locker)/i, "cabinet"],
  [/(パーティション|間仕切り|partition)/i, "partition"],
];

const CONDITION_BY_RANK: Record<string, NormalizedSupplyItem["condition"]> = {
  A: "excellent",
  B: "good",
  C: "fair",
};

export function toCategory(raw: string): ItemCategory {
  for (const [re, category] of CATEGORY_RULES) {
    if (re.test(raw)) return category;
  }
  return "other";
}

// "32台" / "20 pcs" / "1,200" から正の整数を取り出す。取れなければ null。
export function toQuantity(raw: string): number | null {
  const digits = raw.replace(/[，,]/g, "").replace(/[０-９]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) - 0xfee0)
  );
  const hit = digits.match(/\d+(?:\.\d+)?/);
  if (!hit) return null;
  const value = Number(hit[0]);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

// "2026/09/30" のような日付だけの表記は Asia/Tokyo の 23:59 として解釈する。
// タイムゾーン付きの ISO8601 はそのまま採用する。
export function toDeadline(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const dateOnly = value.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T23:59:00+09:00`;
  }

  const withTz = value.match(/^\d{4}-\d{2}-\d{2}T[\d:]+(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/);
  if (withTz && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();

  return null;
}

function toMediaUrls(raw: string): string[] {
  return raw
    .split(/[\s|]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
}

export const tokyoOfficePartnersAdapter: SupplyAdapter = {
  sourceId: SOURCE_ID,

  parse(input: string): AdapterResult {
    const items: NormalizedSupplyItem[] = [];
    const rejected: { row: number; reason: string }[] = [];

    const rows = parseCsv(input ?? "");
    if (rows.length < 2) return { items, rejected };

    const index = headerIndex(rows[0]);
    const cell = (row: string[], column: string) => {
      const i = index[column];
      return i === undefined ? "" : (row[i] ?? "");
    };

    rows.slice(1).forEach((row, i) => {
      const rowNumber = i + 2; // ヘッダを 1 行目として数える
      const title = cell(row, COLUMNS.title);
      const quantity = toQuantity(cell(row, COLUMNS.quantity));
      const address = cell(row, COLUMNS.location);
      const deadline = toDeadline(cell(row, COLUMNS.pickup_deadline));

      const missing: string[] = [];
      if (!title) missing.push("title");
      if (quantity === null) missing.push("quantity");
      if (!address) missing.push("location");
      if (!deadline) missing.push("pickup_deadline");
      if (missing.length > 0) {
        rejected.push({ row: rowNumber, reason: `必須項目を解決できません: ${missing.join(", ")}` });
        return;
      }

      const externalId = cell(row, COLUMNS.external_id) || `row-${rowNumber}`;
      items.push({
        external_id: externalId,
        title,
        description: null,
        category: toCategory(`${cell(row, COLUMNS.category)} ${title}`),
        quantity: quantity as number,
        condition: CONDITION_BY_RANK[cell(row, COLUMNS.condition).toUpperCase()] ?? null,
        location: { address },
        pickup_deadline: deadline as string,
        media_urls: toMediaUrls(cell(row, COLUMNS.media)),
      });
    });

    return { items, rejected };
  },
};

export default tokyoOfficePartnersAdapter;
