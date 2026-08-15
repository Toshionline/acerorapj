import type { ReactNode } from "react";

// 空状態: 次に何をすればマッチが動くのかを必ず 1 つ示す (§3.7)
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card text-sm">
      <p className="font-semibold text-slate-200">{title}</p>
      {hint && <p className="mt-1 text-slate-500">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// エラー状態: 原因を隠さず、その場で再試行できるようにする
export function ErrorState({
  title = "読み込みに失敗しました",
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="card border-alert text-sm" role="alert">
      <p className="font-semibold text-alert">{title}</p>
      {message && <p className="mt-1 break-words text-slate-400">{message}</p>}
      {onRetry && (
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          再試行
        </button>
      )}
    </div>
  );
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
