-- OFFICE RELAY : P1-A2 マッチング
--
--   Score = 0.35*AssetFit + 0.20*ServiceFit + 0.20*GeoFit + 0.15*UrgencyFit + 0.10*TrustFit
--             pgvector        pgvector          PostGIS        Postgres         Postgres
--
-- ベクトル演算は必ず DB 側で行う (アプリ側で類似度を計算しない)。
-- スコアは事前計算して matches に保存し、画面は matches を読むだけにする。

-- マッチ理由 (P3-B2 の explain-match が非同期で埋めるキャッシュ列)
alter table public.matches add column if not exists reason text;
alter table public.matches add column if not exists reason_generated_at timestamptz;

-- 一致とみなす下限。これを下回るペアは matches に作らない (画面のノイズを減らす)。
create or replace function public.match_score_threshold()
returns numeric language sql immutable as $$ select 0.30::numeric $$;

-- ---------------------------------------------------------------- score_pair
create or replace function public.score_pair(p_item_id uuid, p_need_id uuid)
returns table (
  asset_score numeric,
  service_score numeric,
  geo_score numeric,
  urgency_score numeric,
  trust_score numeric,
  total_score numeric,
  distance_km numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_item public.items;
  v_need public.needs;
  v_asset numeric;
  v_service numeric;
  v_geo numeric;
  v_urgency numeric;
  v_trust numeric;
  v_distance numeric;
  v_days numeric;
begin
  select * into v_item from public.items where id = p_item_id;
  select * into v_need from public.needs where id = p_need_id;
  if v_item.id is null or v_need.id is null then
    return;
  end if;

  -- AssetFit : 「エグゼクティブデスク W1600」と「オフィス机」を同じ物として扱うための意味類似
  if v_item.embedding is not null and v_need.embedding is not null then
    v_asset := greatest(0, least(1, 1 - (v_item.embedding <=> v_need.embedding)));
  else
    -- embedding がまだ生成されていない間だけのカテゴリ一致フォールバック
    v_asset := case when lower(coalesce(v_item.category,'')) = lower(coalesce(v_need.category,'')) then 0.5 else 0.2 end;
  end if;

  -- ServiceFit : donor が欲しいサービス x startup が提供できるサービスの最良ペア
  select coalesce(max(greatest(0, least(1, 1 - (w.embedding <=> o.embedding)))), 0)
    into v_service
  from public.service_wants w
  join public.service_offers o on true
  where w.org_id = v_item.owner_org_id
    and o.org_id = v_need.org_id
    and w.embedding is not null
    and o.embedding is not null;

  -- GeoFit : 撤去期限に間に合うかは距離が支配的 (PostGIS)
  if v_item.location is not null and v_need.location is not null then
    v_distance := round((st_distance(v_item.location, v_need.location) / 1000.0)::numeric, 2);
    v_geo := greatest(0, least(1, 1 - (v_distance / greatest(coalesce(v_need.max_distance_km, 25), 1))));
  else
    v_distance := null;
    v_geo := 0.5;   -- 位置未登録は中立
  end if;

  -- UrgencyFit : 撤去期限が近いほど高い (= 先に救うべき資産)
  if v_item.pickup_deadline is null then
    v_urgency := 0.3;
  else
    v_days := extract(epoch from (v_item.pickup_deadline - now())) / 86400.0;
    v_urgency := case when v_days < 0 then 0 else greatest(0, least(1, 1 - (v_days / 30.0))) end;
    -- 受け取り側の希望期日より後にしか引き取れないなら価値が下がる
    if v_need.latest_needed_at is not null and v_item.pickup_deadline > v_need.latest_needed_at then
      v_urgency := v_urgency * 0.5;
    end if;
  end if;

  -- TrustFit : 換金性のない Relay Credits と実績から算出
  select least(1,
           (case when o.verified then 0.4 else 0 end)
           + least(0.3, (o.relay_credits / 1000.0) * 0.3)
           + least(0.3, (o.completed_transfers / 10.0) * 0.3))
    into v_trust
  from public.organizations o
  where o.id = v_item.owner_org_id;
  v_trust := coalesce(v_trust, 0);

  return query select
    round(v_asset, 4),
    round(v_service, 4),
    round(v_geo, 4),
    round(v_urgency, 4),
    round(v_trust, 4),
    round(0.35 * v_asset + 0.20 * v_service + 0.20 * v_geo + 0.15 * v_urgency + 0.10 * v_trust, 4),
    v_distance;
end;
$$;
comment on function public.score_pair(uuid, uuid) is 'item x need の 5 指標スコア。AssetFit/ServiceFit は pgvector の cosine、GeoFit は PostGIS';

-- ---------------------------------------------------------------- recompute_matches
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
      s.*
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
      distance_km   = excluded.distance_km
    -- 承諾済み / 辞退済みのマッチはスコアで上書きしない
    where m.status = 'proposed'
    returning 1
  )
  select count(*) into v_count from upserted;

  return coalesce(v_count, 0);
