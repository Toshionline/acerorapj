import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useRelayRealtime } from "../realtime/RelayRealtime";
import { dateTime } from "../lib/format";

// ヘッダの通知ドロワーと、マッチ検知時の全画面オーバーレイ。
// ヘッダは狭いので、通知はアイコン + 未読バッジのコンパクト表示にする。
export function NotificationCenter() {
  const { events, connected, latestMatch, dismissLatest } = useRelayRealtime();

  return (
    <>
      <div className="relative ml-auto flex items-center gap-[var(--space-2xs)]">
        <span
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500"
          title={connected ? "Realtime 接続中" : "Realtime 未接続"}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-relay" : "bg-slate-600"}`} />
          <span className="hidden sm:inline">Realtime</span>
        </span>
        <details className="relative">
          <summary
            className="relative flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-line text-slate-300"
            aria-label="通知"
          >
            <BellIcon />
            {events.length > 0 && (
              <span className="num absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-relay px-1 text-[10px] font-semibold leading-none text-ink">
                {events.length}
              </span>
            )}
          </summary>
          {/* モバイル幅では画面外にはみ出すので、ヘッダー直下に固定表示する */}
          <div className="fixed right-3 top-14 z-dropdown w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-panel p-3 shadow-xl">
            {events.length === 0 ? (
              <p className="text-xs text-slate-500">
                まだイベントはありません。
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-line px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-slate-200">{e.title}</p>
                    <p className="mt-0.5 text-slate-500">{dateTime(e.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>

      {/* backdrop-blur を持つヘッダーが containing block になり fixed が潰れるので body へ portal する */}
      {latestMatch &&
        createPortal(
          <div className="fixed inset-0 z-dropdown flex items-center justify-center bg-scrim px-4 sm:px-6">
            <div className="card w-full max-w-md border-relay text-center">
              <p className="tag tag-accent">MATCH FOUND</p>
              <p className="mt-4 text-2xl font-black leading-tight tracking-tightest">
                新しいマッチが
                <br />
                見つかりました
              </p>
              <p className="mt-3 text-sm text-slate-300">{latestMatch.title}</p>
              <div className="mt-6 flex justify-center gap-3">
                <Link
                  to="/app/matches"
                  className="btn-primary"
                  onClick={dismissLatest}
                >
                  マッチを見る
                </Link>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={dismissLatest}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9a6 6 0 1 1 12 0v4l1.5 3h-15L6 13z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}
