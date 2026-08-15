import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ItemPhoto } from "./ItemPhotoCard";
import { categoryLabel } from "../lib/types";
import type { Item } from "../lib/types";
import { deadlineLabel } from "../lib/format";
import { itemPlaceLabel } from "../lib/items";

const THRESHOLD = 90;
const FLY_OUT = 520;
const FLY_MS = 200;

// Tinder 風のカードスタック。外部ライブラリは使わず pointer events + transform のみ。
export function SwipeStack({
  items,
  onLike,
  onSkip,
}: {
  items: Item[];
  onLike: (item: Item) => void;
  onSkip: (item: Item) => void;
}) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [flying, setFlying] = useState(false);
  const startX = useRef(0);
  const dragging = useRef(false);
  const timer = useRef<number | null>(null);

  // 出品リストが入れ替わったら先頭に戻す
  useEffect(() => {
    setIndex(0);
    setDx(0);
  }, [items]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const top = items[index];
  const next = items[index + 1];

  function commit(direction: 1 | -1) {
    if (!top || flying) return;
    setFlying(true);
    setDx(direction * FLY_OUT);
    if (direction > 0) onLike(top);
    else onSkip(top);
    timer.current = window.setTimeout(() => {
      setFlying(false);
      setDx(0);
      setIndex((i) => i + 1);
    }, FLY_MS);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (flying) return;
    // 画像の HTML5 ネイティブドラッグに奪われるとマウス操作が効かない
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    setDx(e.clientX - startX.current);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx > THRESHOLD) commit(1);
    else if (dx < -THRESHOLD) commit(-1);
    else setDx(0);
  }

  if (!top) {
    return (
      <div className="border border-line bg-panel p-6 text-center text-sm text-slate-400">
        <p className="font-semibold text-slate-200">すべて見終わりました</p>
        <p className="mt-1 text-xs text-slate-500">
          気になるに入れた資産はニーズ登録でマッチに進めます。
        </p>
      </div>
    );
  }

  const deadline = deadlineLabel(top.pickup_deadline);
  const rotate = dx / 24;
  const likeOpacity = Math.min(1, Math.max(0, dx / THRESHOLD));
  const skipOpacity = Math.min(1, Math.max(0, -dx / THRESHOLD));

  return (
    <div className="space-y-3">
      {/* 飛んでいくカードで横スクロールが出ないようカード領域でクリップする */}
      <div className="relative h-[26rem] select-none overflow-hidden">
        {next && (
          <div className="absolute inset-0 scale-[0.97] overflow-hidden rounded-xl border border-line bg-panel opacity-60">
            <ItemPhoto item={next} className="h-full w-full" />
          </div>
        )}
        <div
          className="absolute inset-0 touch-pan-y overflow-hidden rounded-xl border border-line bg-panel"
          draggable={false}
          style={{
            transform: `translateX(${dx}px) rotate(${rotate}deg)`,
            transition: dragging.current ? "none" : `transform ${FLY_MS}ms ease-out`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <ItemPhoto item={top} className="h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-scrim to-transparent p-4">
            <p className="text-lg font-black tracking-tightest">{top.title}</p>
            <p className="text-xs text-slate-400">
              {categoryLabel(top.category)} / {itemPlaceLabel(top)}
            </p>
            <p className={`mt-1 text-xs ${deadline.urgent ? "text-alert" : "text-slate-500"}`}>
              {deadline.text}
            </p>
            {/* 詳細は既存の /app/items/:itemId へ。ドラッグと競合しないよう pointerdown は止める */}
            <Link
              to={`/app/items/${top.id}`}
              className="mt-2 inline-block text-xs text-relay"
              onPointerDown={(e) => e.stopPropagation()}
            >
              詳細を見る →
            </Link>
          </div>
          <span
            className="pointer-events-none absolute left-3 top-3 rounded-md border border-relay px-2 py-1 text-xs font-black text-relay"
            style={{ opacity: likeOpacity }}
          >
            気になる
          </span>
          <span
            className="pointer-events-none absolute right-3 top-3 rounded-md border border-line px-2 py-1 text-xs font-black text-slate-300"
            style={{ opacity: skipOpacity }}
          >
            見送り
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          className="btn-ghost h-12 w-28"
          onClick={() => commit(-1)}
          aria-label="見送り"
        >
          見送り
        </button>
        <button
          type="button"
          className="btn-primary h-12 w-28"
          onClick={() => commit(1)}
          aria-label="気になる"
        >
          気になる
        </button>
      </div>
      <p className="text-center text-[11px] text-slate-500">
        左右にドラッグでも操作できます ({index + 1}/{items.length})
      </p>
    </div>
  );
}
