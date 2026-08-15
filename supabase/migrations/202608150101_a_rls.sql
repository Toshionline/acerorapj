-- OFFICE RELAY : P1-A1 RLS
--
-- 方針
--   * 匿名 (anon) からは公開テーブルを一切読めない。ランディングは静的情報のみで成立させる。
--   * 資産 / ニーズ / サービスの「カタログ情報」はログイン済みの全組織が読める (マッチングの前提)。
--   * 書き込みは常に自組織のみ。
--   * 正確な引取住所 (org_locations) は自組織 + matches.status = 'accepted' の相手組織にだけ開く。
--   * matches / transfers / credits は security definer 関数からのみ書き換える (直接 update を許さない)。

alter table public.organizations       enable row level security;
alter table public.org_locations       enable row level security;
alter table public.org_members         enable row level security;
alter table public.items               enable row level security;
alter table public.item_media          enable row level security;
alter table public.needs               enable row level security;
alter table public.service_offers      enable row level security;
alter table public.service_wants       enable row level security;
alter table public.matches             enable row level security;
alter table public.transfers           enable row level security;
alter table public.relay_credit_events enable row level security;
alter table public.partner_leads       enable row level security;
alter table public.integration_sources enable row level security;
alter table public.devin_jobs          enable row level security;

revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- helpers
-- 自組織と相手組織の間に成立済み (accepted) のマッチがあるか。住所開示の唯一の条件。
create or replace function public.has_accepted_match_with(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.status = 'accepted'
      and (
        (m.donor_org_id = target_org     and public.is_org_member(m.recipient_org_id)) or
        (m.recipient_org_id = target_org and public.is_org_member(m.donor_org_id))
      )
  );
$$;
comment on function public.has_accepted_match_with(uuid) is '承諾済みマッチの相手組織かどうか。org_locations の開示判定に使う';

grant execute on function public.has_accepted_match_with(uuid) to authenticated;

-- ---------------------------------------------------------------- organizations
-- 企業の「粗い」プロフィール (名前 / 最寄駅 / エリア / Trust) はログイン済みなら誰でも読める。
create policy organizations_select_authenticated on public.organizations
  for select to authenticated using (true);

create policy organizations_update_own on public.organizations
  for update to authenticated
  using (public.is_org_member(id))
  with check (public.is_org_member(id));

-- ---------------------------------------------------------------- org_locations (正確な住所)
create policy org_locations_select_own_or_accepted on public.org_locations
  for select to authenticated
  using (public.is_org_member(org_id) or public.has_accepted_match_with(org_id));

create policy org_locations_write_own on public.org_locations
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- ---------------------------------------------------------------- org_members
create policy org_members_select_own_orgs on public.org_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(org_id));

-- ---------------------------------------------------------------- items / item_media
create policy items_select_authenticated on public.items
  for select to authenticated using (true);

create policy items_insert_own on public.items
  for insert to authenticated with check (public.is_org_member(owner_org_id));

create policy items_update_own on public.items
  for update to authenticated
  using (public.is_org_member(owner_org_id))
  with check (public.is_org_member(owner_org_id));

create policy items_delete_own on public.items
  for delete to authenticated using (public.is_org_member(owner_org_id));

create policy item_media_select_authenticated on public.item_media
  for select to authenticated using (true);

create policy item_media_write_own on public.item_media
  for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.owner_org_id)))
  with check (exists (select 1 from public.items i where i.id = item_id and public.is_org_member(i.owner_org_id)));

-- ---------------------------------------------------------------- needs
create policy needs_select_authenticated on public.needs
  for select to authenticated using (true);

create policy needs_write_own on public.needs
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- ---------------------------------------------------------------- services
create policy service_offers_select_authenticated on public.service_offers
  for select to authenticated using (true);

create policy service_offers_write_own on public.service_offers
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy service_wants_select_authenticated on public.service_wants
  for select to authenticated using (true);

create policy service_wants_write_own on public.service_wants
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- ---------------------------------------------------------------- matches / transfers
-- 当事者だけが見える。書き換えは accept_match / complete_transfer (security definer) 経由のみ。
create policy matches_select_party on public.matches
  for select to authenticated
  using (public.is_org_member(donor_org_id) or public.is_org_member(recipient_org_id));

create policy transfers_select_party on public.transfers
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id
      and (public.is_org_member(m.donor_org_id) or public.is_org_member(m.recipient_org_id))
  ));

-- ---------------------------------------------------------------- credits / leads
create policy relay_credit_events_select_own on public.relay_credit_events
  for select to authenticated using (public.is_org_member(org_id));

create policy partner_leads_select_own on public.partner_leads
  for select to authenticated using (public.is_org_member(org_id));

create policy partner_leads_insert_own on public.partner_leads
  for insert to authenticated with check (public.is_org_member(org_id));

-- ---------------------------------------------------------------- Connector Factory
-- 供給元の登録は管理画面 (ログイン済み) から行う。job の更新は Edge Function (service_role) のみ。
create policy integration_sources_select_authenticated on public.integration_sources
  for select to authenticated using (true);

create policy integration_sources_insert_authenticated on public.integration_sources
  for insert to authenticated with check (true);

create policy integration_sources_update_authenticated on public.integration_sources
  for update to authenticated using (true) with check (true);

create policy devin_jobs_select_authenticated on public.devin_jobs
  for select to authenticated using (true);
