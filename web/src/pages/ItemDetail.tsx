import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ItemPhoto } from "../components/ItemPhoto";
import { Skeleton } from "../components/Skeleton";
import { ErrorState, errorMessage } from "../components/States";
import { dateTime, deadlineLabel, showsCountdown } from "../lib/format";
import { ITEM_STATUS_LABEL, loadItem } from "../lib/items";
import { useSavedItems } from "../lib/saved";
import { categoryLabel, type Item } from "../lib/types";

export function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const { org } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { ids: savedIds, save, unsave } = useSavedItems(org?.id);

  const refresh = useCallback(async () => {
    if (!itemId) return;
    try {
      setItem(await loadItem(itemId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "資産の取得に失敗しました"));
    }
  }, [itemId]);

  useEffect(() => {
    setActiveIndex(0);
    void refresh();
  }, [refresh]);

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />;
  }
  if (!item) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const media = item.item_media ?? [];
  const active = media[activeIndex] ?? media[0];
  const deadline = deadlineLabel(item.pickup_deadline);
  const isOwner = org?.id === item.owner_org_id;
  const saved = savedIds.includes(item.id);

  return (
    <div className="space-y-5">
      <Link to="/app/search" className="link text-xs">
        ← 検索に戻る
      </Link>

      <div className="grid gap-[var(--space-lg)] md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <ItemPhoto
            storagePath={active?.storage_path}
            alt={item.title}
            width={960}
            height={640}
            eager
            label="写真は登録されていません"
            className="h-64 w-full rounded-xl border border-line md:h-96"
          />

          {media.length > 1 && (
            <div className="flex gap-2">
              {media.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`rounded-lg border p-0.5 ${
                    i === activeIndex ? "border-relay" : "border-line"
                  }`}
                  aria-label={`写真 ${i + 1}`}
                  aria-current={i === activeIndex}
                >
                  <ItemPhoto
                    storagePath={m.storage_path}
                    alt=""
                    width={96}
                    height={72}
                    label=""
                    className="h-16 w-24 rounded-md"
                  />
                </button>
              ))}
            </div>
          )}

          <section className="card">
            <h1 className="heading">{item.title}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {categoryLabel(item.category)} / {item.quantity} 点
              {item.condition && ` / ${item.condition}`}
            </p>
            {item.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{item.description}</p>
            )}
          </section>
        </div>

        <aside className="space-y-3">
          <div className="card space-y-2 text-sm">
            <span className="tag">{ITEM_STATUS_LABEL[item.status]}</span>
            {showsCountdown(item.status) && (
              <p className={deadline.urgent ? "text-alert" : "text-slate-400"}>{deadline.text}</p>
            )}
            <p className="text-xs text-slate-500">
              撤去期限 {dateTime(item.pickup_deadline)} / 登録 {dateTime(item.created_at)}
            </p>
          </div>

          <div className="card text-sm">
            <p className="label">提供企業</p>
            <p className="font-semibold text-slate-200">{item.organizations?.name ?? "-"}</p>
            <p className="mt-1 text-xs text-slate-400">
              {item.organizations?.area_label ?? "-"}
              {item.organizations?.nearest_station && ` / ${item.organizations.nearest_station}`}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              正確な引取住所と担当者連絡先は、マッチを双方が承諾した後に RLS で開示されます。
            </p>
          </div>

          <Link to="/app/matches" className="btn-primary w-full">
            マッチを確認する
          </Link>
          {/* スワイプ以外の経路 (グリッド・検索) からも保存できるようにする */}
          {!isOwner && (
            <button
              type="button"
              className="btn-ghost w-full"
              aria-pressed={saved}
              onClick={() => (saved ? unsave(item.id) : save(item.id))}
            >
              {saved ? "気になるを解除" : "気になる"}
            </button>
          )}
          {isOwner && (
            <Link to="/app/items/new" className="btn-ghost w-full">
              別の余剰品を登録
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
