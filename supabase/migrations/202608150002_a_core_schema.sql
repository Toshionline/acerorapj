-- OFFICE RELAY : core schema
-- 「まだ使用可能で譲渡意思のある企業資産を、廃棄決定前に次の利用者へ移転する」ための最小スキーマ。
-- プラットフォームは所有権を取得せず、企業間の移転を仲介するだけなので
-- 所有者は常に organizations 側に紐づく。

-- ---------------------------------------------------------------- organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null check (org_type in ('startup','donor','logistics','partner')),
  verified boolean not null default false,
  nearest_station text,                       -- 承諾前でも公開してよい粗い位置情報
  area_label text,                            -- 例: 東京都渋谷区
  location extensions.geography(point, 4326), -- GeoFit 用
  relay_credits integer not null default 0,   -- 非金銭の contribution / Trust スコア
  completed_transfers integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.organizations is 'Donor / Startup / Logistics / Partner の企業アカウント';

-- 正確な引取住所は別テーブルに隔離し、RLS で「承諾後のみ」開示する
create table public.org_locations (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  exact_address text not null,
  contact_name text,
  contact_phone text,
  access_note text
);
comment on table public.org_locations is '正確な引取住所。matches.status = accepted になるまで相手org には見えない';

create table public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  primary key (org_id, user_id)
);

-- ---------------------------------------------------------------- supply / demand
create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  quantity integer not null check (quantity > 0),
  condition text,
  pickup_deadline timestamptz,
  location extensions.geography(point, 4326),
  embedding extensions.vector(384),
  status text not null default 'available'
    check (status in ('available','reserved','transferred','expired')),
  created_at timestamptz not null default now()
);
create index items_embedding_idx on public.items using hnsw (embedding extensions.vector_cosine_ops);
create index items_location_idx on public.items using gist (location);
create index items_status_idx on public.items (status);

create table public.item_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  storage_path text not null,   -- {org_id}/{item_id}/{filename}
  created_at timestamptz not null default now()
);

create table public.needs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  category text,
  quantity integer,
  max_distance_km numeric default 25,
  latest_needed_at timestamptz,
  location extensions.geography(point, 4326),
  embedding extensions.vector(384),
  status text not null default 'open' check (status in ('open','fulfilled','closed')),
  created_at timestamptz not null default now()
);
create index needs_embedding_idx on public.needs using hnsw (embedding extensions.vector_cosine_ops);
create index needs_location_idx on public.needs using gist (location);

-- 双方向バーター: donor が欲しいサービス x startup が提供できるサービス
create table public.service_offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  embedding extensions.vector(384),
  created_at timestamptz not null default now()
);

create table public.service_wants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  embedding extensions.vector(384),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- matching result
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  need_id uuid not null references public.needs(id) on delete cascade,
  donor_org_id uuid not null references public.organizations(id) on delete cascade,
  recipient_org_id uuid not null references public.organizations(id) on delete cascade,
  asset_score numeric not null default 0,
  service_score numeric not null default 0,
  geo_score numeric not null default 0,
  urgency_score numeric not null default 0,
  trust_score numeric not null default 0,
  total_score numeric not null default 0,
  distance_km numeric,
  service_note text,           -- 当事者間で合意するサービス交換の内容 (プラットフォーム外の価値交換)
  status text not null default 'proposed'
    check (status in ('proposed','accepted','declined','expired')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, need_id)
);
create index matches_donor_idx on public.matches (donor_org_id, total_score desc);
create index matches_recipient_idx on public.matches (recipient_org_id, total_score desc);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid unique not null references public.matches(id) on delete cascade,
  delivery_method text default 'pickup',
  scheduled_at timestamptz,
  status text not null default 'pending' check (status in ('pending','scheduled','completed','cancelled')),
  completion_code text default upper(substr(encode(gen_random_bytes(4),'hex'),1,6)),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Relay Credits は換金性のない contribution スコア。イベントを台帳として残す。
create table public.relay_credit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  delta integer not null,
  reason text not null,
  match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.partner_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  partner_type text not null,
  consent_scope text not null,
  consented_at timestamptz not null default now(),
  status text not null default 'new'
);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.my_org_ids() to authenticated;
