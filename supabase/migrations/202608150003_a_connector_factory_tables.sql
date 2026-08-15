-- OFFICE RELAY : Connector Factory のテーブルのみ (Phase 0 契約凍結)
--
-- 新しい供給元 (オフィス移転業者・什器商社) が増えるたびに人間が連携コードを書くのではなく、
-- Supabase が供給元を検知して Devin がコネクタ実装を書く。その台帳。
-- RLS は P1-A1、Realtime trigger は P4-A3 で別マイグレーションとして追加する。

create table public.integration_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in ('csv','api','sftp','webhook')),
  spec_url text,
  sample_csv text,                 -- CSV ヘッダ + サンプル数行
  contact_email text,
  status text not null default 'draft' check (status in ('draft','building','review','active','failed')),
  created_at timestamptz not null default now()
);

create table public.devin_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.integration_sources(id) on delete cascade,
  devin_session_id text,
  session_url text,
  status text not null default 'queued'
    check (status in ('queued','running','blocked','finished','failed')),
  pr_url text,
  summary text,
  steps jsonb not null default '[]'::jsonb,   -- 管理画面のタイムライン表示用
  started_at timestamptz default now(),
  completed_at timestamptz,
  error_message text
);
create index devin_jobs_source_idx on public.devin_jobs (source_id, started_at desc);
