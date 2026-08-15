// Devin API クライアント。DEVIN_API_KEY は Edge Function の secret のみに置く。
// キーが無い場合は simulation mode に落ちるので、この module は「呼べるかどうか」を必ず公開する。

const DEVIN_API_BASE = Deno.env.get("DEVIN_API_BASE") ?? "https://api.devin.ai/v1";

export type DevinSession = {
  session_id: string;
  url: string | null;
  status_enum?: string | null;
  structured_output?: Record<string, unknown> | null;
  pull_request?: { url?: string | null } | null;
};

export function hasDevin(): boolean {
  return Boolean(Deno.env.get("DEVIN_API_KEY"));
}

function headers(): HeadersInit {
  const key = Deno.env.get("DEVIN_API_KEY");
  if (!key) throw new Error("DEVIN_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function createSession(prompt: string, idempotent = true): Promise<DevinSession | null> {
  if (!hasDevin()) return null;
  try {
    const res = await fetch(`${DEVIN_API_BASE}/sessions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ prompt, idempotent }),
    });
    if (!res.ok) {
      console.error("devin createSession failed", res.status, await res.text());
      return null;
    }
    return await res.json() as DevinSession;
  } catch (err) {
    console.error("devin createSession error", err);
    return null;
  }
}

export async function getSession(sessionId: string): Promise<DevinSession | null> {
  if (!hasDevin()) return null;
  try {
    const res = await fetch(`${DEVIN_API_BASE}/session/${sessionId}`, { headers: headers() });
    if (!res.ok) {
      console.error("devin getSession failed", res.status, await res.text());
      return null;
    }
    return await res.json() as DevinSession;
  } catch (err) {
    console.error("devin getSession error", err);
    return null;
  }
}

// Devin の status を devin_jobs.status に写す。
export function mapStatus(status: string | null | undefined): "queued" | "running" | "blocked" | "finished" | "failed" {
  switch ((status ?? "").toLowerCase()) {
    case "blocked":
      return "blocked";
    case "finished":
    case "completed":
    case "stopped":
      return "finished";
    case "expired":
    case "failed":
      return "failed";
    case "working":
    case "running":
    case "resumed":
      return "running";
    default:
      return "queued";
  }
}
