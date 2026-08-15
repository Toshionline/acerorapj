// P4-B2 : Connector Factory の中心。
//
//   integration_sources 取得 -> CSV スキーマ推論 (P4-B4) -> Devin セッション作成 -> devin_jobs 保存 -> polling
//
// DEVIN_API_KEY が無いときは simulation mode で devin_jobs.steps を進める。
// 会場のネットワークが死んでも画面のタイムラインは流れる (デモを止めない)。
import { fail, json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { createSession, getSession, hasDevin, mapStatus } from "../_shared/devin.ts";
import { advance, buildDevinPrompt, completeAll, inferColumnMapping, initialSteps, Step } from "../_shared/connector.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const REPO_URL = Deno.env.get("CONNECTOR_REPO_URL") ?? "https://github.com/Toshionline/acerora2";
const POLL_INTERVAL_MS = 10_000;
const POLL_MAX = 60;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function background(task: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task);
  } else {
    task.catch((err) => console.error("background task failed", err));
  }
}

async function saveSteps(supabase: SupabaseClient, jobId: string, steps: Step[], patch: Record<string, unknown> = {}) {
  const { error } = await supabase.from("devin_jobs").update({ steps, ...patch }).eq("id", jobId);
  if (error) console.error("devin_jobs update failed", error.message);
}

// simulation mode : Devin を呼ばずにタイムラインだけ進める。summary に必ず明記する。
async function runSimulation(supabase: SupabaseClient, jobId: string, sourceId: string, steps: Step[]) {
  let current = steps;
  for (let i = 3; i < current.length; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    current = advance(current, i);
    await saveSteps(supabase, jobId, current, { status: "running" });
  }
  await new Promise((r) => setTimeout(r, 1500));
  await saveSteps(supabase, jobId, completeAll(current), {
    status: "finished",
    summary: "SIMULATION MODE: DEVIN_API_KEY が未設定のため、Devin セッションは作成していません。",
    completed_at: new Date().toISOString(),
  });
  await supabase.from("integration_sources").update({ status: "review" }).eq("id", sourceId);
}

// live mode : セッションの状態を polling して devin_jobs に反映する (webhook が来ない環境の保険)。
async function pollSession(supabase: SupabaseClient, jobId: string, sourceId: string, sessionId: string, steps: Step[]) {
  let current = steps;
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    // webhook が先に終了状態を書いていることがある。polling で巻き戻さない。
    const { data: job } = await supabase.from("devin_jobs")
      .select("status, pr_url").eq("id", jobId).single();
    if (job?.status === "finished" || job?.status === "failed") return;

    const session = await getSession(sessionId);
    if (!session) continue;

    const status = mapStatus(session.status_enum);
    const prUrl = session.pull_request?.url ?? job?.pr_url ?? null;
    if (prUrl) current = advance(current, current.length - 1, prUrl);
    else if (status === "running") current = advance(current, 4);

    const finished = status === "finished" || status === "failed";
    await saveSteps(supabase, jobId, finished ? completeAll(current) : current, {
      status,
      // 取得できなかった回に null で上書きして PR リンクを消さない
      ...(prUrl ? { pr_url: prUrl } : {}),
      ...(finished ? { completed_at: new Date().toISOString() } : {}),
    });

    if (finished) {
      await supabase.from("integration_sources")
        .update({ status: status === "finished" ? "review" : "failed" })
        .eq("id", sourceId);
      return;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("method not allowed", 405);

  let sourceId: string | undefined;
  try {
    ({ source_id: sourceId } = await req.json() as { source_id?: string });
  } catch {
    return fail("invalid JSON body");
  }
  if (!sourceId) return fail("source_id is required");

  const supabase = serviceClient();

  const { data: source, error: sourceError } = await supabase
    .from("integration_sources")
    .select("id, name, source_type, spec_url, sample_csv")
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) return fail(`integration source not found: ${sourceId}`, 404);

  let steps = initialSteps();
  const { data: job, error: jobError } = await supabase
    .from("devin_jobs")
    .insert({ source_id: source.id, status: "queued", steps })
    .select("id")
    .single();
  if (jobError || !job) return fail(jobError?.message ?? "failed to create job", 500);
  await supabase.from("integration_sources").update({ status: "building" }).eq("id", source.id);

  steps = advance(steps, 1);
  await saveSteps(supabase, job.id, steps);

  const mapping = await inferColumnMapping(source.sample_csv);
  steps = advance(steps, 2, JSON.stringify(mapping.mapping));
  await saveSteps(supabase, job.id, steps);

  const prompt = buildDevinPrompt(source, mapping, REPO_URL);

  if (!hasDevin()) {
    steps = advance(steps, 3, "SIMULATION MODE");
    await saveSteps(supabase, job.id, steps, { status: "running" });
    background(runSimulation(supabase, job.id, source.id, steps));
    return json({ job_id: job.id, devin_session_id: null, session_url: null, mode: "simulation" }, 202);
  }

  const session = await createSession(prompt);
  if (!session) {
    await saveSteps(supabase, job.id, steps, {
      status: "failed",
      error_message: "Devin API へのセッション作成に失敗しました",
      completed_at: new Date().toISOString(),
    });
    await supabase.from("integration_sources").update({ status: "failed" }).eq("id", source.id);
    return fail("failed to create devin session", 502);
  }

  steps = advance(steps, 4);
  await saveSteps(supabase, job.id, steps, {
    status: "running",
    devin_session_id: session.session_id,
    session_url: session.url ?? null,
  });

  background(pollSession(supabase, job.id, source.id, session.session_id, steps));

  return json({
    job_id: job.id,
    devin_session_id: session.session_id,
    session_url: session.url ?? null,
    mode: "live",
  }, 202);
});
