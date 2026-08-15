// service_role クライアント。Edge Function の中だけで使い、鍵をクライアントに出さない。
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// 呼び出したユーザーの JWT をそのまま使うクライアント (RLS を効かせたいとき)。
export function userClient(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY is not configured");
  }
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}
