-- 所有者: A / チケット P5-A
-- embedding の充填 -> マッチ再計算 -> デモ用のスコア fixture。
-- 「計算は本物、表示は保証」(dev-plan §6-1) のための最後の一手。

-- 1) キューに積まれた embedding を DB 内フォールバックで埋める。
--    OPENAI_API_KEY があるときは、この後に generate-embeddings を叩けば本物の embedding で上書きされる。
select public.process_embedding_jobs_fallback(1000);

-- 2) 全件マッチ再計算 (pgvector + PostGIS が実際に走る)
select public.recompute_matches();

-- 3) 発表の山になる 1 件だけ、スコア内訳を固定する。
--    NEXTMOVE の「メッシュバックチェア」x AI Seed の「会議室用のイス」。
--    0.35*0.97 + 0.20*0.96 + 0.20*0.93 + 0.15*0.95 + 0.10*0.80 = 0.9400
update public.matches
   set asset_score = 0.97,
       service_score = 0.96,
       geo_score = 0.93,
       urgency_score = 0.95,
       trust_score = 0.80,
       total_score = 0.94,
       distance_km = 3.6,
       service_note = 'AI Seed が NEXTMOVE 総務向けに生成AI研修 (半日) を提供する'
 where item_id = '33333333-3333-4333-8333-000000000002'
   and need_id = '44444444-4444-4444-8444-000000000001';

-- 4) 過去の完了実績 (Relay Credits の残高と辻褄を合わせる)
insert into public.relay_credit_events (org_id, delta, reason)
values
  ('22222222-2222-4222-8222-000000000001', 100, 'asset_donated'),
  ('22222222-2222-4222-8222-000000000001', 100, 'asset_donated'),
  ('22222222-2222-4222-8222-000000000001', 100, 'asset_donated'),
  ('22222222-2222-4222-8222-000000000001', 20,  'rated_highly'),
  ('22222222-2222-4222-8222-000000000003', 30,  'pickup_completed'),
  ('22222222-2222-4222-8222-000000000003', 30,  'pickup_completed')
on conflict do nothing;
