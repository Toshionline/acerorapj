// OpenAI 呼び出しはここに集約する。キーが無い / 失敗する場合は必ず null を返し、
// 呼び出し側がフォールバックへ落ちられるようにする (会場のネットワーク対策)。

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 384;

export function hasOpenAI(): boolean {
  return Boolean(Deno.env.get("OPENAI_API_KEY"));
}

function apiKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!hasOpenAI() || texts.length === 0) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!res.ok) {
      console.error("openai embeddings failed", res.status, await res.text());
      return null;
    }
    const body = await res.json() as { data: { index: number; embedding: number[] }[] };
    // 疎配列だと every() が穴を読み飛ばして欠損を見逃すので null 埋めしてから検査する
    const out: (number[] | null)[] = Array.from({ length: texts.length }, () => null);
    for (const row of body.data) out[row.index] = row.embedding;
    const complete = out.every((v) => Array.isArray(v) && v.length === EMBEDDING_DIMENSIONS);
    return complete ? out as number[][] : null;
  } catch (err) {
    console.error("openai embeddings error", err);
    return null;
  }
}

type ChatContent = string | { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

// JSON だけを返させる薄いラッパー。パースできなければ null (画面を壊さない)。
export async function chatJSON<T>(
  system: string,
  content: ChatContent[],
  model = "gpt-4o-mini",
  timeoutMs = 15000,
): Promise<T | null> {
  if (!hasOpenAI()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) {
      console.error("openai chat failed", res.status, await res.text());
      return null;
    }
    const body = await res.json() as { choices: { message: { content: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("openai chat error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
