// P2-B2 : 出品写真 1 枚から入力候補を返す (フォームの前埋めのみ。DB には書かない)。
//
// 撤去期限が迫った企業に入力させないことが Rescue 数に直結するので、
// 失敗しても 200 + 全 null を返し、フォームは手入力で完了できるようにする。
import { fail, json, preflight } from "../_shared/cors.ts";
import { serviceClient, userClient } from "../_shared/supabase.ts";
import { chatJSON } from "../_shared/openai.ts";

type Extracted = {
  title: string | null;
  category: "desk" | "chair" | "monitor" | "whiteboard" | "cabinet" | "other" | null;
  quantity: number | null;
  condition: "excellent" | "good" | "fair" | null;
  confidence: number;
};

const EMPTY: Extracted = { title: null, category: null, quantity: null, condition: null, confidence: 0 };
const CATEGORIES = ["desk", "chair", "monitor", "whiteboard", "cabinet", "other"];
const CONDITIONS = ["excellent", "good", "fair"];

function sanitize(raw: Partial<Extracted> | null): Extracted {
  if (!raw) return EMPTY;
  const quantity = typeof raw.quantity === "number" && raw.quantity > 0 ? Math.round(raw.quantity) : null;
  return {
    title: typeof raw.title === "string" && raw.title.trim() !== "" ? raw.title.trim().slice(0, 120) : null,
    category: typeof raw.category === "string" && CATEGORIES.includes(raw.category) ? raw.category as Extracted["category"] : null,
    quantity,
    condition: typeof raw.condition === "string" && CONDITIONS.includes(raw.condition) ? raw.condition as Extracted["condition"] : null,
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("method not allowed", 405);

  let imagePath: string | undefined;
  try {
    ({ image_path: imagePath } = await req.json() as { image_path?: string });
  } catch {
    return json(EMPTY);
  }
  if (!imagePath) return json(EMPTY);

  // パスの先頭は自組織の org_id でなければならない。
  // これが無いと service_role の署名 URL 発行器を他社の写真に向けられる。
  const orgId = imagePath.split("/")[0];
  const { data: membership, error: membershipError } = await userClient(req)
    .from("org_members").select("org_id").eq("org_id", orgId).limit(1);
  if (membershipError || !membership?.length) {
    return fail("forbidden: image_path must start with your org id", 403);
  }

  try {
    const supabase = serviceClient();
    // 公開バケットだが、Edge Function からは署名 URL を作って LLM に渡す (パスの推測を許さない)
    const { data: signed } = await supabase.storage.from("item-media").createSignedUrl(imagePath, 120);
    if (!signed?.signedUrl) return json(EMPTY);

    const extracted = await chatJSON<Partial<Extracted>>(
      [
        "あなたはオフィス什器の査定担当です。写真からフリマ出品の下書きを作ります。",
        'JSON で {"title": string|null, "category": "desk"|"chair"|"monitor"|"whiteboard"|"cabinet"|"other"|null, "quantity": number|null, "condition": "excellent"|"good"|"fair"|null, "confidence": number} を返してください。',
        "title は日本語で、寸法や色が読み取れれば含めます。写っている台数が数えられる場合のみ quantity を入れます。",
        "分からない項目は必ず null にしてください (推測で埋めない)。",
      ].join("\n"),
      [
        { type: "text", text: "この写真の什器を出品するための情報を抽出してください。" },
        { type: "image_url", image_url: { url: signed.signedUrl } },
      ],
      "gpt-4o-mini",
      8000,
    );

    return json(sanitize(extracted));
  } catch (err) {
    console.error("extract-item failed", err);
    return json(EMPTY);
  }
});
