-- OFFICE RELAY : P1-A1 (続き) Data API ロールへの明示 GRANT
--
-- config.toml の api.auto_expose_new_tables は未設定 = 新規テーブルは自動公開されない。
-- そのため RLS とは別に、テーブル単位で権限を明示的に付与する。
-- 実際のアクセス制御は 202608150101_a_rls.sql のポリシーが担う。GRANT は「入口」だけ。

-- service_role は Edge Function 専用。RLS はバイパスされる。
grant select, insert, update, delete on all tables in schema public to service_role;

-- anon は一切読めない (ランディングは静的情報のみ)。
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- authenticated
-- 読み取り: カタログ情報 + 当事者限定テーブル (絞り込みはポリシー側)
grant select on
  public.organizations,
  public.org_locations,
  public.org_members,
  public.items,
  public.item_media,
  public.needs,
  public.service_offers,
  public.service_wants,
  public.matches,
  public.transfers,
  public.relay_credit_events,
  public.partner_leads,
  public.integration_sources,
  public.devin_jobs
to authenticated;

-- 書き込み: 自組織の出品 / ニーズ / サービス / 住所
grant insert, update, delete on
  public.org_locations,
  public.items,
  public.item_media,
  public.needs,
  public.service_offers,
  public.service_wants
to authenticated;

grant update on public.organizations to authenticated;
grant insert on public.partner_leads to authenticated;
grant insert, update on public.integration_sources to authenticated;

-- matches / transfers / relay_credit_events は直接書き換えさせない。
-- accept_match / decline_match / complete_transfer / cancel_transfer (security definer) 経由のみ。
