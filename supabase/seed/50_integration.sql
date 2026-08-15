-- 所有者: B / チケット P4-B2
-- integration_sources のデモ供給元 (例: 東京オフィス移転パートナーズ) と サンプル CSV。
-- Connector Factory の画面で「BUILD WITH DEVIN」を押す対象になる。

insert into public.integration_sources (id, name, source_type, spec_url, contact_email, status, sample_csv)
values
  ('77777777-7777-4777-8777-000000000001', '東京オフィス移転パートナーズ', 'csv',
   'https://example.com/tokyo-office-partners/spec.pdf', 'ops@example.com', 'draft',
   '管理番号,品名,分類,数量,状態ランク,所在地,搬出期限,写真URL
TOP-1001,オフィスデスク W1200 木目,机,32台,B,東京都新宿区西新宿2-1-1,2026/09/30,https://example.com/img/1001.jpg
TOP-1002,事務用回転椅子 肘なし,椅子,48台,C,東京都新宿区西新宿2-1-1,2026/09/30,https://example.com/img/1002.jpg
TOP-1003,液晶ディスプレイ 24インチ,モニタ,15台,A,東京都新宿区西新宿2-1-1,2026/10/15,
TOP-1004,スチールロッカー 6人用,収納,6台,B,東京都渋谷区代々木1-1-1,2026/10/15,https://example.com/img/1004.jpg'),

  ('77777777-7777-4777-8777-000000000002', 'サーキュラー什器商社', 'api',
   'https://example.com/circular-api/openapi.json', 'api@example.com', 'draft',
   'sku,name,category,qty,grade,warehouse,available_until
CF-88,Meeting Table 2400x1200,table,4,B,Tokyo Koto-ku,2026-11-20T09:00:00+09:00
CF-89,Task Chair (mesh),chair,60,A,Tokyo Koto-ku,2026-11-20T09:00:00+09:00')
on conflict (id) do nothing;
