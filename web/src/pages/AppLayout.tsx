import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { RelayRealtime } from "../realtime/RelayRealtime";
import { NotificationCenter } from "../components/NotificationCenter";
import { Skeleton } from "../components/Skeleton";
import {
  AccountIcon,
  CameraIcon,
  ExploreIcon,
  HomeIcon,
  MatchIcon,
  SearchIcon,
} from "../components/icons";

type NavItem = { to: string; label: string; icon: React.ReactNode; end?: boolean };

// 主導線はここ 1 箇所で定義し、フッタータブとデスクトップ nav の双方から使う。
function navItems(isDonor: boolean): NavItem[] {
  return [
    {
      to: "/app",
      end: true,
      label: isDonor ? "ホーム" : "探索",
      icon: isDonor ? <HomeIcon /> : <ExploreIcon />,
    },
    { to: "/app/search", label: "検索", icon: <SearchIcon /> },
    { to: "/app/matches", label: "マッチ", icon: <MatchIcon /> },
    {
      to: "/app/account",
      label: isDonor ? "在庫管理" : "アカウント",
      icon: <AccountIcon />,
    },
  ];
}

const NEW_ITEM: NavItem = { to: "/app/items/new", label: "出品", icon: <CameraIcon /> };

// 認証ガード (P1-C1) と Realtime 購読 (P3-D1) の入口。
// モバイル基準: 上部は最小限のバー、主導線は固定フッタータブ 5 枠。
export function AppLayout() {
  const { session, org, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="wrap space-y-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  const isDonor = org?.org_type === "donor";
  const items = navItems(isDonor);

  return (
    <RelayRealtime>
      <div className="min-h-[100svh] pb-footer md:pb-0">
        {/* N1b · three-section bar (brand / org / actions) + タブレール */}
        <header className="sticky top-0 z-sticky-nav border-b border-line bg-scrim backdrop-blur">
          <div className="wrap flex items-center gap-[var(--space-sm)] py-[var(--space-2xs)]">
            <NavLink to="/app" className="wordmark shrink-0">
              Office Relay
            </NavLink>
            <span className="ml-auto hidden min-w-0 truncate text-xs text-slate-400 sm:inline">
              {org?.name ?? "組織未所属"}
              {org && <span className="ml-1 text-slate-600">/ {org.org_type}</span>}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-[var(--space-2xs)] sm:ml-0">
              <NotificationCenter />
              <button type="button" className="btn-quiet" onClick={() => void signOut()}>
                ログアウト
              </button>
            </div>
          </div>
          {/* フッタータブに入らない副導線はヘッダーに小さく残す */}
          <nav
            aria-label="メインナビゲーション"
            className="wrap hidden min-w-0 overflow-x-auto md:block"
          >
            <ul className="flex items-center gap-[var(--space-sm)]">
              {[...items, NEW_ITEM].map((item) => (
                <li key={item.to} className="shrink-0">
                  <NavLink to={item.to} end={item.end} className="nav-link">
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main className="wrap py-[var(--space-sm)] md:py-[var(--space-xl)]">
          {org ? (
            <Outlet />
          ) : (
            <section className="card measure">
              <h1 className="heading">組織に所属していません</h1>
              <p className="mt-[var(--space-2xs)] text-sm text-slate-400">
                このユーザーは org_members に登録されていません。デモは
                <NavLink to="/login" className="link">
                  {" "}
                  ログイン画面のデモアカウント{" "}
                </NavLink>
                から開始してください。
              </p>
            </section>
          )}
        </main>

        <nav className="footer-tabs">
          {/* donor は在庫管理 (アカウント) と出品が主役、buyer(startup) は探索が主役 */}
          <Tab {...items[0]} />
          <Tab {...items[1]} />
          <CameraTab />
          <Tab {...items[2]} />
          <Tab {...items[3]} />
        </nav>
      </div>
    </RelayRealtime>
  );
}

function Tab({
  to,
  end,
  label,
  icon,
}: {
  to: string;
  end?: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `footer-tab ${isActive ? "footer-tab-active" : ""}`}
    >
      {icon}
      <span className="truncate px-0.5">{label}</span>
    </NavLink>
  );
}

// フッター中央のカメラ = 出品の起点 (/app/items/new をカメラ起動で流用)
function CameraTab() {
  return (
    <div className="flex h-14 items-center justify-center">
      <NavLink to="/app/items/new" className="footer-fab" aria-label="写真から出品する">
        <CameraIcon />
      </NavLink>
    </div>
  );
}
