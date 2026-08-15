// Connector Factory の共通ロジック (build-connector / devin-webhook で共有)。
import { chatJSON } from "./openai.ts";

export type Step = { label: string; state: "done" | "running" | "pending"; at: string; detail?: string };

export const BUILD_STEPS: string[] = [
  "供給元の仕様を取得",
  "CSV スキーマを推論",
  "adapter spec を組み立て",
  "Devin セッションを作成",
  "Devin が adapter を実装",
  "テストを実行",
  "PR を作成",
];

export function initialSteps(): Step[] {
  const now = new Date().toISOString();
  return BUILD_STEPS.map((label, i) => ({
    label,
    state: i === 0 ? "running" : "pending",
    at: now,
  }));
}

export function advance(steps: Step[], index: number, detail?: string): Step[] {
  const now = new Date().toISOString();
  return steps.map((s, i) => {
    if (i < index) return { ...s, state: "done" as const };
    if (i === index) return { ...s, state: "running" as const, at: now, detail: detail ?? s.detail };
    return s;
  });
}

export function completeAll(steps: Step[]): Step[] {
  const now = new Date().toISOString();
  return steps.map((s) => ({ ...s, state: "done" as const, at: s.state === "done" ? s.at : now }));
}

export type ColumnMapping = {
  mapping: Record<string, string>;      // NormalizedSupplyItem のフィールド -> CSV 列名
  unmapped_required: string[];          // 埋められなかった必須フィールド
  notes: string | null;
};

const REQUIRED_FIELDS = ["title", "quantity", "location", "pickup_deadline"];

// P4-B4 : CSV ヘッダ + 数行から NormalizedSupplyItem への写像案を作る。
// LLM が使えない場合はヘッダ名のキーワード一致で素朴に推論する (画面は必ず動く)。
export async function inferColumnMapping(sampleCsv: string | null): Promise<ColumnMapping> {
  if (!sampleCsv || sampleCsv.trim() === "") {
    return { mapping: {}, unmapped_required: [...REQUIRED_FIELDS], notes: "サンプル CSV が未登録" };
  }

  const llm = await chatJSON<ColumnMapping>(
    [
      "あなたは OFFICE RELAY の Connector Factory の一部です。",
      "与えられた CSV のヘッダとサンプル行を NormalizedSupplyItem に写像してください。",
      "NormalizedSupplyItem のフィールド: external_id, title, description, category, quantity, condition, location, pickup_deadline, media_urls",
      'JSON で {"mapping": {"<field>": "<csv column>"}, "unmapped_required": ["..."], "notes": "..."} を返してください。',
      "推測で必須フィールド (title / quantity / location / pickup_deadline) を埋めないでください。無ければ unmapped_required に入れます。",
    ].join("\n"),
    [{ type: "text", text: sampleCsv.slice(0, 4000) }],
  );
  if (llm?.mapping) return llm;

  return heuristicMapping(sampleCsv);
}

export function heuristicMapping(sampleCsv: string): ColumnMapping {
  const header = sampleCsv.split(/\r?\n/)[0] ?? "";
  const columns = header.split(",").map((c) => c.trim()).filter(Boolean);
  const rules: [string, RegExp][] = [
    ["external_id", /(id|code|番号|管理)/i],
    ["title", /(title|name|品名|名称|商品)/i],
    ["description", /(desc|備考|説明|memo)/i],
    ["category", /(category|種別|カテゴリ|分類)/i],
    ["quantity", /(qty|quantity|数量|台数|個数)/i],
    ["condition", /(condition|状態|コンディション|ランク)/i],
    ["location", /(location|address|住所|所在|拠点|lat|lon)/i],
    ["pickup_deadline", /(deadline|pickup|撤去|引取|期限|搬出)/i],
    ["media_urls", /(image|photo|写真|画像|url)/i],
  ];

  const mapping: Record<string, string> = {};
  for (const [field, re] of rules) {
    const hit = columns.find((c) => re.test(c));
    if (hit) mapping[field] = hit;
  }
  return {
    mapping,
    unmapped_required: REQUIRED_FIELDS.filter((f) => !(f in mapping)),
    notes: "ヘッダ名のキーワード一致による推論 (LLM 未使用)",
  };
}

export function buildDevinPrompt(source: {
  id: string;
  name: string;
  source_type: string;
  spec_url: string | null;
  sample_csv: string | null;
}, mapping: ColumnMapping, repoUrl: string): string {
  const slug = source.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || source.id;
  return [
    `${repoUrl} の OFFICE RELAY に、新しい供給元「${source.name}」(${source.source_type}) の supply adapter を実装してください。`,
    "",
    "手順:",
    "1. まず docs/adapter-contract.md を読み、そこに書かれた契約に厳密に従ってください。",
    `2. supabase/functions/_shared/adapters/${slug}.ts に SupplyAdapter を default export で実装します。`,
    `3. supabase/functions/_shared/adapters/${slug}.test.ts に fixture を使ったユニットテストを追加します。`,
    "4. `deno check` と `deno test supabase/functions/_shared/adapters/` を実行し、結果を PR の説明に貼ってください。",
    "",
    "制約:",
    "- title / quantity / location / pickup_deadline が欠けたレコードは取り込まず rejected に理由付きで積む (推測で埋めない)",
    "- コアのマッチングロジック (supabase/migrations/*_matching.sql) と既存マイグレーションは変更しない",
    "- secret をコミットしない",
    "- adapter は純粋な変換関数にする (DB / ネットワークアクセス禁止)",
    "",
    `source_id: ${source.id}`,
    source.spec_url ? `仕様書: ${source.spec_url}` : "",
    "",
    "列マッピングの推論結果 (検証してから使ってください):",
    "```json",
    JSON.stringify(mapping, null, 2),
    "```",
    "",
    source.sample_csv ? "サンプル CSV:\n```csv\n" + source.sample_csv.slice(0, 4000) + "\n```" : "",
  ].filter(Boolean).join("\n");
}
