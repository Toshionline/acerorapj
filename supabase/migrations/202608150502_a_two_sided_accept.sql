-- OFFICE RELAY : 双方 Accept で Transfer を生成する
--
-- 受け入れ基準 14「STARTUP Accept → DONOR Accept の双方承諾で Transfer を1件生成」に対し、
-- accept_match は片側の承諾で matches.status='accepted' にして Transfer を作っていた
-- (= 相手側に承諾ボタンが出ない)。承諾を組織ごとに記録し、両方揃った時だけ成立させる。
--   * donor_accepted_at / recipient_accepted_at を追加
--   * accept_match: 呼び出した組織の側だけを記録。両方揃ったら accepted + item reserved + Transfer
--   * 片側承諾の間は status='proposed' のままなので org_locations の住所は開示されない
--   * Realtime: 片側承諾を match_accept_pending として相手に通知する

alter table public.matches
  add column if not exists donor_accepted_at timestamptz,
  add column if not exists recipient_accepted_at timestamptz;

comment on column public.matches.donor_accepted_at is 'DONOR 側が承諾した時刻。両方揃うと status=accepted';
comment on column public.matches.recipient_accepted_at is 'STARTUP 側が承諾した時刻。両方揃うと status=accepted';

-- 片側承諾モデルで既に成立している行は双方承諾済みとして扱う。
update public.matches
   set donor_accepted_at = coalesce(donor_accepted_at, accepted_at, now()),
       recipient_accepted_at = coalesce(recipient_accepted_at, accepted_at, now())
 where status = 'accepted';

-- 成立時のみ transfers を返す。片側承諾だけの場合は null (呼び出し側は再取得して待ち状態を出す)。
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
  v_is_donor boolean;
  v_is_recipient boolean;
  v_donor_at timestamptz;
  v_recipient_at timestamptz;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if v_match.id is null then
    raise exception 'match not found: %', p_match_id;
  end if;

  v_is_donor := public.is_org_member(v_match.donor_org_id);
  v_is_recipient := public.is_org_member(v_match.recipient_org_id);
  if not (v_is_donor or v_is_recipient) then
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

  v_donor_at := case when v_is_donor then coalesce(v_match.donor_accepted_at, now())
                     else v_match.donor_accepted_at end;
  v_recipient_at := case when v_is_recipient then coalesce(v_match.recipient_accepted_at, now())
                         else v_match.recipient_accepted_at end;

  if v_donor_at is null or v_recipient_at is null then
    -- 片側だけの承諾。status は proposed のままなので住所は開示されない。
    update public.matches
       set donor_accepted_at = v_donor_at,
           recipient_accepted_at = v_recipient_at
     where id = v_match.id;
    return null;
  end if;

  update public.matches
     set status = 'accepted',
         accepted_at = now(),
         donor_accepted_at = v_donor_at,
         recipient_accepted_at = v_recipient_at
   where id = v_match.id;

  -- 双方が承諾した時点で在庫を押さえる。ここから org_locations の住所が相手に開示される。
  update public.items set status = 'reserved' where id = v_match.item_id;

  insert into public.transfers (match_id) values (v_match.id)
  on conflict (match_id) do update set match_id = excluded.match_id
  returning * into v_transfer;

  return v_transfer;
end;
$$;

comment on function public.accept_match(uuid) is '呼び出した組織の承諾を記録し、双方揃った時だけ Transfer を生成して返す';

-- 片側承諾を相手に知らせる。status が変わらない update は既定で通知を出さないため、
-- 承諾時刻の変化だけは match_accept_pending として通す。
create or replace function public.broadcast_match_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'match_found';
  else
    v_event := case new.status
                 when 'accepted' then 'match_accepted'
                 when 'declined' then 'match_declined'
                 when 'expired'  then 'match_expired'
                 else 'match_updated'
               end;
    if v_event = 'match_updated'
       and (new.donor_accepted_at is distinct from old.donor_accepted_at
            or new.recipient_accepted_at is distinct from old.recipient_accepted_at) then
      v_event := 'match_accept_pending';
    end if;
    -- スコアの再計算だけで通知を出すとデモ中に鳴りっぱなしになる
    if v_event = 'match_updated' and new.status = old.status and new.reason is not distinct from old.reason then
      return new;
    end if;
  end if;

  perform realtime.broadcast_changes(
    'org:' || new.donor_org_id::text || ':matches',
    v_event, tg_op, tg_table_name, tg_table_schema, new, old
  );
  perform realtime.broadcast_changes(
    'org:' || new.recipient_org_id::text || ':matches',
    v_event, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return new;
end;
$$;
