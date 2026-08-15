-- OFFICE RELAY : P2-A1 pgvector の中身 (キュー / trigger / 生成元テキスト / HNSW) と PostGIS ヘルパー
--
-- 設計は docs/dev-plan.md §3.5 の通り:
--   次元      384 固定 (OpenAI text-embedding-3-small の dimensions=384)
--   対象      items / needs / service_offers / service_wants の 4 テーブル
--   生成方式  trigger -> relay.embedding_jobs -> Edge Function generate-embeddings の非同期
--   距離      cosine (1 - (a <=> b) を 0..1 にクランプ)
--   代替      OPENAI_API_KEY が無いときは DB 内の決定的ハッシュ埋め込み

-- サービス側にも HNSW を張る (ServiceFit も pgvector で引く)
create index if not exists service_offers_embedding_idx
  on public.service_offers using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists service_wants_embedding_idx
  on public.service_wants using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------- 生成元テキスト
-- items と needs で同じ関数を使う = 同じベクトル空間に埋める。ここを分けると AssetFit が壊れる。
create or replace function relay.embedding_text(
  p_title text,
  p_description text default null,
  p_category text default null,
  p_condition text default null
)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(
      lower(concat_ws(' ',
        coalesce(p_title, ''),
        coalesce(p_description, ''),
        coalesce(p_category, ''),
        coalesce(p_condition, '')
      )),
      '\s+', ' ', 'g')),
    '');
$$;

-- ---------------------------------------------------------------- 決定的ハッシュ埋め込み (フォールバック)
-- 会場のネットワークが死んでもデモが止まらないための保険。
-- 意味類似ではなく表層一致 (トークン + 文字bigram) の signed hashing なので、発表では正直にそう説明する。
create or replace function relay.hash_embedding(p_text text)
returns extensions.vector
language plpgsql
immutable
set search_path = relay, extensions, public
as $$
declare
  v_dims constant integer := 384;
  v_vec double precision[] := array_fill(0::double precision, array[v_dims]);
  v_norm double precision := 0;
  v_clean text;
  v_token text;
  v_idx integer;
  v_sign double precision;
  i integer;
begin
  v_clean := coalesce(trim(regexp_replace(lower(p_text), '\s+', ' ', 'g')), '');
  if v_clean = '' then
    return null;
  end if;

  -- 単語トークン
  for v_token in select unnest(regexp_split_to_array(v_clean, '[^[:alnum:]ぁ-んァ-ヶ一-龥ー]+')) loop
    if length(v_token) > 0 then
      v_idx := (abs(hashtext(v_token)) % v_dims) + 1;
      v_sign := case when hashtext('sign:' || v_token) % 2 = 0 then 1 else -1 end;
      v_vec[v_idx] := v_vec[v_idx] + v_sign;
    end if;
  end loop;

  -- 日本語対策の文字 bigram (分かち書きが無くても部分一致が効く)
  for i in 1..greatest(length(v_clean) - 1, 0) loop
    v_token := substr(v_clean, i, 2);
    if v_token !~ '^\s' then
      v_idx := (abs(hashtext('bg:' || v_token)) % v_dims) + 1;
      v_sign := case when hashtext('bgsign:' || v_token) % 2 = 0 then 1 else -1 end;
      v_vec[v_idx] := v_vec[v_idx] + (0.5 * v_sign);
    end if;
  end loop;

  for i in 1..v_dims loop
    v_norm := v_norm + (v_vec[i] * v_vec[i]);
  end loop;
  v_norm := sqrt(v_norm);
  if v_norm = 0 then
    return null;
  end if;
  for i in 1..v_dims loop
    v_vec[i] := v_vec[i] / v_norm;
  end loop;

  return ('[' || array_to_string(v_vec, ',') || ']')::extensions.vector;
end;
$$;

-- ---------------------------------------------------------------- キュー
create table if not exists relay.embedding_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('item','need','service_offer','service_want')),
  entity_id uuid not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists embedding_jobs_pending_idx on relay.embedding_jobs (status, created_at);
create unique index if not exists embedding_jobs_open_entity_idx
  on relay.embedding_jobs (entity_type, entity_id)
  where status in ('pending','processing');

-- relay スキーマは API から直接触らせない (公開 RPC 経由のみ)
alter table relay.embedding_jobs enable row level security;

-- ---------------------------------------------------------------- enqueue trigger
create or replace function relay.enqueue_embedding()
returns trigger
language plpgsql
security definer
set search_path = relay, public, extensions
as $$
declare
  v_type text;
  v_content text;
begin
  v_type := tg_argv[0];
  if v_type in ('item') then
    v_content := relay.embedding_text(new.title, new.description, new.category, new.condition);
  elsif v_type = 'need' then
    v_content := relay.embedding_text(new.title, new.description, new.category, null);
  else
    v_content := relay.embedding_text(new.title, new.description, null, null);
  end if;

  if v_content is null then
    return new;
  end if;

  insert into relay.embedding_jobs (entity_type, entity_id, content)
  values (v_type, new.id, v_content)
  on conflict (entity_type, entity_id) where status in ('pending','processing')
  do update set content = excluded.content, status = 'pending', attempts = 0, error_message = null;

  return new;
end;
$$;

create trigger items_embedding_enqueue
  after insert or update of title, description, category, condition on public.items
  for each row execute function relay.enqueue_embedding('item');

create trigger needs_embedding_enqueue
  after insert or update of title, description, category on public.needs
  for each row execute function relay.enqueue_embedding('need');

