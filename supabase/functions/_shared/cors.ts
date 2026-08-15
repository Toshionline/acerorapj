// 全 Edge Function で共有する CORS / レスポンスヘルパー (Phase 0 で凍結)。
// 各関数の実装は担当 B が Phase 1 以降で追加する。

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}
