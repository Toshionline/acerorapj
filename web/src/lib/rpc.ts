import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// BE (担当 A/B) の RPC と Edge Function はまだ main に入っていない可能性がある。
// docs/edge-function-contracts.md の I/O どおりに呼び、未デプロイなら
// フロント側の等価な操作にフォールバックしてゴールデンパスを止めない。
const untyped = supabase as unknown as SupabaseClient;

// PostgREST が「関数が無い」と返すコード
const MISSING_FUNCTION = ["PGRST202", "42883"];

function isMissing(error: PostgrestError | null): boolean {
  return !!error && MISSING_FUNCTION.includes(error.code);
}

export type RpcMode = "backend" | "fallback";

export async function recomputeMatches(input: { itemId?: string; needId?: string }): Promise<void> {
  const body = { item_id: input.itemId ?? null, need_id: input.needId ?? null };
  const invoked = await supabase.functions.invoke("recompute-matches", { body });
  if (!invoked.error) return;
  // Edge Function が無ければ RPC を直接叩く。それも無ければ黙って諦める
  // (マッチは BE マージ後の trigger / 再計算で埋まる)。
  await untyped.rpc("recompute_matches", { p_item_id: body.item_id, p_need_id: body.need_id });
}

// accept_match は呼んだ組織の承諾だけを記録し、双方揃った場合にのみ Transfer を返す。
export async function acceptMatch(matchId: string, orgId: string): Promise<RpcMode> {
  const { error } = await untyped.rpc("accept_match", { p_match_id: matchId });
  if (!error) return "backend";
  if (!isMissing(error)) throw error;

  const match = await supabase
    .from("matches")
    .select("id,item_id,donor_org_id,recipient_org_id,donor_accepted_at,recipient_accepted_at")
    .eq("id", matchId)
    .single();
  if (match.error) throw match.error;

  const now = new Date().toISOString();
  const donorAt =
    match.data.donor_org_id === orgId ? (match.data.donor_accepted_at ?? now) : match.data.donor_accepted_at;
  const recipientAt =
    match.data.recipient_org_id === orgId
      ? (match.data.recipient_accepted_at ?? now)
      : match.data.recipient_accepted_at;
  const both = !!donorAt && !!recipientAt;

  const updated = await supabase
    .from("matches")
    .update({
      donor_accepted_at: donorAt,
      recipient_accepted_at: recipientAt,
      ...(both ? { status: "accepted", accepted_at: now } : {}),
    })
    .eq("id", matchId);
  if (updated.error) throw updated.error;
  if (!both) return "fallback";

  await supabase.from("items").update({ status: "reserved" }).eq("id", match.data.item_id);
  const transfer = await supabase.from("transfers").insert({ match_id: matchId });
  if (transfer.error && transfer.error.code !== "23505") throw transfer.error;
  return "fallback";
}

export async function declineMatch(matchId: string): Promise<void> {
  const { error } = await supabase.from("matches").update({ status: "declined" }).eq("id", matchId);
  if (error) throw error;
}

// 引渡完了で Relay Credits が加算される。complete_transfer の配点と合わせる
// (donor +100 asset_donated / recipient +30 pickup_completed / サービス合意があれば recipient +80)。
export const CREDIT_DONOR = 100;
export const CREDIT_RECIPIENT = 30;
export const CREDIT_SERVICE = 80;

export async function completeTransfer(transferId: string): Promise<RpcMode> {
  const { error } = await untyped.rpc("complete_transfer", { p_transfer_id: transferId });
  if (!error) return "backend";
  if (!isMissing(error)) throw error;

  const now = new Date().toISOString();
  const completed = await supabase
    .from("transfers")
    .update({ status: "completed", completed_at: now })
    .eq("id", transferId)
    .select("id,match_id")
    .single();
  if (completed.error) throw completed.error;

  const match = await supabase
    .from("matches")
    .select("id,item_id,need_id,donor_org_id,recipient_org_id,service_note")
    .eq("id", completed.data.match_id)
    .single();
  if (match.error) throw match.error;

  const recipientDelta =
    CREDIT_RECIPIENT + (match.data.service_note ? CREDIT_SERVICE : 0);
  const events = [
    {
      org_id: match.data.donor_org_id,
      delta: CREDIT_DONOR,
      reason: "asset_donated",
      match_id: match.data.id,
    },
    {
      org_id: match.data.recipient_org_id,
      delta: CREDIT_RECIPIENT,
      reason: "pickup_completed",
      match_id: match.data.id,
    },
  ];
  if (match.data.service_note) {
    events.push({
      org_id: match.data.recipient_org_id,
      delta: CREDIT_SERVICE,
      reason: "service_delivered",
      match_id: match.data.id,
    });
  }

  await Promise.all([
    supabase.from("items").update({ status: "transferred" }).eq("id", match.data.item_id),
    supabase.from("needs").update({ status: "fulfilled" }).eq("id", match.data.need_id),
    supabase.from("relay_credit_events").insert(events),
    bumpCredits(match.data.donor_org_id, CREDIT_DONOR),
    bumpCredits(match.data.recipient_org_id, recipientDelta),
  ]);
  return "fallback";
}

