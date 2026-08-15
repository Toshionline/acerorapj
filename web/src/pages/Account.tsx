import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useRelayRealtime } from "../realtime/RelayRealtime";
import { Skeleton } from "../components/Skeleton";
import { ErrorState, errorMessage } from "../components/States";
import { dateTime, itemDeadlineLabel } from "../lib/format";
import { publicMediaUrl, supabase } from "../lib/supabase";
import { ITEM_STATUS_LABEL } from "../lib/items";
import { loadOrgDashboard, type DashboardSummary } from "../lib/rpc";
import type { Item } from "../lib/types";

type ManagedItem = Pick<
  Item,
  "id" | "title" | "quantity" | "status" | "pickup_deadline" | "category"
> & {
  item_media: { id: string; storage_path: string }[];
};

type CreditEvent = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
};

type NeedRow = {
  id: string;
  title: string;
  quantity: number | null;
  status: string;
  latest_needed_at: string | null;
};

// アカウント配下: 組織情報・出品中アイテムの管理・ニーズ・Relay Credits を集約する。
export function Account() {
  const { org } = useAuth();
  const { events } = useRelayRealtime();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [items, setItems] = useState<ManagedItem[] | null>(null);
  const [needs, setNeeds] = useState<NeedRow[] | null>(null);
  const [credits, setCredits] = useState<CreditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!org) return;
    try {
      const [next, itemRows, needRows, creditRows] = await Promise.all([
        loadOrgDashboard(org.id),
        supabase
          .from("items")
          .select(
            "id,title,quantity,status,pickup_deadline,category,item_media(id,storage_path)",
          )
          .eq("owner_org_id", org.id)
          .order("created_at", { ascending: false })
          .limit(30),
        // status の絞り込みは limit より先にサーバ側で効かせる (終了済みで 20 件を食い潰さない)
        supabase
          .from("needs")
          .select("id,title,quantity,status,latest_needed_at")
          .eq("org_id", org.id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("relay_credit_events")
          .select("id,delta,reason,created_at")
          .eq("org_id", org.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (itemRows.error) throw itemRows.error;
      if (needRows.error) throw needRows.error;
      if (creditRows.error) throw creditRows.error;
      setSummary(next);
      setItems((itemRows.data ?? []) as unknown as ManagedItem[]);
      setNeeds((needRows.data ?? []) as NeedRow[]);
      setCredits((creditRows.data ?? []) as CreditEvent[]);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "アカウント情報の取得に失敗しました"));
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime でマッチや引渡が動いたら集計と在庫を取り直す
  useEffect(() => {
    if (events.length > 0) void refresh();
  }, [events.length, refresh]);

  if (error && !summary) {
    return <ErrorState message={error} onRetry={() => void refresh()} />;
  }
  if (!org || !summary || !items || !needs) return <AccountSkeleton />;

  const isDonor = org.org_type === "donor";

  const inventory = (
    <ItemManager
      items={items}
      onUpdated={(next) => {
        setItems((prev) =>
          (prev ?? []).map((i) => (i.id === next.id ? { ...i, ...next } : i)),
        );
        // 掲載中件数などの集計は RPC 由来なので取り直す
        void refresh();
      }}
    />
  );
  const creditsCard = (
    <CreditsCard credits={summary.relay_credits} events={credits} />
  );
  const needsCard = <NeedsCard needs={needs} />;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="tag border-relay text-relay">{org.org_type}</p>
        <h1 className="text-xl font-black tracking-tightest">{org.name}</h1>
        <p className="text-xs text-slate-400">
          {org.area_label ?? "エリア未設定"} /{" "}
          {org.nearest_station ?? "最寄駅未設定"}
        </p>
      </header>

      {error && (
        <ErrorState
          title="最新の状態を取得できませんでした"
          message={error}
          onRetry={() => void refresh()}
        />
      )}

      {/* 4カラムの Stat は 375px では 2 カラム */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="掲載中の資産" value={summary.items_available} />
        <Stat label="募集中のニーズ" value={summary.needs_open} />
        <Stat label="Relay Credits" value={summary.relay_credits} accent />
        <Stat
          label="Rescue before deadline"
          value={summary.rescued_before_deadline}
          accent
        />
      </section>

      {/* ロール別: donor は在庫管理を最上部、startup(buyer) は Credits とニーズを上に */}
      {isDonor ? (
        <>
          {inventory}
          {needsCard}
          {creditsCard}
        </>
      ) : (
        <>
          {creditsCard}
          {needsCard}
          {inventory}
        </>
      )}

      <section className="card">
        <h2 className="section-title">Realtime イベント</h2>
        <ul className="mt-3 space-y-1 text-xs text-slate-400">
          {events.length === 0 && (
            <li className="text-slate-500">
              購読中。まだイベントはありません。
            </li>
          )}
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-slate-500">{dateTime(e.at)}</span> {e.title}
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex items-center justify-between gap-3">
        <div>
          <h2 className="section-title">外部在庫コネクタ</h2>
          <p className="mt-1 text-xs text-slate-500">
            CSV/API から在庫を取り込む
          </p>
        </div>
        <Link to="/app/connector-factory" className="btn-ghost shrink-0">
          Connector Factory
        </Link>
      </section>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className={`card ${accent ? "border-relay" : ""}`}>
      <p className="label mb-0 truncate text-[10px]">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ? "text-relay" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ItemManager({
  items,
  onUpdated,
}: {
  items: ManagedItem[];
  onUpdated: (next: Partial<ManagedItem> & { id: string }) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="card-flush -mx-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">出品中アイテムの管理</h2>
        <Link to="/app/items/new" className="text-xs text-relay">
          写真から出品 →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          まだ出品がありません。
          <Link to="/app/items/new" className="text-relay">
            フッター中央のカメラから出品
          </Link>
          できます。
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              open={openId === item.id}
              onToggle={() => setOpenId(openId === item.id ? null : item.id)}
              onUpdated={onUpdated}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemRow({
  item,
  open,
  onToggle,
  onUpdated,
}: {
  item: ManagedItem;
  open: boolean;
  onToggle: () => void;
  onUpdated: (next: Partial<ManagedItem> & { id: string }) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [deadline, setDeadline] = useState(toLocalInput(item.pickup_deadline));
  const [busy, setBusy] = useState(false);
  // 行内の検証・保存エラーはこの行だけに出す (ページ全体の取得エラーとは別扱い)
  const [rowError, setRowError] = useState<string | null>(null);

  // 行はアンマウントされないので、編集欄の開閉で古いエラーを持ち越さない
  useEffect(() => {
    setRowError(null);
  }, [open]);

  const photo = item.item_media?.[0]?.storage_path;
  const deadlineInfo = itemDeadlineLabel(item.pickup_deadline, item.status);
  const active = item.status === "available";

  async function withdraw() {
    setBusy(true);
    setRowError(null);
    try {
      const { error } = await supabase
        .from("items")
        .update({ status: "expired" })
        .eq("id", item.id);
      if (error) throw error;
      onUpdated({ id: item.id, status: "expired" });
    } catch (e) {
      setRowError(errorMessage(e, "取り下げに失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setRowError(null);
    try {
      const parsed = deadline ? new Date(deadline) : null;
      if (parsed && Number.isNaN(parsed.getTime())) {
        setRowError("撤去期限を正しい日時で入力してください");
        return;
      }
      const iso = parsed ? parsed.toISOString() : null;
      const next = Number(quantity);
      if (!Number.isInteger(next) || next < 1) {
        setRowError("数量は 1 以上の整数で入力してください");
        return;
      }
      const { error } = await supabase
        .from("items")
        .update({ title, quantity: next, pickup_deadline: iso })
        .eq("id", item.id);
      if (error) throw error;
      onUpdated({ id: item.id, title, quantity: next, pickup_deadline: iso });
      onToggle();
    } catch (e) {
      setRowError(errorMessage(e, "更新に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex gap-3">
        <ItemPhoto path={photo} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {ITEM_STATUS_LABEL[item.status] ?? item.status} / {item.quantity} 点
          </p>
          <p
            className={`text-[11px] ${deadlineInfo.urgent ? "text-alert" : "text-slate-500"}`}
          >
            {deadlineInfo.text}
          </p>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Link
          to={`/app/items/${item.id}`}
          className="btn-ghost px-3 py-1 text-xs"
        >
          詳細
        </Link>
        <button
          type="button"
          className="btn-ghost px-3 py-1 text-xs"
          onClick={onToggle}
        >
          {open ? "閉じる" : "編集"}
        </button>
        <button
          type="button"
          className="btn-ghost px-3 py-1 text-xs text-alert"
          disabled={busy || !active}
          onClick={() => void withdraw()}
        >
          取り下げ
        </button>
      </div>
      {rowError && <p className="mt-2 text-[11px] text-alert">{rowError}</p>}
      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
          <div>
            <label className="label" htmlFor={`title-${item.id}`}>
              タイトル
            </label>
            <input
              id={`title-${item.id}`}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`qty-${item.id}`}>
                数量
              </label>
              <input
                id={`qty-${item.id}`}
                type="number"
                min={1}
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor={`deadline-${item.id}`}>
                撤去期限
              </label>
              <input
                id={`deadline-${item.id}`}
                type="datetime-local"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            カテゴリ: {item.category}
          </p>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !title.trim()}
            onClick={() => void save()}
          >
            {busy ? "保存中..." : "保存"}
          </button>
        </div>
      )}
    </li>
  );
}

// 写真が取得できない (storage 未アップロードなど) ときは代替の枠を出す
function ItemPhoto({ path }: { path?: string }) {
  const [broken, setBroken] = useState(false);
  if (!path || broken) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-line text-[10px] text-slate-500">
        写真なし
      </div>
    );
  }
  return (
    <img
      src={publicMediaUrl(path)}
      alt=""
      className="h-16 w-16 shrink-0 rounded-lg object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function NeedsCard({ needs }: { needs: NeedRow[] }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="section-title">募集中のニーズ</h2>
        <Link to="/app/needs/new" className="text-xs text-relay">
          ニーズを登録 →
        </Link>
      </div>
      {needs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          募集中のニーズはありません。
          <Link to="/app/needs/new" className="text-relay">
            登録するとマッチが動きます
          </Link>
          。
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {needs.map((need) => (
            <li
              key={need.id}
              className="rounded-lg border border-line px-3 py-2"
            >
              <p className="truncate font-semibold">{need.title}</p>
              <p className="text-[11px] text-slate-500">
                必要 {need.quantity ?? "-"} 点 / 希望{" "}
                {dateTime(need.latest_needed_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CREDIT_REASON_LABEL: Record<string, string> = {
  asset_donated: "資産の提供",
  pickup_completed: "引渡の完了",
  service_delivered: "サービス提供",
};

function CreditsCard({
  credits,
  events,
}: {
  credits: number;
  events: CreditEvent[];
}) {
  return (
    <section className="card">
      <div className="flex items-end justify-between">
        <h2 className="section-title">Relay Credits</h2>
        <p className="text-2xl font-black text-relay">{credits}</p>
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          引渡が完了すると加算されます。
        </p>
      ) : (
        <ul className="mt-3 space-y-1 text-xs">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-slate-400">
                {dateTime(e.created_at)}{" "}
                {CREDIT_REASON_LABEL[e.reason] ?? e.reason}
              </span>
              <span className="shrink-0 font-bold text-relay">+{e.delta}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// datetime-local 用にローカル時刻の "YYYY-MM-DDTHH:mm" へ変換する
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
