-- OFFICE RELAY : extensions
-- pgvector  : 物品 x サービスの意味マッチ (AssetFit / ServiceFit)
-- PostGIS   : 引取距離の評価 (GeoFit)
-- pg_cron   : pickup_deadline 超過の自動 expire
-- pg_net    : cron から Edge Function を呼ぶ

create schema if not exists relay;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

grant usage on schema relay to authenticated, anon, service_role;