end;
$$;
comment on function public.recompute_matches(uuid, uuid) is 'item / need を指定して matches を再計算する。両方 null なら全件';

-- ---------------------------------------------------------------- credits
create or replace function public.award_credits(p_org_id uuid, p_delta integer, p_reason text, p_match_id uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.relay_credit_events (org_id, delta, reason, match_id)
  values (p_org_id, p_delta, p_reason, p_match_id);

  update public.organizations
     set relay_credits = greatest(0, relay_credits + p_delta)
   where id = p_org_id;
end;
$$;
comment on function public.award_credits(uuid, integer, text, uuid) is 'Relay Credits は換金性のない貢献スコア。台帳 (relay_credit_events) と残高を同時に更新する';

-- ---------------------------------------------------------------- accept_match
create or replace function public.accept_match(p_match_id uuid)
returns public.transfers
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_transfer public.transfers;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if v_match.id is null then
    raise exception 'match not found: %', p_match_id;
  end if;
  if not (public.is_org_member(v_match.donor_org_id) or public.is_org_member(v_match.recipient_org_id)) then
    raise exception 'not a party of this match';
  end if;
  if v_match.status = 'accepted' then
    select * into v_transfer from public.transfers where match_id = v_match.id;
    return v_transfer;
  end if;
  if v_match.status <> 'proposed' then
    raise exception 'match is % and cannot be accepted', v_match.status;
  end if;

  update public.matches
     set status = 'accepted', accepted_at = now()
   where id = v_match.id;

  -- 承諾した時点で在庫を押さえる。ここから org_locations の住所が相手に開示される。
  update public.items set status = 'reserved' where id = v_match.item_id;

  insert into public.transfers (match_id) values (v_match.id)
  on conflict (match_id) do update set match_id = excluded.match_id
  returning * into v_transfer;

  return v_transfer;
end;
$$;

-- ---------------------------------------------------------------- decline_match
create or replace function public.decline_match(p_match_id uuid)
returns public.matches
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if v_match.id is null then
    raise exception 'match not found: %', p_match_id;
  end if;
  if not (public.is_org_member(v_match.donor_org_id) or public.is_org_member(v_match.recipient_org_id)) then
    raise exception 'not a party of this match';
  end if;

  update public.matches set status = 'declined' where id = v_match.id returning * into v_match;
  return v_match;
end;
$$;

-- ---------------------------------------------------------------- complete_transfer
create or replace function public.complete_transfer(p_transfer_id uuid, p_completion_code text default null)
returns public.transfers
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_transfer public.transfers;
  v_match public.matches;
begin
  select * into v_transfer from public.transfers where id = p_transfer_id for update;
  if v_transfer.id is null then
    raise exception 'transfer not found: %', p_transfer_id;
  end if;

  select * into v_match from public.matches where id = v_transfer.match_id;
  if not (public.is_org_member(v_match.donor_org_id) or public.is_org_member(v_match.recipient_org_id)) then
    raise exception 'not a party of this transfer';
  end if;
  if v_transfer.status = 'completed' then
    return v_transfer;
  end if;
  if p_completion_code is not null and upper(p_completion_code) <> upper(v_transfer.completion_code) then
    raise exception 'invalid completion code';
  end if;

  update public.transfers
     set status = 'completed', completed_at = now()
   where id = v_transfer.id
  returning * into v_transfer;

  -- NSM: 撤去期限までに再利用先が確定した資産
  update public.items set status = 'transferred' where id = v_match.item_id;
  update public.needs set status = 'fulfilled' where id = v_match.need_id;

  update public.organizations
     set completed_transfers = completed_transfers + 1
   where id in (v_match.donor_org_id, v_match.recipient_org_id);

  perform public.award_credits(v_match.donor_org_id, 100, 'asset_donated', v_match.id);
  perform public.award_credits(v_match.recipient_org_id, 30, 'pickup_completed', v_match.id);
  -- サービス交換の合意があれば提供側 (startup) に加点する
  if v_match.service_note is not null then
    perform public.award_credits(v_match.recipient_org_id, 80, 'service_delivered', v_match.id);
  end if;

  return v_transfer;
end;
$$;

-- ---------------------------------------------------------------- cancel_transfer
create or replace function public.cancel_transfer(p_transfer_id uuid, p_reason text default 'cancelled')
returns public.transfers
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_transfer public.transfers;
  v_match public.matches;
begin
  select * into v_transfer from public.transfers where id = p_transfer_id for update;
  if v_transfer.id is null then
    raise exception 'transfer not found: %', p_transfer_id;
  end if;
  select * into v_match from public.matches where id = v_transfer.match_id;
  if not (public.is_org_member(v_match.donor_org_id) or public.is_org_member(v_match.recipient_org_id)) then
    raise exception 'not a party of this transfer';
  end if;

  update public.transfers set status = 'cancelled' where id = v_transfer.id returning * into v_transfer;
  update public.items set status = 'available' where id = v_match.item_id;
  update public.matches set status = 'declined' where id = v_match.id;
  perform public.award_credits(v_match.recipient_org_id, -50, p_reason, v_match.id);

  return v_transfer;
end;
$$;

-- ---------------------------------------------------------------- dashboard (1 RPC = 1 row)
-- 画面はテーブルごとに select しない。ダッシュボードはこの 1 本だけを呼ぶ (§3.7)。
create or replace function public.org_dashboard(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'not a member of this org';
  end if;

  select jsonb_build_object(
    'org_id', p_org_id,
    'relay_credits', o.relay_credits,
    'completed_transfers', o.completed_transfers,
    'items_available', (select count(*) from public.items i where i.owner_org_id = p_org_id and i.status = 'available'),
    'items_expiring_7d', (select count(*) from public.items i
                           where i.owner_org_id = p_org_id and i.status = 'available'
                             and i.pickup_deadline between now() and now() + interval '7 days'),
    'needs_open', (select count(*) from public.needs n where n.org_id = p_org_id and n.status = 'open'),
    'matches_proposed', (select count(*) from public.matches m
                          where m.status = 'proposed' and (m.donor_org_id = p_org_id or m.recipient_org_id = p_org_id)),
    'transfers_pending', (select count(*) from public.transfers t
                           join public.matches m on m.id = t.match_id
                          where t.status in ('pending','scheduled')
                            and (m.donor_org_id = p_org_id or m.recipient_org_id = p_org_id)),
    'rescued_before_deadline', (select count(*) from public.transfers t
                                 join public.matches m on m.id = t.match_id
                                where t.status = 'completed' and (m.donor_org_id = p_org_id or m.recipient_org_id = p_org_id)),
    'top_matches', coalesce((
      select jsonb_agg(x order by x->>'total_score' desc)
      from (
        select jsonb_build_object(
                 'id', m.id,
                 'item_title', i.title,
                 'need_title', n.title,
                 'total_score', m.total_score,
                 'asset_score', m.asset_score,
                 'service_score', m.service_score,
                 'geo_score', m.geo_score,
                 'urgency_score', m.urgency_score,
                 'trust_score', m.trust_score,
                 'distance_km', m.distance_km,
                 'reason', m.reason,
                 'status', m.status
               ) as x
        from public.matches m
        join public.items i on i.id = m.item_id
        join public.needs n on n.id = m.need_id
        where m.status = 'proposed' and (m.donor_org_id = p_org_id or m.recipient_org_id = p_org_id)
        order by m.total_score desc
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into v_result
  from public.organizations o
  where o.id = p_org_id;

  return v_result;
end;
$$;

grant execute on function public.score_pair(uuid, uuid) to authenticated, service_role;
grant execute on function public.recompute_matches(uuid, uuid) to authenticated, service_role;
grant execute on function public.accept_match(uuid) to authenticated;
grant execute on function public.decline_match(uuid) to authenticated;
grant execute on function public.complete_transfer(uuid, text) to authenticated;
grant execute on function public.cancel_transfer(uuid, text) to authenticated;
grant execute on function public.org_dashboard(uuid) to authenticated;
revoke execute on function public.award_credits(uuid, integer, text, uuid) from authenticated, anon;