async function bumpCredits(orgId: string, delta: number): Promise<void> {
  const org = await supabase
    .from("organizations")
    .select("relay_credits,completed_transfers")
    .eq("id", orgId)
    .single();
  if (org.error) return;
  await supabase
    .from("organizations")
    .update({
      relay_credits: org.data.relay_credits + delta,
      completed_transfers: org.data.completed_transfers + 1,
    })
    .eq("id", orgId);
}

export type DashboardSummary = {
  relay_credits: number;
  items_available: number;
  needs_open: number;
  rescued_before_deadline: number;
  top_matches: {
    id: string;
    item_title: string;
    need_title: string;
    total_score: number;
  }[];
  recent_items: {
    id: string;
    title: string;
    status: string;
    pickup_deadline: string | null;
  }[];
  recent_needs: {
    id: string;
    title: string;
    quantity: number | null;
    status: string;
  }[];
};

// §3.7: ダッシュボードは 1 RPC で集計済みの1行を取る。RPC 未デプロイのときだけ
// テーブル直読みにフォールバックする。
export async function loadOrgDashboard(orgId: string): Promise<DashboardSummary> {
  const { data, error } = await untyped.rpc("org_dashboard", { p_org_id: orgId });
  if (!error) return data as DashboardSummary;
  if (!isMissing(error)) throw error;
  return loadOrgDashboardFallback(orgId);
}

async function loadOrgDashboardFallback(orgId: string): Promise<DashboardSummary> {
  const orgFilter = `donor_org_id.eq.${orgId},recipient_org_id.eq.${orgId}`;
  const [org, items, needs, topMatches, rescued] = await Promise.all([
    supabase.from("organizations").select("relay_credits").eq("id", orgId).single(),
    supabase
      .from("items")
      .select("id,title,status,pickup_deadline")
      .eq("owner_org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("needs")
      .select("id,title,quantity,status")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("matches")
      .select("id,total_score,items(title),needs(title)")
      .or(orgFilter)
      .eq("status", "proposed")
      .order("total_score", { ascending: false })
      .limit(5),
    supabase
      .from("transfers")
      .select("id,matches!inner(id)", { count: "exact", head: true })
      .eq("status", "completed")
      .or(orgFilter, { referencedTable: "matches" }),
  ]);

  const itemRows = items.data ?? [];
  const needRows = needs.data ?? [];
  return {
    relay_credits: org.data?.relay_credits ?? 0,
    items_available: itemRows.filter((i) => i.status === "available").length,
    needs_open: needRows.filter((n) => n.status === "open").length,
    rescued_before_deadline: rescued.count ?? 0,
    top_matches: (topMatches.data ?? []).map((m) => {
      const row = m as unknown as {
        id: string;
        total_score: number;
        items?: { title: string } | { title: string }[] | null;
        needs?: { title: string } | { title: string }[] | null;
      };
      const item = Array.isArray(row.items) ? row.items[0] : row.items;
      const need = Array.isArray(row.needs) ? row.needs[0] : row.needs;
      return {
        id: row.id,
        item_title: item?.title ?? "資産",
        need_title: need?.title ?? "ニーズ",
        total_score: row.total_score,
      };
    }),
    recent_items: itemRows,
    recent_needs: needRows,
  };
}

export type ExtractedItem = {
  title: string | null;
  category: string | null;
  quantity: number | null;
  condition: string | null;
  confidence: number;
};

// 写真1枚からの前埋め (P2-B2)。唯一の同期 LLM 呼び出しなので 2 秒で打ち切る。
export async function extractItemFromPhoto(imagePath: string): Promise<ExtractedItem | null> {
  const call = supabase.functions
    .invoke("extract-item", { body: { image_path: imagePath } })
    .then(({ data, error }) => (error ? null : (data as ExtractedItem | null)))
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
  return Promise.race([call, timeout]);
}

export async function explainMatch(matchId: string): Promise<void> {
  await supabase.functions.invoke("explain-match", { body: { match_id: matchId } });
}

export async function buildConnector(sourceId: string): Promise<{
  job_id: string;
  session_url: string | null;
  mode: "live" | "simulation";
}> {
  const { data, error } = await supabase.functions.invoke("build-connector", {
    body: { source_id: sourceId },
  });
  if (error) throw error;
  return data as { job_id: string; session_url: string | null; mode: "live" | "simulation" };
}
