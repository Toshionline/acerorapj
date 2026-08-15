-- OFFICE RELAY : P3-A2 pg_cron
--
-- NSM は「撤去期限までに再利用先を確定した資産数」なので、期限を過ぎた資産は
-- 自動で候補から外す。ここを人手にすると KPI の定義が崩れる。

create or replace function public.expire_overdue_items()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.items
       set status = 'expired'
     where status = 'available'
       and pickup_deadline is not null
       and pickup_deadline < now()
    returning id
  )
  select count(*) into v_count from expired;

  update public.matches m
     set status = 'expired'
   where m.status = 'proposed'
     and exists (select 1 from public.items i where i.id = m.item_id and i.status = 'expired');

  return coalesce(v_count, 0);
end;
$$;

-- Edge Function (generate-embeddings) が呼ばれない / 落ちている場合の保険。
-- 一定時間キューに残った分だけ DB 内の決定的ハッシュ埋め込みで埋める。
create or replace function public.process_stale_embedding_jobs(p_older_than interval default '2 minutes')
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
       and created_at < now() - p_older_than
     order by created_at
     limit 200
  loop
    perform relay.write_embedding(r.entity_type, r.entity_id, relay.hash_embedding(r.content));
    update relay.embedding_jobs set status = 'done', processed_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.expire_overdue_items() to service_role;
grant execute on function public.process_stale_embedding_jobs(interval) to service_role;

select cron.schedule(
  'office-relay-expire-items',
  '* * * * *',
  $$ select public.expire_overdue_items() $$
);

select cron.schedule(
  'office-relay-embedding-fallback',
  '* * * * *',
  $$ select public.process_stale_embedding_jobs() $$
);
