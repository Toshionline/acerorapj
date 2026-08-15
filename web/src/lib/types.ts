// OFFICE RELAY のドメイン型。DB 生成型 (database.types.ts) を補完する画面用の型。

export type OrgType = "donor" | "startup" | "logistics" | "partner";

export type Organization = {
  id: string;
  name: string;
  org_type: OrgType;
  verified: boolean;
  nearest_station: string | null;
  area_label: string | null;
  relay_credits: number;
  completed_transfers: number;
};

export type Item = {
  id: string;
  owner_org_id: string;
  title: string;
  description: string | null;
  category: string;
  quantity: number;
  condition: string | null;
  pickup_deadline: string | null;
  status: "available" | "reserved" | "transferred" | "expired";
  created_at: string;
  item_media?: { id: string; storage_path: string }[];
  organizations?: Pick<Organization, "id" | "name" | "nearest_station" | "area_label">;
};

export type Need = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number | null;
  max_distance_km: number | null;
  latest_needed_at: string | null;
  status: "open" | "fulfilled" | "closed";
  created_at: string;
};

export type ServiceEntry = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
};

export type Match = {
  id: string;
  item_id: string;
  need_id: string;
  donor_org_id: string;
  recipient_org_id: string;
  asset_score: number;
  service_score: number;
  geo_score: number;
  urgency_score: number;
  trust_score: number;
  total_score: number;
  distance_km: number | null;
  service_note: string | null;
  status: "proposed" | "accepted" | "declined" | "expired";
  accepted_at: string | null;
  // 双方承諾。両方揃うと status='accepted' になり Transfer が生成される。
  donor_accepted_at: string | null;
  recipient_accepted_at: string | null;
  created_at: string;
  items?: Item;
  needs?: Need;
  // transfers.match_id が UNIQUE なので PostgREST は配列ではなく単一オブジェクトで埋め込む。
  transfers?: Transfer | Transfer[] | null;
};

export type Transfer = {
  id: string;
  match_id: string;
  delivery_method: string | null;
  scheduled_at: string | null;
  status: "pending" | "scheduled" | "completed" | "cancelled";
  completion_code: string | null;
  completed_at: string | null;
};

export type MatchLocation = {
  match_id: string;
  donor_org_id: string;
  donor_name: string;
  nearest_station: string | null;
  area_label: string | null;
  distance_km: number | null;
  exact_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  access_note: string | null;
};

export type IntegrationSource = {
  id: string;
  name: string;
  source_type: "csv" | "api" | "sftp" | "webhook";
  spec_url: string | null;
  sample_csv: string | null;
  contact_email: string | null;
  status: "draft" | "building" | "review" | "active" | "failed";
  created_at: string;
};

export type DevinJobStep = { label: string; state: "done" | "running" | "pending"; at?: string };

export type DevinJob = {
  id: string;
  source_id: string | null;
  devin_session_id: string | null;
  session_url: string | null;
  status: "queued" | "running" | "blocked" | "finished" | "failed";
  pr_url: string | null;
  summary: string | null;
  steps: DevinJobStep[];
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

export type RelayCreditEvent = {
  id: string;
  org_id: string;
  delta: number;
  reason: string;
  created_at: string;
};

// 出品・ニーズ登録で使う東京都内のプリセット拠点 (PostGIS geography に EWKT で渡す)
export const LOCATIONS = [
  { label: "渋谷 (JR渋谷駅)", lng: 139.701636, lat: 35.658034 },
  { label: "恵比寿 (JR恵比寿駅)", lng: 139.710106, lat: 35.64669 },
  { label: "品川 (JR品川駅)", lng: 139.738999, lat: 35.628471 },
  { label: "新橋 (JR新橋駅)", lng: 139.758587, lat: 35.665498 },
  { label: "五反田 (JR五反田駅)", lng: 139.723486, lat: 35.626446 },
  { label: "中目黒 (東急中目黒駅)", lng: 139.69915, lat: 35.644484 },
] as const;

export function ewkt(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

export const CATEGORIES = [
  { value: "desk", label: "デスク" },
  { value: "chair", label: "チェア" },
  { value: "monitor", label: "モニター" },
  { value: "whiteboard", label: "ホワイトボード" },
  { value: "cabinet", label: "書庫・収納" },
  { value: "partition", label: "パーテーション" },
  { value: "sofa", label: "ソファ" },
  { value: "other", label: "その他" },
] as const;

export function categoryLabel(value: string | null): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value ?? "-";
}
