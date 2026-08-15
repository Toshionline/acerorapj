import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ItemPhotoCard } from "../components/ItemPhotoCard";
import { SwipeStack } from "../components/SwipeStack";
import { Skeleton } from "../components/Skeleton";
import { EmptyState, ErrorState, errorMessage } from "../components/States";
import { loadAvailableItems, loadOrgItems, loadTopMatches } from "../lib/items";
import { savedItemIds, useSavedItems } from "../lib/saved";
import type { Item, Match } from "../lib/types";

// 買い手 (startup) の探索ホーム: スワイプ + オススメ + 写真グリッド。
export function Explore() {
  const { org } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [ownItems, setOwnItems] = useState<Item[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  // スワイプ用の山札は取得時に一度だけ確定させる (操作の途中で並びが変わらないように)
  const [deck, setDeck] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { ids: savedIds, save } = useSavedItems(org?.id);

  const refresh = useCallback(async () => {
    if (!org) return;
    try {
      const [available, mine, top] = await Promise.all([
        loadAvailableItems(),
        loadOrgItems(org.id),
        loadTopMatches(org.id),
      ]);
      const seen = savedItemIds(org.id);
      // 自組織の出品と気になる済みはスワイプ対象から除く
      setDeck(available.filter((i) => i.owner_org_id !== org.id && !seen.includes(i.id)));
      setItems(available);
      setOwnItems(mine);
      setMatches(top);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "探索データの取得に失敗しました"));
    }
  }, [org]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error && !items) {
    return <ErrorState message={error} onRetry={() => void refresh()} />;
  }
  if (!org || !items) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[26rem]" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const isDonor = org.org_type === "donor";

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tightest">{isDonor ? "ホーム" : "探索"}</h1>
          <p className="text-[11px] text-slate-500">
            {org.name} / {org.nearest_station ?? org.area_label ?? "-"}
          </p>
        </div>
        {savedIds.length > 0 && (
          <p className="text-[11px] text-slate-500">気になる {savedIds.length} 件</p>
        )}
      </header>

      {error && <ErrorState title="一部の取得に失敗しました" message={error} onRetry={() => void refresh()} />}

      {isDonor ? (
        // donor は探索より在庫が主役。スワイプは畳んで出品導線を優先する。
        <DonorPanel ownItems={ownItems} swipable={deck} onLike={(i) => save(i.id)} />
      ) : (
        <section className="space-y-2">
          <h2 className="section-title">気になる資産を選ぶ</h2>
          {deck.length === 0 ? (
            <EmptyState
              title="スワイプできる資産がありません"
              hint="他組織の出品が入るとここに並びます。検索から探すこともできます。"
              action={
                <Link to="/app/search" className="btn-ghost">
                  検索へ
                </Link>
              }
            />
          ) : (
            <div className="stage-narrow">
              <SwipeStack items={deck} onLike={(i) => save(i.id)} onSkip={() => {}} />
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">オススメ</h2>
          <Link to="/app/matches" className="text-xs text-relay">
            すべて見る →
          </Link>
        </div>
        {matches.length === 0 ? (
          <EmptyState
            title="まだオススメはありません"
            hint="必要品を登録するとマッチが計算され、ここに並びます。"
            action={
              <Link to="/app/needs/new" className="btn-primary">
                必要品を登録
              </Link>
            }
          />
        ) : (
          <div className="h-scroll">
            {matches.map((match) => (
              <div key={match.id} className="w-40 shrink-0 snap-start">
                {match.items ? (
                  <ItemPhotoCard item={match.items} to="/app/matches" compact />
                ) : (
                  <Link
                    to="/app/matches"
                    className="block rounded-xl border border-line bg-panel p-3 text-xs text-slate-400"
                  >
                    資産の詳細はマッチ画面で確認できます
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">写真の商品一覧</h2>
          <Link to="/app/search" className="text-xs text-relay">
            すべて見る →
          </Link>
        </div>
        {items.length === 0 ? (
          <EmptyState
            title="掲載中の資産がありません"
            hint="カメラから出品すると一覧に並びます。"
            action={
              <Link to="/app/items/new" className="btn-primary">
                出品する
              </Link>
            }
          />
        ) : (
          <div className="grid-photos">
            {items.map((item) => (
              <ItemPhotoCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// donor 向け: 在庫 (自組織の出品) と出品導線を上部に置き、スワイプは折りたたむ
function DonorPanel({
  ownItems,
  swipable,
  onLike,
}: {
  ownItems: Item[];
  swipable: Item[];
  onLike: (item: Item) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/app/items/new" className="btn-primary flex-1 md:flex-none md:px-8">
          出品する
        </Link>
        <Link to="/app/account" className="btn-ghost">
          在庫管理
        </Link>
      </div>

      <div className="space-y-2">
        <h2 className="section-title">自組織の出品 ({ownItems.length})</h2>
        {ownItems.length === 0 ? (
          <EmptyState title="まだ出品がありません" hint="フッター中央のカメラから写真で出品できます。" />
        ) : (
          <div className="h-scroll">
            {ownItems.map((item) => (
              <div key={item.id} className="w-36 shrink-0 snap-start">
                <ItemPhotoCard item={item} compact />
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="btn-ghost w-full" onClick={() => setOpen((v) => !v)}>
        {open ? "他組織の出品を閉じる" : `他組織の出品をスワイプで見る (${swipable.length})`}
      </button>
      {open && swipable.length > 0 && (
        <div className="stage-narrow">
          <SwipeStack items={swipable} onLike={onLike} onSkip={() => {}} />
        </div>
      )}
    </section>
  );
}
