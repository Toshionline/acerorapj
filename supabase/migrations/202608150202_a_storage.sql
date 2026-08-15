-- OFFICE RELAY : Storage バケット item-media
--
-- 出品写真は状態判断の必須材料なので item は写真必須 (P2-C1)。
-- パスは {org_id}/{item_id}/{filename} 固定。先頭セグメントが org_id なので
-- RLS で「自組織のフォルダにしか書けない」を表現できる。
-- 一覧はサムネイル + キャッシュ可能な公開 URL で出したいので public バケットにする
-- (写真に個人情報は載せない運用。正確な住所は org_locations 側で保護している)。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-media', 'item-media', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy item_media_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'item-media');

create policy item_media_insert_own_org on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-media'
    and public.is_org_member(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy item_media_update_own_org on storage.objects
  for update to authenticated
  using (
    bucket_id = 'item-media'
    and public.is_org_member(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy item_media_delete_own_org on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'item-media'
    and public.is_org_member(nullif((storage.foldername(name))[1], '')::uuid)
  );
