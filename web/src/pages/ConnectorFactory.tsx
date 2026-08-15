import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { buildConnector } from "../lib/rpc";
import { Skeleton } from "../components/Skeleton";
import { EmptyState, ErrorState, errorMessage } from "../components/States";
import { dateTime } from "../lib/format";
import type { DevinJob, IntegrationSource } from "../lib/types";

const SOURCE_COLUMNS = "id,name,source_type,spec_url,sample_csv,contact_email,status,created_at";
const JOB_COLUMNS =
  "id,source_id,devin_session_id,session_url,status,pr_url,summary,steps,started_at,completed_at,error_message";

const SAMPLE_CSV = `item_name,qty,pickup_by,site
エグゼクティブデスク W1600,12,2026-09-05,渋谷オフィス
メッシュチェア,40,2026-09-05,渋谷オフィス`;

export function ConnectorFactory() {
  const { session } = useAuth();
  const [sources, setSources] = useState<IntegrationSource[] | null>(null);
  const [jobs, setJobs] = useState<DevinJob[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "simulation" | null>(null);

  const refresh = useCallback(async () => {
    const [sourceRows, jobRows] = await Promise.all([
      supabase
        .from("integration_sources")
        .select(SOURCE_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("devin_jobs")
        .select(JOB_COLUMNS)
        .order("started_at", { ascending: false })
        .limit(10),
    ]);
    const failure = sourceRows.error ?? jobRows.error;
    setLoadError(failure ? failure.message : null);
    setSources((sourceRows.data ?? []) as unknown as IntegrationSource[]);
    setJobs((jobRows.data ?? []) as unknown as DevinJob[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // channel `connector-factory` (private) で devin_jobs の進捗を受ける
  useEffect(() => {
    if (!session) return;
    supabase.realtime.setAuth(session.access_token);
    const channel: RealtimeChannel = supabase.channel("connector-factory", {
      config: { private: true },
    });
    for (const status of ["queued", "running", "blocked", "finished", "failed"]) {
      channel.on("broadcast", { event: `devin_job_${status}` }, ({ payload }) => {
        const record = (payload as { record?: DevinJob }).record;
        if (!record) return;
        setJobs((prev) => [record, ...prev.filter((j) => j.id !== record.id)].slice(0, 10));
      });
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("integration_sources").insert({
        name,
        source_type: "csv",
        sample_csv: csv,
        contact_email: contact || null,
      });
      if (insertError) throw insertError;
      setName("");
      setContact("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "供給元の登録に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  async function build(sourceId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await buildConnector(sourceId);
      setMode(result.mode);
      await refresh();
    } catch (err) {
      setError(
        `build-connector を呼べませんでした (${errorMessage(err, "原因不明")})。supabase functions serve が起動しているか確認してください。`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="tag tag-accent">Devin Connector Factory</p>
        <h1 className="heading mt-[var(--space-2xs)]">新しい供給元を自動で繋ぐ</h1>
        <p className="mt-1 text-sm text-slate-400">
          供給元の CSV 仕様を登録すると、Devin がアダプタ実装の PR を書きます。人間は列マッピングを書きません。
        </p>
        {mode && (
          <p className="mt-2 text-xs text-amberish">
            {mode === "simulation"
              ? "SIMULATION MODE: DEVIN_API_KEY が未設定のため進捗のみ再現しています。"
              : "LIVE MODE: 実際の Devin セッションを作成しました。"}
          </p>
        )}
      </header>

      {error && <ErrorState title="操作を完了できませんでした" message={error} />}
      {loadError && (
        <ErrorState
          title="供給元 / ジョブの取得に失敗しました"
          message={loadError}
          onRetry={() => void refresh()}
        />
      )}

      <form className="card space-y-3" onSubmit={(e) => void addSource(e)}>
        <div className="grid gap-[var(--space-xs)] md:grid-cols-[repeat(2,minmax(0,1fr))]">
          <div>
            <label className="label" htmlFor="source-name">
              供給元名
            </label>
            <input
              id="source-name"
              required
              className="input"
              placeholder="移転サポート株式会社"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="source-contact">
              連絡先メール
            </label>
            <input
              id="source-contact"
              type="email"
              className="input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="source-csv">
            CSV サンプル (ヘッダ + 数行)
          </label>
          <textarea
            id="source-csv"
            rows={4}
            className="input font-mono text-xs"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-ghost" disabled={busy}>
          供給元を登録
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="subheading">供給元</h2>
        {sources === null ? (
          <Skeleton className="h-24" />
        ) : sources.length === 0 ? (
          <EmptyState
            title="まだ供給元がありません"
            hint="上のフォームに CSV サンプルを貼って登録すると BUILD WITH DEVIN が押せます。"
          />
        ) : (
          sources.map((source) => (
            <div key={source.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{source.name}</p>
                <p className="text-xs text-slate-500">
                  {source.source_type} / {source.status} / {dateTime(source.created_at)}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void build(source.id)}
              >
                BUILD WITH DEVIN
              </button>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="subheading">ジョブ</h2>
        {jobs.length === 0 ? (
          <EmptyState
            title="まだジョブはありません"
            hint="BUILD WITH DEVIN を押すと進捗が Realtime でここに並びます。DEVIN_API_KEY 未設定時は simulation モードで動きます。"
          />
        ) : (
          jobs.map((job) => <JobTimeline key={job.id} job={job} />)
        )}
      </section>
    </div>
  );
}

function JobTimeline({ job }: { job: DevinJob }) {
  const steps = Array.isArray(job.steps) ? job.steps : [];
  return (
    <article className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {job.summary ?? "アダプタ実装"}
            <span className="ml-2 text-xs uppercase tracking-wider text-slate-500">{job.status}</span>
          </p>
          <p className="text-xs text-slate-500">開始 {dateTime(job.started_at)}</p>
        </div>
        <div className="flex gap-3 text-xs">
          {job.session_url && (
            <a className="link" href={job.session_url} target="_blank" rel="noreferrer">
              セッションを見る
            </a>
          )}
          {job.pr_url && (
            <a className="link" href={job.pr_url} target="_blank" rel="noreferrer">
              PR を見る
            </a>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <ol className="mt-4 space-y-2 text-xs">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3">
              <span
                className={`h-2 w-2 rounded-full ${
                  step.state === "done"
                    ? "bg-relay"
                    : step.state === "running"
                      ? "animate-pulse bg-amberish"
                      : "bg-line"
                }`}
              />
              <span className={step.state === "pending" ? "text-slate-500" : "text-slate-200"}>
                {step.label}
              </span>
              {step.at && <span className="ml-auto text-slate-600">{dateTime(step.at)}</span>}
            </li>
          ))}
        </ol>
      )}

      {job.error_message && <p className="mt-3 text-xs text-alert">{job.error_message}</p>}
    </article>
  );
}
