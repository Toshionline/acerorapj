// P1-B1 : public.recompute_matches() の薄いラッパー。
// 契約は docs/edge-function-contracts.md を参照。
import { fail, json, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

type Body = { item_id?: string | null; need_id?: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("method not allowed", 405);

  let body: Body = {};
  try {
    body = await req.json() as Body;
  } catch {
    body = {};
  }

  try {
    const supabase = serviceClient();
    const { data, error } = await supabase.rpc("recompute_matches", {
      p_item_id: body.item_id ?? null,
      p_need_id: body.need_id ?? null,
    });
    if (error) return fail(error.message, 500);
    return json({ matches: data ?? 0 });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
});
