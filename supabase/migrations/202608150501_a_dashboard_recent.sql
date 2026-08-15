-- P5-E: ダッシュボードを 1 RPC で完結させるため、org_dashboard に
-- 「掲載中の資産」「募集中のニーズ」の直近リストを追加する（集計は既存のまま）。

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
    ), '[]'::jsonb),
    'recent_items', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc)
      from (
        select jsonb_build_object(
                 'id', i.id,
                 'title', i.title,
                 'category', i.category,
                 'quantity', i.quantity,
                 'status', i.status,
                 'pickup_deadline', i.pickup_deadline,
                 'created_at', i.created_at
               ) as x
        from public.items i
        where i.owner_org_id = p_org_id
        order by i.created_at desc
        limit 5
      ) t
    ), '[]'::jsonb),
    'recent_needs', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc)
      from (
        select jsonb_build_object(
                 'id', n.id,
                 'title', n.title,
                 'category', n.category,
                 'quantity', n.quantity,
                 'status', n.status,
                 'latest_needed_at', n.latest_needed_at,
                 'created_at', n.created_at
               ) as x
        from public.needs n
        where n.org_id = p_org_id
        order by n.created_at desc
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into v_result
  from public.organizations o
  where o.id = p_org_id;

  return v_result;
end;
$$;

grant execute on function public.org_dashboard(uuid) to authenticated;
