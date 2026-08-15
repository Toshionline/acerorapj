import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./auth/AuthProvider";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Skeleton } from "./components/Skeleton";

// ランディングに /app 配下のコードを載せないためルート単位で分割する (§3.7)。
const AppLayout = lazy(() => import("./pages/AppLayout").then((m) => ({ default: m.AppLayout })));
const ItemDetail = lazy(() =>
  import("./pages/ItemDetail").then((m) => ({ default: m.ItemDetail })),
);
const NewItem = lazy(() => import("./pages/NewItem").then((m) => ({ default: m.NewItem })));
const NewNeed = lazy(() => import("./pages/NewNeed").then((m) => ({ default: m.NewNeed })));
const Matches = lazy(() => import("./pages/Matches").then((m) => ({ default: m.Matches })));
const Explore = lazy(() => import("./pages/Explore").then((m) => ({ default: m.Explore })));
const Search = lazy(() => import("./pages/Search").then((m) => ({ default: m.Search })));
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const ConnectorFactory = lazy(() =>
  import("./pages/ConnectorFactory").then((m) => ({ default: m.ConnectorFactory })),
);

// ルーティングは Phase 0 (P0-4) で凍結していたが、モバイル基準の UI 刷新で解除した。
// 既存ルート (items/new, needs/new, matches, connector-factory) は互換のため残す。
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Skeleton className="m-6 h-64" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Explore />} />
              <Route path="search" element={<Search />} />
              <Route path="account" element={<Account />} />
              {/* 旧 /app/items (デスクトップ一覧) は検索に一本化した */}
              <Route path="items" element={<Navigate to="/app/search" replace />} />
              <Route path="items/new" element={<NewItem />} />
              <Route path="items/:itemId" element={<ItemDetail />} />
              <Route path="needs/new" element={<NewNeed />} />
              <Route path="matches" element={<Matches />} />
              <Route path="connector-factory" element={<ConnectorFactory />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
