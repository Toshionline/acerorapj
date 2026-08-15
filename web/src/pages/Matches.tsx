import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useRelayRealtime } from "../realtime/RelayRealtime";
import { supabase } from "../lib/supabase";
import { ItemPhoto } from "../components/ItemPhoto";
import { Skeleton } from "../components/Skeleton";
import { EmptyState, ErrorState, errorMessage } from "../components/States";
import { acceptMatch, completeTransfer, declineMatch } from "../lib/rpc";
import { dateTime, deadlineLabel } from "../lib/format";
import type { Match } from "../lib/types";

type Disclosure = {
  exact_address: string;
  contact_name: string | null;
  contact_phone: string | null;
  access_note: string | null;
};

const MATCH_COLUMNS = [
  "id,item_id,need_id,donor_org_id,recipient_org_id",
  "total_score,distance_km,service_note,status,accepted_at",
  "donor_accepted_at,recipient_accepted_at,created_at",
  "items(id,title,category,quantity,condition,pickup_deadline,status,item_media(id,storage_path))",
  "needs(id,title,quantity,latest_needed_at)",
  "transfers(id,status,scheduled_at,completion_code,completed_at)",
].join(",");

async function loadMatches(orgId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .or(`donor_org_id.eq.${orgId},recipient_org_id.eq.${orgId}`)
    .order("total_score", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as unknown as Match[];
}

// 承諾前は最寄駅と概算距離だけ。承諾後は RLS が org_locations の行を返すようになる。
async function loadDisclosure(donorOrgId: string): Promise<Disclosure | null> {
  const { data } = await supabase
    .from("org_locations")
    .select("exact_address,contact_name,contact_phone,access_note")
    .eq("org_id", donorOrgId)
    .maybeSingle();
  return data ?? null;
}

export function Matches() {
  const { org, reloadOrg } = useAuth();
  const { events } = useRelayRealtime();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!org) return;
    try {
      setMatches(await loadMatches(org.id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "マッチの取得に失敗しました"));
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (events.length > 0) void refresh();
  }, [events.length, refresh]);

  async function onAccept(match: Match) {
    if (!org) return;
    setBusyId(match.id);
    setError(null);
    // 楽観的更新は自分の承諾だけ。成立 (status='accepted') の判定はサーバに任せる。
    const now = new Date().toISOString();
    setMatches((prev) =>
      (prev ?? []).map((m) =>
        m.id === match.id
          ? {
              ...m,
              donor_accepted_at:
                m.donor_org_id === org.id ? (m.donor_accepted_at ?? now) : m.donor_accepted_at,
              recipient_accepted_at:
                m.recipient_org_id === org.id
                  ? (m.recipient_accepted_at ?? now)
                  : m.recipient_accepted_at,
            }
          : m,
      ),
    );
    try {
      await acceptMatch(match.id, org.id);
    } catch (e) {
      setError(errorMessage(e, "承諾に失敗しました"));
    } finally {
      await refresh();
      setBusyId(null);
    }
  }

  async function onDecline(match: Match) {
    setBusyId(match.id);
    try {
      await declineMatch(match.id);
    } catch (e) {
      setError(errorMessage(e, "更新に失敗しました"));
    } finally {
      await refresh();
      setBusyId(null);
    }
  }

  async function onComplete(match: Match, transferId: string) {
    setBusyId(match.id);
    try {
      await completeTransfer(transferId);
      await reloadOrg();
    } catch (e) {
      setError(errorMessage(e, "引渡完了の記録に失敗しました"));
    } finally {
      await refresh();
      setBusyId(null);
    }
  }

  if (error && !matches) {
    return <ErrorState message={error} onRetry={() => void refresh()} />;
  }

  if (!org || !matches) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="heading">マッチ</h1>
        <p className="mt-1 text-sm text-slate-400">
双方が承諾するまで正確な住所は開示されません。
        </p>
      </header>

      {error && <ErrorState title="直前の操作でエラーが発生しました" message={error} onRetry={() => void refresh()} />}

      {matches.length === 0 && (
        <EmptyState
          title="まだマッチがありません"
          hint={
            org.org_type === "donor"
              ? "余剰品を登録すると、条件の近い引取り先がここに並びます。"
              : "必要品を登録すると、条件の近い資産がここに並びます。"
          }
          action={
            <Link
              to={org.org_type === "donor" ? "/app/items/new" : "/app/needs/new"}
              className="btn-primary"
            >
              {org.org_type === "donor" ? "余剰品を登録" : "必要品を登録"}
            </Link>
          }
        />
      )}

      <div className="space-y-4">
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            isDonor={match.donor_org_id === org.id}
            busy={busyId === match.id}
            onAccept={() => void onAccept(match)}
            onDecline={() => void onDecline(match)}
            onComplete={(transferId) => void onComplete(match, transferId)}
          />
        ))}
      </div>
    </div>
  );
}

