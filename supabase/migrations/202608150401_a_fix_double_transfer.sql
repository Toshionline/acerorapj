-- OFFICE RELAY : 二重譲渡の防止
--
-- 譲渡が完了しても同じ item の他マッチが 'proposed' のまま残るため、
-- それを accept すると item が transferred -> reserved に巻き戻り、
-- 2 回目の complete_transfer で Relay Credits (+100 / +30) が二重加算されていた。
--   1) accept_match: item が available / reserved 以外なら受け付けない
--   2) complete_transfer: 同じ item に残る proposed マッチを閉じる

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
  v_item_status text;
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

  select status into v_item_status from public.items where id = v_match.item_id for update;
  if v_item_status is distinct from 'available' then
    -- 既に別のマッチで押さえられている / 譲渡済み / 期限切れ
    update public.matches set status = 'expired' where id = v_match.id;
    raise exception 'item is % and cannot be accepted', coalesce(v_item_status, 'missing');
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
  if v_transfer.status = 'cancelled' then
    raise exception 'transfer is cancelled and cannot be completed';
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

  -- 同じ item を狙っていた他の候補は成立し得ないので閉じる
  update public.matches
     set status = 'expired'
   where item_id = v_match.item_id
     and id <> v_match.id
     and status = 'proposed';

  -- 満たされた need に紐づく他の候補も同様
  update public.matches
     set status = 'expired'
   where need_id = v_match.need_id
     and id <> v_match.id
     and status = 'proposed';

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
