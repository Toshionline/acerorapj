// P3-B2 : マッチ理由を 1〜2 文で生成し matches.reason にキャッシュする。
// 生成は非同期 (202 を即返す)。フロントは Realtime の match_updated で受け取る。
import { fail, json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { chatJSON } from "../_shared/openai.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function background(task: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task);
  } else {
    task.catch((err) => console.error("background task failed", err));
  }
}

type MatchRow = {
  id: string;
  total_score: number;
  asset_score: number;
  service_score: number;
  geo_score: number;
  urgency_score: number;
  trust_score: number;
  distance_km: number | null;
  reason: string | null;
  items: { title: string; description: string | null; category: string; quantity: number; pickup_deadline: string | null } | null;
  needs: { title: string; description: string | null; category: string | null } | null;
};

async function generate(supabase: SupabaseClient, matchId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, total_score, asset_score, service_score, geo_score, urgency_score, trust_score, distance_km, reason," +
        " items(title, description, category, quantity, pickup_deadline)," +
        " needs(title, description, category)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (error || !data) {
    console.error("explain-match: match not found", matchId, error?.message);
    return;
  }
  const match = data as unknown as MatchRow;
  if (match.reason) return;   // 同じ入力で二度呼ばない

  const result = await chatJSON<{ reason: string }>(
    [
      "あなたは B2B の資産リユース・マッチングの説明担当です。",
      "スコア内訳と両者のテキストから、なぜこのマッチが良いのかを日本語 1〜2 文で説明してください。",
      "数字を 1 つだけ引用し、断定しすぎない表現にします。営業文句は書かないでください。",
      'JSON で {"reason": "..."} を返してください。',
    ].join("\n"),
    [{
      type: "text",
      text: JSON.stringify({
        item: match.items,
        need: match.needs,
        scores: {
          total: match.total_score,
          asset: match.asset_score,
          service: match.service_score,
          geo: match.geo_score,
          urgency: match.urgency_score,
          trust: match.trust_score,
          distance_km: match.distance_km,
        },
      }),
    }],
  );

  if (!result?.reason) return;   // 失敗時は空のまま (画面はスコア内訳だけを出す)
  const { error: updateError } = await supabase
    .from("matches")
    .update({ reason: result.reason.slice(0, 400), reason_generated_at: new Date().toISOString() })
    .eq("id", matchId);
  if (updateError) console.error("explain-match: update failed", updateError.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("method not allowed", 405);

  let matchId: string | undefined;
  try {
    ({ match_id: matchId } = await req.json() as { match_id?: string });
  } catch {
    return fail("invalid JSON body");
  }
  if (!matchId) return fail("match_id is required");

  background(generate(serviceClient(), matchId));
  return json({ queued: true }, 202);
});