type CardProps = {
  match: Match;
  isDonor: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onComplete: (transferId: string) => void;
};

function MatchCard({ match, isDonor, busy, onAccept, onDecline, onComplete }: CardProps) {
  const [disclosure, setDisclosure] = useState<Disclosure | null>(null);
  const accepted = match.status === "accepted";
  const myAcceptedAt = isDonor ? match.donor_accepted_at : match.recipient_accepted_at;
  const theirAcceptedAt = isDonor ? match.recipient_accepted_at : match.donor_accepted_at;
  const transfer = Array.isArray(match.transfers) ? match.transfers[0] : match.transfers;
  const photo = match.items?.item_media?.[0];
  const deadline = deadlineLabel(match.items?.pickup_deadline ?? null);

  // 楽観的更新の直後はまだ accept_match がコミットされておらず RLS が行を返さない。
  // サーバ確定 (accepted_at) が入った時点で取り直す。
  useEffect(() => {
    if (!accepted) {
      setDisclosure(null);
      return;
    }
    let alive = true;
    void loadDisclosure(match.donor_org_id).then((d) => {
      if (alive && d) setDisclosure(d);
    });
    return () => {
      alive = false;
    };
  }, [accepted, match.accepted_at, match.donor_org_id]);

  return (
    <article className="card grid gap-[var(--space-lg)] md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-3">
        <ItemPhoto
          storagePath={photo?.storage_path}
          alt={match.items?.title ?? "資産の写真"}
          width={720}
          height={540}
          className="photo-bleed aspect-[4/3] rounded-lg md:max-h-72"
        />

        <div>
          <h2 className="subheading">{match.items?.title ?? "資産"}</h2>
          <p className="mt-1 text-sm text-slate-400">
            ニーズ: {match.needs?.title ?? "-"} / 数量 {match.items?.quantity ?? "-"}
          </p>
          <p className={`mt-1 text-xs ${deadline.urgent ? "text-alert" : "text-slate-500"}`}>
            {deadline.text}
          </p>
        </div>

        {match.service_note && (
          <p className="border-l border-line pl-[var(--space-xs)] text-xs text-slate-300">
            サービス交換: {match.service_note}
          </p>
        )}
      </div>

      <aside className="space-y-3">
        <p className="text-right text-[11px] uppercase tracking-wider text-slate-500">
          {match.status}
        </p>

        <div className="panel-inset text-xs">
          <p className="label mb-1">引取場所</p>
          {accepted && disclosure ? (
            <div className="space-y-1 text-slate-200">
              <p>{disclosure.exact_address}</p>
              <p className="text-slate-400">
                {disclosure.contact_name} / {disclosure.contact_phone}
              </p>
              {disclosure.access_note && (
                <p className="text-slate-500">{disclosure.access_note}</p>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-slate-400">
              <p>概算距離 {match.distance_km ? `${Math.round(match.distance_km)} km` : "-"}</p>
              <p className="text-slate-500">正確な住所は双方の承諾後に開示されます (RLS)</p>
            </div>
          )}
        </div>

        {!accepted && match.status === "proposed" && (
          <div className="space-y-2">
            {theirAcceptedAt && !myAcceptedAt && (
              <p className="text-xs text-relay">
                相手は承諾済みです。あなたの承諾で引渡が確定します。
              </p>
            )}
            {myAcceptedAt ? (
              <p className="text-xs text-slate-400">
                承諾済み ({dateTime(myAcceptedAt)})。
                {isDonor ? "引取企業" : "譲渡企業"}の承諾を待っています。
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={busy}
                  onClick={onAccept}
                >
                  承諾する
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={onDecline}>
                  見送る
                </button>
              </div>
            )}
          </div>
        )}

        {accepted && transfer && (
          <div className="panel-inset text-xs">
            <p className="label mb-1">引渡</p>
            <p className="text-slate-300">
              ステータス {transfer.status}
              {transfer.completion_code && ` / コード ${transfer.completion_code}`}
            </p>
            {transfer.completed_at ? (
              <p className="mt-1 text-relay">完了 {dateTime(transfer.completed_at)}</p>
            ) : (
              <button
                type="button"
                className="btn-primary mt-2 w-full"
                disabled={busy || !isDonor}
                onClick={() => onComplete(transfer.id)}
              >
                {isDonor ? "引渡完了にする" : "譲渡企業の完了操作を待っています"}
              </button>
            )}
          </div>
        )}
      </aside>
    </article>
  );
}
