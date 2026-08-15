-- 所有者: A / チケット P5-A
-- organizations, org_locations, org_members, デモ用 auth.users。
-- 他のシードファイルはこの ID を参照するので、UUID は固定値で書くこと。

-- ---------------------------------------------------------------- demo users
-- デモは即ログインできることが最優先なので、メール確認済み + パスワードで作る
-- (マジックリンクは Mailpit で確認する動線も残す)。
-- 'officerelay' はローカル用の弱いパスワード。公開環境に seed を流す場合は
-- 投入後にパスワードを差し替え、web の VITE_DEMO_PASSWORD も同じ値にする:
--   update auth.users set encrypted_password = extensions.crypt('<新パスワード>', extensions.gen_salt('bf'))
--   where email like '%@officerelay.demo';
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- GoTrue はこれらを NOT NULL 前提で読むので、null のままだと
  -- パスワードログインが "Database error querying schema" で 500 になる
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111101', 'authenticated', 'authenticated',
   'donor@officerelay.demo', extensions.crypt('officerelay', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"NEXTMOVE 総務部"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111102', 'authenticated', 'authenticated',
   'startup@officerelay.demo', extensions.crypt('officerelay', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"AI Seed 代表"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111103', 'authenticated', 'authenticated',
   'admin@officerelay.demo', extensions.crypt('officerelay', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"OFFICE RELAY 運営"}', now(), now(),
   '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@officerelay.demo'
on conflict do nothing;

-- ---------------------------------------------------------------- organizations
insert into public.organizations (id, name, org_type, verified, nearest_station, area_label, location, relay_credits, completed_transfers)
values
  ('22222222-2222-4222-8222-000000000001', 'NEXTMOVE株式会社', 'donor', true,  '渋谷駅',   '東京都渋谷区', public.geo_point(35.658034, 139.701636), 320, 4),
  ('22222222-2222-4222-8222-000000000002', '株式会社トウキョウ・ワークス', 'donor', true, '品川駅', '東京都港区', public.geo_point(35.628471, 139.738760), 150, 2),
  ('22222222-2222-4222-8222-000000000003', 'AI Seed株式会社', 'startup', false, '五反田駅', '東京都品川区', public.geo_point(35.626446, 139.723444), 60, 1),
  ('22222222-2222-4222-8222-000000000004', 'Loopy Robotics株式会社', 'startup', false, '大崎駅', '東京都品川区', public.geo_point(35.619772, 139.728439), 20, 0),
  ('22222222-2222-4222-8222-000000000005', 'リレー物流サービス', 'logistics', true, '田町駅', '東京都港区', public.geo_point(35.645736, 139.747575), 0, 0),
  ('22222222-2222-4222-8222-000000000006', '株式会社オフィスサーキュラー', 'partner', true, '新宿駅', '東京都新宿区', public.geo_point(35.689592, 139.700413), 0, 0)
on conflict (id) do nothing;

-- 正確な住所は org_locations に隔離する。承諾 (matches.status = 'accepted') まで相手には見えない。
insert into public.org_locations (org_id, exact_address, contact_name, contact_phone, access_note)
values
  ('22222222-2222-4222-8222-000000000001', '東京都渋谷区道玄坂1-2-3 NEXTMOVEビル 8F', '総務部 佐藤', '03-1000-0001', '搬出は平日9-18時。荷捌き場はビル裏手、事前予約制'),
  ('22222222-2222-4222-8222-000000000002', '東京都港区港南2-4-5 トウキョウワークス品川 12F', '管理部 田中', '03-1000-0002', 'エレベーター養生が必要'),
  ('22222222-2222-4222-8222-000000000003', '東京都品川区西五反田1-6-7 五反田スタートアップハブ 3F', '代表 鈴木', '03-1000-0003', '搬入口は建物北側'),
  ('22222222-2222-4222-8222-000000000004', '東京都品川区大崎3-1-2 大崎ラボ 5F', '代表 高橋', '03-1000-0004', null)
on conflict (org_id) do nothing;

insert into public.org_members (org_id, user_id, role)
values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-111111111101', 'owner'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-111111111102', 'owner'),
  ('22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-111111111103', 'owner')
on conflict do nothing;
