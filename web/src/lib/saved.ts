// 「気になるリスト」はクライアント状態 (localStorage)。
// DB スキーマは変更しないため、org.id ごとのキーで保持する。
import { useCallback, useEffect, useState } from "react";

const PREFIX = "relay.saved.";

function key(orgId: string): string {
  return `${PREFIX}${orgId}`;
}

function read(orgId: string): string[] {
  try {
    const raw = localStorage.getItem(key(orgId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(orgId: string, ids: string[]): void {
  try {
    localStorage.setItem(key(orgId), JSON.stringify(ids));
  } catch {
    // プライベートモード等で書けなくても探索操作は止めない
  }
}

export function savedItemIds(orgId: string): string[] {
  return read(orgId);
}

export function saveItem(orgId: string, itemId: string): string[] {
  const ids = read(orgId);
  if (ids.includes(itemId)) return ids;
  const next = [itemId, ...ids];
  write(orgId, next);
  return next;
}

export function unsaveItem(orgId: string, itemId: string): string[] {
  const next = read(orgId).filter((id) => id !== itemId);
  write(orgId, next);
  return next;
}

// 画面から使うフック。org が未確定の間は空配列を返す。
export function useSavedItems(orgId: string | undefined) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(orgId ? read(orgId) : []);
  }, [orgId]);

  const save = useCallback(
    (itemId: string) => {
      if (!orgId) return;
      setIds(saveItem(orgId, itemId));
    },
    [orgId],
  );

  const unsave = useCallback(
    (itemId: string) => {
      if (!orgId) return;
      setIds(unsaveItem(orgId, itemId));
    },
    [orgId],
  );

  return { ids, save, unsave };
}
