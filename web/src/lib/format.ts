import type { Item } from "./types";

// 掲載終了 (取り下げ/期限切れ) と引渡完了は、残り日数を出すと
// ステータス表示と矛盾するのでカウントダウンを出さない。
export function showsCountdown(status: Item["status"]): boolean {
  return status === "available" || status === "reserved";
}

// 一覧・カードの期限表示。カウントダウンを出さないステータスでは日時のみ、
// 期限未設定は deadlineLabel と同じ文言に揃える。
export function itemDeadlineLabel(
  iso: string | null,
  status: Item["status"],
): { text: string; urgent: boolean } {
  if (showsCountdown(status)) return deadlineLabel(iso);
  if (!iso) return { text: "期限未設定", urgent: false };
  return { text: `撤去期限 ${dateTime(iso)}`, urgent: false };
}

// スコアや適合度は画面に出さない。並び順はサーバ側 (total_score) に任せる。
export function deadlineLabel(iso: string | null): { text: string; urgent: boolean } {
  if (!iso) return { text: "期限未設定", urgent: false };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "撤去期限切れ", urgent: true };
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) {
    return { text: `撤去まで残り ${hours} 時間`, urgent: true };
  }
  return { text: `撤去まで残り ${Math.floor(hours / 24)} 日`, urgent: false };
}

export function dateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
