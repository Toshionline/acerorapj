import { publicMediaUrl, supabase } from "./supabase";
import type { Item, Match } from "./types";

// 一覧・詳細で読むのは公開情報のみ (RLS: items_select_authenticated /
// item_media_select_authenticated)。正確な引取住所は org_locations 側にあり、
// マッチ承諾後にのみ RLS が返す。
const ITEM_COLUMNS = [
  "id,owner_org_id,title,description,category,quantity,condition,pickup_deadline,status,created_at",
  "item_media(id,storage_path)",
  "organizations(id,name,nearest_station,area_label)",
].join(",");

// Matches.tsx の MATCH_COLUMNS と同じ select 記法。写真が必要なので item_media を join する。
const MATCH_COLUMNS = [
  "id,item_id,need_id,donor_org_id,recipient_org_id",
  "asset_score,service_score,geo_score,urgency_score,trust_score,total_score",
  "distance_km,service_note,status,accepted_at,created_at",
  "items(id,owner_org_id,title,category,quantity,condition,pickup_deadline,status,item_media(id,storage_path),organizations(id,name,nearest_station,area_label))",
  "needs(id,title,quantity,latest_needed_at)",
].join(",");

export const ITEM_STATUS_LABEL: Record<Item["status"], string> = {
  available: "掲載中",
  reserved: "承諾済み",
  transferred: "引渡完了",
  // 取り下げも DB 上は expired なので「期限切れ」と断定しない
  expired: "掲載終了",
};

export async function loadItem(id: string): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as Item;
}

// 以下は探索ホーム (Explore) / 検索 (Search) 用。
export async function loadAvailableItems(limit = 40): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("status", "available")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Item[];
}

export async function loadOrgItems(orgId: string, limit = 40): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("owner_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Item[];
}

// 検索はこの 1 関数に隔離してある。将来 pgvector のセマンティック検索
// (match_items RPC 等) に差し替えるときも、呼び出し側は変更しないで済む。
// status の絞り込みは limit より先にサーバ側で効かせる。
export async function searchItems({
  q,
  category,
  availableOnly = true,
  limit = 40,
}: {
  q?: string;
  category?: string | null;
  availableOnly?: boolean;
  limit?: number;
}): Promise<Item[]> {
  let query = supabase.from("items").select(ITEM_COLUMNS);
  if (availableOnly) query = query.eq("status", "available");
  if (category) query = query.eq("category", category);
  const keyword = (q ?? "").trim();
  if (keyword) {
    // ilike の部分一致。値をダブルクォートで囲んで or() のパーサに解釈させない。
    // クォート自体とワイルドカード (% _) は打ち消せないので落とす。
    const safe = keyword.replace(/["\\]/g, " ").replace(/[%_]/g, " ").trim();
    if (safe) query = query.or(`title.ilike."%${safe}%",description.ilike."%${safe}%"`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Item[];
}

export async function loadTopMatches(orgId: string, limit = 10): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .or(`donor_org_id.eq.${orgId},recipient_org_id.eq.${orgId}`)
    .order("total_score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Match[];
}

export function itemPhotoUrl(item: Item | undefined | null): string | null {
  const media = item?.item_media?.[0];
  return media ? publicMediaUrl(media.storage_path) : null;
}

export function itemPlaceLabel(item: Item | undefined | null): string {
  const org = item?.organizations;
  if (!org) return "-";
  return [org.name, org.nearest_station].filter(Boolean).join(" / ");
}
