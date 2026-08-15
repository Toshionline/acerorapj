-- OFFICE RELAY : P3-A1 / P4-A3 Realtime (Broadcast from Database)
--
-- channel 契約 (docs/edge-function-contracts.md):
--   org:{org_id}:matches  private  match_found / match_accepted / match_declined / match_expired
--                                  transfer_scheduled / transfer_completed
--   connector-factory     private  devin_job_{status}
--
-- Postgres の trigger から realtime.broadcast_changes() で送るので、
-- クライアントは matches テーブルを購読しない (RLS を跨いだ漏れが起きない)。

-- ---------------------------------------------------------------- channel authorization
create or replace function public.can_access_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org text;
begin
  if p_topic = 'connector-factory' then
    return auth.uid() is not null;
  end if;

  if p_topic ~ '^org:[0-9a-fA-F-]{36}:matches$' then
    v_org := split_part(p_topic, ':', 2);
    return public.is_org_member(v_org::uuid);
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_realtime_topic(text) to authenticated;

create policy realtime_messages_select_own_topics on realtime.messages
  for select to authenticated
  using (public.can_access_realtime_topic((select realtime.topic())));

create policy realtime_messages_insert_own_topics on realtime.messages
  for insert to authenticated
  with check (public.can_access_realtime_topic((select realtime.topic())));

-- ---------------------------------------------------------------- matches
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

create trigger matches_broadcast
  after insert or update on public.matches
  for each row execute function public.broadcast_match_change();

-- ---------------------------------------------------------------- transfers
create or replace function public.broadcast_transfer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_event text;
begin
  select * into v_match from public.matches where id = new.match_id;
  if v_match.id is null then
    return new;
  end if;

  v_event := case new.status
               when 'completed' then 'transfer_completed'
               when 'cancelled' then 'transfer_cancelled'
               else 'transfer_scheduled'
             end;

  perform realtime.broadcast_changes(
    'org:' || v_match.donor_org_id::text || ':matches',
    v_event, tg_op, tg_table_name, tg_table_schema, new, old
  );
  perform realtime.broadcast_changes(
    'org:' || v_match.recipient_org_id::text || ':matches',
    v_event, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return new;
end;
$$;

create trigger transfers_broadcast
  after insert or update on public.transfers
  for each row execute function public.broadcast_transfer_change();

-- ---------------------------------------------------------------- devin_jobs (P4-A3)
create or replace function public.broadcast_devin_job_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'connector-factory',
    'devin_job_' || new.status, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return new;
end;
$$;

create trigger devin_jobs_broadcast
  after insert or update on public.devin_jobs
  for each row execute function public.broadcast_devin_job_change();
