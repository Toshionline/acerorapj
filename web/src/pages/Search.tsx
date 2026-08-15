import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ItemPhotoCard } from "../components/ItemPhotoCard";
import { Skeleton } from "../components/Skeleton";
import { EmptyState, ErrorState, errorMessage } from "../components/States";
import { searchItems } from "../lib/items";
import { CATEGORIES } from "../lib/types";
import type { Item } from "../lib/types";

const DEBOUNCE_MS = 300;

// キーワード + カテゴリで available な items を検索し写真グリッドで返す画面。
// 検索本体は lib/items.ts の searchItems に隔離してある (将来 pgvector 化してもここは不変)。
export function Search() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const found = await searchItems({ q, category, availableOnly });
          if (!alive) return;
          setItems(found);
          setError(null);
        } catch (e) {
          if (alive) setError(errorMessage(e, "検索に失敗しました"));
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q, category, availableOnly, retry]);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <h1 className="text-xl font-black tracking-tightest">検索</h1>
        <input
          className="input"
          type="search"
          inputMode="search"
          placeholder="デスク、モニター など"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="キーワード"
        />
        <div className="h-scroll">
          <Pill
            active={availableOnly}
            onClick={() => setAvailableOnly(!availableOnly)}
            label={availableOnly ? "掲載中のみ" : "すべての状態"}
          />
          <Pill active={category === null} onClick={() => setCategory(null)} label="全カテゴリ" />
          {CATEGORIES.map((c) => (
            <Pill
              key={c.value}
              active={category === c.value}
              onClick={() => setCategory(category === c.value ? null : c.value)}
              label={c.label}
            />
          ))}
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={() => setRetry((n) => n + 1)} />}

      {!items ? (
        <div className="grid-photos">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="該当する資産がありません"
          hint="キーワードを短くするか、カテゴリや「掲載中のみ」を外すと承諾済・引渡完了の資産も表示されます。"
          action={
            <Link to="/app" className="btn-ghost">
              探索へ
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-[11px] text-slate-500">{items.length} 件</p>
          <div className="grid-photos">
            {items.map((item) => (
              <ItemPhotoCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Pill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 snap-start rounded-full border px-3 py-1 text-[11px] font-semibold ${
        active ? "border-relay bg-panel text-relay" : "border-line text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}
