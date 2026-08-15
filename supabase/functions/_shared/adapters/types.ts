// docs/adapter-contract.md の型。adapter は DB / ネットワークに触らない純粋な変換関数。
export type ItemCategory =
  | "desk"
  | "chair"
  | "monitor"
  | "whiteboard"
  | "cabinet"
  | "partition"
  | "other";

export type NormalizedSupplyItem = {
  external_id: string;
  title: string;
  description: string | null;
  category: ItemCategory;
  quantity: number;
  condition: "excellent" | "good" | "fair" | null;
  location: { lat: number; lon: number } | { address: string };
  pickup_deadline: string;
  media_urls: string[];
};

export type AdapterResult = {
  items: NormalizedSupplyItem[];
  rejected: { row: number; reason: string }[];
};

export interface SupplyAdapter {
  readonly sourceId: string;
  parse(input: string): AdapterResult;
}
