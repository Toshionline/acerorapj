import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です。web/.env.local を作成してください (web/.env.example 参照)。",
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
});

export const ITEM_MEDIA_BUCKET = "item-media";

export function publicMediaUrl(path: string): string {
  return supabase.storage.from(ITEM_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