create trigger service_offers_embedding_enqueue
  after insert or update of title, description on public.service_offers
  for each row execute function relay.enqueue_embedding('service_offer');

create trigger service_wants_embedding_enqueue
  after insert or update of title, description on public.service_wants
  for each row execute function relay.enqueue_embedding('service_want');

-- ---------------------------------------------------------------- 適用
-- embedding を書き戻し、その行に関係する match だけを再計算する。
create or replace function relay.write_embedding(p_type text, p_id uuid, p_embedding extensions.vector)
returns void
language plpgsql
volatile
security definer
set search_path = relay, public, extensions
as $$
declare
  v_org uuid;
  r record;
begin
  if p_type = 'item' then
    update public.items set embedding = p_embedding where id = p_id;
    perform public.recompute_matches(p_item_id => p_id);
  elsif p_type = 'need' then
    update public.needs set embedding = p_embedding where id = p_id;
    perform public.recompute_matches(p_need_id => p_id);
  elsif p_type = 'service_offer' then
    update public.service_offers set embedding = p_embedding where id = p_id returning org_id into v_org;
    -- サービスは ServiceFit にしか効かないが、相手側の item を跨いでスコアが動く
    for r in select id from public.needs where org_id = v_org and status = 'open' loop
      perform public.recompute_matches(p_need_id => r.id);
    end loop;
  elsif p_type = 'service_want' then
    update public.service_wants set embedding = p_embedding where id = p_id returning org_id into v_org;
    for r in select id from public.items where owner_org_id = v_org and status = 'available' loop
      perform public.recompute_matches(p_item_id => r.id);
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------- 公開 RPC (Edge Function 用 / service_role のみ)
create or replace function public.claim_embedding_jobs(p_limit integer default 50)
returns table (id uuid, entity_type text, entity_id uuid, content text)
language sql
volatile
security definer
set search_path = relay, public
as $$
  update relay.embedding_jobs j
     set status = 'processing', attempts = j.attempts + 1
   where j.id in (
     select id from relay.embedding_jobs
      where status = 'pending' and attempts < 3
      order by created_at
      limit greatest(coalesce(p_limit, 50), 1)
      for update skip locked
   )
  returning j.id, j.entity_type, j.entity_id, j.content;
$$;

create or replace function public.apply_embedding(p_job_id uuid, p_embedding double precision[])
returns void
language plpgsql
volatile
security definer
set search_path = relay, public, extensions
as $$
declare
  v_job relay.embedding_jobs;
begin
  select * into v_job from relay.embedding_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'embedding job not found: %', p_job_id;
  end if;
  if array_length(p_embedding, 1) <> 384 then
    raise exception 'embedding must have 384 dimensions, got %', coalesce(array_length(p_embedding, 1), 0);
  end if;

  perform relay.write_embedding(
    v_job.entity_type,
    v_job.entity_id,
    ('[' || array_to_string(p_embedding, ',') || ']')::extensions.vector
  );

  update relay.embedding_jobs
     set status = 'done', processed_at = now(), error_message = null
   where id = p_job_id;
end;
$$;

create or replace function public.fail_embedding_job(p_job_id uuid, p_error text)
returns void
language sql
volatile
security definer
set search_path = relay, public
as $$
  update relay.embedding_jobs
     set status = case when attempts >= 3 then 'failed' else 'pending' end,
         error_message = p_error
   where id = p_job_id;
$$;

-- OPENAI_API_KEY が無いときに Edge Function / seed から呼ぶ DB 内フォールバック。
create or replace function public.process_embedding_jobs_fallback(p_limit integer default 200)
returns integer
language plpgsql
volatile
security definer
set search_path = relay, public, extensions
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id, entity_type, entity_id, content
      from relay.embedding_jobs
     where status in ('pending','processing')
     order by created_at
     limit greatest(coalesce(p_limit, 200), 1)
  loop
    perform relay.write_embedding(r.entity_type, r.entity_id, relay.hash_embedding(r.content));
    update relay.embedding_jobs set status = 'done', processed_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.embedding_queue_depth()
returns integer
language sql
stable
security definer
set search_path = relay, public
as $$
  select count(*)::integer from relay.embedding_jobs where status in ('pending','processing');
$$;

-- ---------------------------------------------------------------- PostGIS ヘルパー
-- フロントは緯度経度を渡すだけで geography を作れるようにする (WKT を書かせない)。
create or replace function public.geo_point(p_lat double precision, p_lon double precision)
returns extensions.geography
language sql
immutable
set search_path = extensions, public
as $$
  select case
    when p_lat is null or p_lon is null then null
    else st_setsrid(st_makepoint(p_lon, p_lat), 4326)::extensions.geography
  end;
$$;

revoke execute on function public.claim_embedding_jobs(integer) from authenticated, anon;
revoke execute on function public.apply_embedding(uuid, double precision[]) from authenticated, anon;
revoke execute on function public.fail_embedding_job(uuid, text) from authenticated, anon;
grant execute on function public.claim_embedding_jobs(integer) to service_role;
grant execute on function public.apply_embedding(uuid, double precision[]) to service_role;
grant execute on function public.fail_embedding_job(uuid, text) to service_role;
grant execute on function public.process_embedding_jobs_fallback(integer) to service_role;
grant execute on function public.embedding_queue_depth() to authenticated, service_role;
grant execute on function public.geo_point(double precision, double precision) to authenticated, service_role;
