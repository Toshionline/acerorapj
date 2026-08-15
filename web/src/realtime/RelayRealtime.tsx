import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import type { Match } from "../lib/types";

export type RelayEvent = {
  id: string;
  kind:
    | "match_found"
    | "match_accept_pending"
    | "match_accepted"
    | "match_declined"
    | "match_expired"
    | "transfer_scheduled"
    | "transfer_completed";
  at: string;
  title: string;
  matchId: string | null;
};

type RealtimeState = {
  events: RelayEvent[];
  latestMatch: RelayEvent | null;
  connected: boolean;
  dismissLatest: () => void;
  clear: () => void;
};

const RealtimeContext = createContext<RealtimeState | null>(null);

const MATCH_EVENTS = [
  "match_found",
  "match_accept_pending",
  "match_accepted",
  "match_declined",
  "match_expired",
] as const;
const TRANSFER_EVENTS = ["transfer_scheduled", "transfer_completed"] as const;

const LABELS: Record<RelayEvent["kind"], string> = {
  match_found: "新しいマッチが見つかりました",
  match_accept_pending: "相手が承諾しました。あなたの承諾待ちです",
  match_accepted: "マッチが承諾されました",
  match_declined: "マッチが見送られました",
  match_expired: "マッチの期限が切れました",
  transfer_scheduled: "引渡が予定されました",
  transfer_completed: "引渡が完了しました",
};

// 接続は org ごとに1本に集約する。画面ごとに張り直さない (§3.7)。
export function RelayRealtime({ children }: { children: React.ReactNode }) {
  const { org, session } = useAuth();
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [latestMatch, setLatestMatch] = useState<RelayEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const orgId = org?.id;

  const push = useCallback((event: RelayEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, 20));
    if (event.kind === "match_found") setLatestMatch(event);
  }, []);

  useEffect(() => {
    if (!orgId || !session) return;
    supabase.realtime.setAuth(session.access_token);

    const channel: RealtimeChannel = supabase.channel(`org:${orgId}:matches`, {
      config: { private: true },
    });

    for (const kind of MATCH_EVENTS) {
      channel.on("broadcast", { event: kind }, ({ payload }) => {
        const record = (payload as { record?: Match }).record;
        push({
          id: `${kind}-${record?.id ?? Date.now()}`,
          kind,
          at: new Date().toISOString(),
          title: LABELS[kind],
          matchId: record?.id ?? null,
        });
      });
    }
    for (const kind of TRANSFER_EVENTS) {
      channel.on("broadcast", { event: kind }, () => {
        push({
          id: `${kind}-${Date.now()}`,
          kind,
          at: new Date().toISOString(),
          title: LABELS[kind],
          matchId: null,
        });
      });
    }

    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
    // org オブジェクト自体は Relay Credits 更新で差し替わるので、id だけを見て貼り直しを避ける
  }, [orgId, session, push]);

  const value = useMemo<RealtimeState>(
    () => ({
      events,
      latestMatch,
      connected,
      dismissLatest: () => setLatestMatch(null),
      clear: () => setEvents([]),
    }),
    [events, latestMatch, connected],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRelayRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRelayRealtime は RelayRealtime の内側でのみ使える");
  return ctx;
}
