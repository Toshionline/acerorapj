import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { DEMO_ACCOUNTS, useAuth } from "../auth/AuthProvider";
import { DEMO_LOGIN_ENABLED, type DemoAccount } from "../auth/demoAccounts";

export function Login() {
  const { session, loading, signInWithDemo, signInWithEmail } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/app" replace />;

  async function demo(account: DemoAccount) {
    setBusy(account.key);
    setError(null);
    try {
      await signInWithDemo(account);
      navigate("/app");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    setNotice(null);
    try {
      await signInWithEmail(email);
      setNotice("ログインリンクを送信しました。ローカルでは http://127.0.0.1:54324 で受信できます。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-lg flex-col justify-center px-5 py-[var(--space-2xl)] sm:px-8">
      <Link to="/" className="wordmark">
        OFFICE RELAY
      </Link>
      <h1 className="display mt-[var(--space-md)]">ログイン</h1>
      <p className="measure mt-[var(--space-sm)] text-sm text-slate-400">
        {DEMO_LOGIN_ENABLED
          ? "デモは2つのロールを切り替えて動かします。譲渡企業と受取スタートアップを別ブラウザで開いてください。"
          : "メールリンクでログインしてください。"}
      </p>

      <div className="mt-[var(--space-lg)] grid gap-[var(--space-2xs)]">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.key}
            type="button"
            className="card card-lift flex items-center justify-between text-left"
            disabled={busy !== null}
            onClick={() => void demo(account)}
          >
            <span>
              <span className="block font-semibold">{account.label}</span>
              <span className="block text-xs text-slate-400">{account.role}</span>
            </span>
            <span className="num text-relay">{busy === account.key ? "…" : "→"}</span>
          </button>
        ))}
      </div>

      <form
        className="mt-[var(--space-lg)] border-t border-line pt-[var(--space-md)]"
        onSubmit={(e) => void magicLink(e)}
      >
        <label className="label" htmlFor="email">
          メールリンクでログイン
        </label>
        <div className="flex items-center gap-[var(--space-2xs)]">
          <input
            id="email"
            type="email"
            required
            className="input"
            placeholder="you@company.co.jp"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={busy !== null}>
            送信
          </button>
        </div>
        <p className="field-help mt-[var(--space-2xs)]" role="status">
          {notice}
        </p>
      </form>

      <p className="field-help mt-[var(--space-2xs)] text-alert" role="alert">
        {error}
      </p>
    </div>
  );
}
