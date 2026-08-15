-- 出品フォーム (P2-C1) が使う Storage バケット。
-- 一覧はサムネイルを公開 URL でキャッシュするため public バケットにする。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-media',
  'item-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 書き込みは自組織のプレフィックス配下のみ。パスは {org_id}/{item_id}/...
create policy "item media insert by own org"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'item-media'
    and (storage.foldername(name))[1] in (
      select om.org_id::text from public.org_members om where om.user_id = auth.uid()
    )
  );

create policy "item media delete by own org"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'item-media'
    and (storage.foldername(name))[1] in (
      select om.org_id::text from public.org_members om where om.user_id = auth.uid()
    )
  );

create policy "item media read"
  on storage.objects for select to public
  using (bucket_id = 'item-media');
