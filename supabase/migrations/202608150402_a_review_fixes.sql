-- OFFICE RELAY : Devin Review 指摘の修正 (PR #34)
--
--   1) 内部専用関数が PUBLIC 経由で RPC 実行できた (revoke ... from authenticated では消えない)
--   2) recompute_matches がスコアだけ更新して古い reason を残す
--   3) cron の embedding フォールバックが処理中ジョブを上書きする
--   4) integration_sources を誰でも書き換えられる (Devin プロンプトへの注入経路)
--   5) Realtime の match_updated / transfer_cancelled が契約に無い

-- ---------------------------------------------------------------- 1) PUBLIC の EXECUTE を剥がす
revoke execute on function public.award_credits(uuid, integer, text, uuid) from public;
revoke execute on function public.claim_embedding_jobs(integer) from public;
revoke execute on function public.apply_embedding(uuid, double precision[]) from public;
revoke execute on function public.fail_embedding_job(uuid, text) from public;
revoke execute on function public.process_embedding_jobs_fallback(integer) from public;
revoke execute on function public.expire_overdue_items() from public;
revoke execute on function public.process_stale_embedding_jobs(interval) from public;
revoke execute on function relay.write_embedding(text, uuid, extensions.vector) from public;

grant execute on function public.claim_embedding_jobs(integer) to service_role;
grant execute on function public.apply_embedding(uuid, double precision[]) to service_role;
grant execute on function public.fail_embedding_job(uuid, text) to service_role;
grant execute on function public.process_embedding_jobs_fallback(integer) to service_role;
grant execute on function public.expire_overdue_items() to service_role;
grant execute on function public.process_stale_embedding_jobs(interval) to service_role;

-- ---------------------------------------------------------------- 2) スコアが動いたら reason を捨てる
create or replace function public.recompute_matches(p_item_id uuid default null, p_need_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_count integer;
begin
  with candidate as (
    select
      i.id as item_id,
      n.id as need_id,
      i.owner_org_id as donor_org_id,
      n.org_id as recipient_org_id,
      s.asset_score, s.service_score, s.geo_score, s.urgency_score, s.trust_score,
      s.total_score, s.distance_km
    from public.items i
    join public.needs n on n.org_id <> i.owner_org_id
    cross join lateral public.score_pair(i.id, n.id) s
    where i.status = 'available'
      and n.status = 'open'
      and (p_item_id is null or i.id = p_item_id)
      and (p_need_id is null or n.id = p_need_id)
      and s.total_score >= public.match_score_threshold()
  ), upserted as (
    insert into public.matches as m (
      item_id, need_id, donor_org_id, recipient_org_id,
      asset_score, service_score, geo_score, urgency_score, trust_score, total_score, distance_km
    )
    select
      item_id, need_id, donor_org_id, recipient_org_id,
      asset_score, service_score, geo_score, urgency_score, trust_score, total_score, distance_km
    from candidate
    on conflict (item_id, need_id) do update set
      asset_score   = excluded.asset_score,
      service_score = excluded.service_score,
      geo_score     = excluded.geo_score,
      urgency_score = excluded.urgency_score,
      trust_score   = excluded.trust_score,
      total_score   = excluded.total_score,
      distance_km   = excluded.distance_km,
      -- 内訳が変わったら説明文は無効。explain-match が作り直す。
      reason = case
                 when abs(coalesce(m.total_score, 0) - excluded.total_score) > 0.01 then null
                 else m.reason
               end,
      reason_generated_at = case
                 when abs(coalesce(m.total_score, 0) - excluded.total_score) > 0.01 then null
                 else m.reason_generated_at
               end
    -- 承諾済み / 辞退済みのマッチはスコアで上書きしない
    where m.status = 'proposed'
    returning 1
  )
  select count(*) into v_count from upserted;

  return coalesce(v_count, 0);
end;
$$;

revoke execute on function public.recompute_matches(uuid, uuid) from public;
grant execute on function public.recompute_matches(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 3) 処理中ジョブは cron の対象外
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
  -- pending のみ。processing は Edge Function が OpenAI で生成中なので触らない
  -- (試行回数を使い切ったものだけ簡易 embedding で救済する)。
  for r in
    select id, entity_type, entity_id, content
      from relay.embedding_jobs
     where status = 'pending'
       and created_at < now() - p_older_than
     order by created_at
     limit 200
     for update skip locked
  loop
    perform relay.write_embedding(r.entity_type, r.entity_id, relay.hash_embedding(r.content));
    update relay.embedding_jobs set status = 'done', processed_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.process_stale_embedding_jobs(interval) from public;
grant execute on function public.process_stale_embedding_jobs(interval) to service_role;

-- ---------------------------------------------------------------- 4) integration_sources は登録者のみ書き換え可
alter table public.integration_sources
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

drop policy if exists integration_sources_insert_authenticated on public.integration_sources;
drop policy if exists integration_sources_update_authenticated on public.integration_sources;

create policy integration_sources_insert_own on public.integration_sources
  for insert to authenticated
  with check (created_by = auth.uid());

-- status は Edge Function (service_role) が進める。登録者は仕様の修正だけできる。
create policy integration_sources_update_own on public.integration_sources
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
