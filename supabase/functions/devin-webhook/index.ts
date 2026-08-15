// P4-B3 : Devin / GitHub からの進捗を devin_jobs に反映する。
// verify_jwt = false なので、必ず x-office-relay-secret で検証する。
import { fail, json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { completeAll, Step } from "../_shared/connector.ts";

type Body = {
  session_id?: string;
  status?: "queued" | "running" | "blocked" | "finished" | "failed";
  pr_url?: string | null;
  summary?: string | null;
  steps?: Step[];
};

const VALID_STATUS = ["queued", "running", "blocked", "finished", "failed"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("method not allowed", 405);

  const expected = Deno.env.get("DEVIN_WEBHOOK_SECRET");
  if (!expected || req.headers.get("x-office-relay-secret") !== expected) {
    return fail("unauthorized", 401);
  }

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return fail("invalid JSON body");
  }
  if (!body.session_id) return fail("session_id is required");
  if (body.status && !VALID_STATUS.includes(body.status)) return fail(`unknown status: ${body.status}`);

  const supabase = serviceClient();
  const { data: job, error: jobError } = await supabase
    .from("devin_jobs")
    .select("id, source_id, steps, status")
    .eq("devin_session_id", body.session_id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError) return fail(jobError.message, 500);
  if (!job) return fail(`no devin job for session ${body.session_id}`, 404);

  const finished = body.status === "finished" || body.status === "failed";
  const steps = body.steps ?? (finished ? completeAll((job.steps ?? []) as Step[]) : (job.steps ?? []) as Step[]);

  const { error: updateError } = await supabase
    .from("devin_jobs")
    .update({
      status: body.status ?? job.status,
      pr_url: body.pr_url ?? undefined,
      summary: body.summary ?? undefined,
      steps,
      ...(finished ? { completed_at: new Date().toISOString() } : {}),
      ...(body.status === "failed" ? { error_message: body.summary ?? "devin session failed" } : {}),
    })
    .eq("id", job.id);
  if (updateError) return fail(updateError.message, 500);

  if (finished && job.source_id) {
    await supabase.from("integration_sources")
      .update({ status: body.status === "finished" ? "review" : "failed" })
      .eq("id", job.source_id);
  }

  return json({ ok: true });
});
