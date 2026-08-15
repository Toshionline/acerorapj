// P2-B1 : relay.embedding_jobs のキューを消化して 384 次元の embedding を埋める。
//
// OPENAI_API_KEY があれば text-embedding-3-small (dimensions=384)。
// 無い / 失敗した場合は DB 内の決定的ハッシュ埋め込み (process_embedding_jobs_fallback) に落として
// provider: "fallback" を返す。どちらの経路でもキューは必ず枯れる。
import { fail, json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { embedTexts, hasOpenAI } from "../_shared/openai.ts";

type Job = { id: string; entity_type: string; entity_id: string; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("method not allowed", 405);

  let limit = 50;
  try {
    const body = await req.json() as { limit?: number };
    if (typeof body.limit === "number" && body.limit > 0) limit = Math.min(body.limit, 200);
  } catch {
    // body なしも許容する (cron から叩くため)
  }

  const supabase = serviceClient();

  if (!hasOpenAI()) {
    const { data, error } = await supabase.rpc("process_embedding_jobs_fallback", { p_limit: limit });
    if (error) return fail(error.message, 500);
    return json({ processed: data ?? 0, provider: "fallback" });
  }

  const { data: jobs, error: claimError } = await supabase.rpc("claim_embedding_jobs", { p_limit: limit });
  if (claimError) return fail(claimError.message, 500);
  const claimed = (jobs ?? []) as Job[];
  if (claimed.length === 0) return json({ processed: 0, provider: "openai" });

  const vectors = await embedTexts(claimed.map((j) => j.content));

  if (!vectors) {
    // OpenAI が使えなかった分はフォールバックで埋め切る (キューに残さない)
    const { data, error } = await supabase.rpc("process_embedding_jobs_fallback", { p_limit: claimed.length });
    if (error) return fail(error.message, 500);
    return json({ processed: data ?? 0, provider: "fallback" });
  }

  let processed = 0;
  for (let i = 0; i < claimed.length; i++) {
    const job = claimed[i];
    const { error } = await supabase.rpc("apply_embedding", { p_job_id: job.id, p_embedding: vectors[i] });
    if (error) {
      console.error("apply_embedding failed", job.id, error.message);
      await supabase.rpc("fail_embedding_job", { p_job_id: job.id, p_error: error.message });
      continue;
    }
    processed++;
  }

  return json({ processed, provider: "openai" });
});
