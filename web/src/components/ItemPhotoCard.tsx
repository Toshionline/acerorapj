import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { itemPhotoUrl } from "../lib/items";
import { categoryLabel } from "../lib/types";
import type { Item } from "../lib/types";
import { itemDeadlineLabel } from "../lib/format";

// 写真主役のカード。グリッド (photo-square) と横スクロール両方で使う。
export function ItemPhotoCard({
  item,
  to = `/app/items/${item.id}`,
  compact = false,
}: {
  item: Item;
  to?: string;
  compact?: boolean;
}) {
  const deadline = itemDeadlineLabel(item.pickup_deadline, item.status);
  const body = (
    <>
      <ItemPhoto item={item} className="photo-square" />
      <div className="space-y-0.5 p-2">
        <p className="truncate text-xs font-bold text-slate-100">{item.title}</p>
        <p className="truncate text-[11px] text-slate-500">
          {categoryLabel(item.category)}
          {item.organizations?.nearest_station ? ` / ${item.organizations.nearest_station}` : ""}
        </p>
        {!compact && (
          <p className={`text-[11px] ${deadline.urgent ? "text-alert" : "text-slate-500"}`}>
            {deadline.text}
          </p>
        )}
      </div>
    </>
  );

  // 詳細は既存の /app/items/:itemId (ItemDetail) に任せる
  return (
    <Link to={to} className="block overflow-hidden rounded-xl border border-line bg-panel">
      {body}
    </Link>
  );
}

// 写真が無い出品でもレイアウトが崩れないよう枠を保つ
export function ItemPhoto({ item, className = "" }: { item: Item; className?: string }) {
  // storage に実体が無い item_media でも壊れ画像を出さない
  const [broken, setBroken] = useState(false);
  const url = itemPhotoUrl(item);

  // スワイプでカードが差し替わったら失敗状態を持ち越さない
  useEffect(() => {
    setBroken(false);
  }, [url]);

  if (!url || broken) {
    return (
      <div
        className={`flex items-center justify-center bg-panel text-[11px] text-slate-500 ${className}`}
      >
        写真なし
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={item.title}
      loading="lazy"
      draggable={false}
      onError={() => setBroken(true)}
      className={`${className} object-cover`}
    />
  );
}
