-- Storage bucket for listing photos. PRD §15.5 B20: "Photo storage is Supabase
-- Storage with client side compression. No processing pipeline." photo_urls
-- are stored as plain public URLs (§7.1), so the bucket is public-read.
--
-- Path convention: <seller_id>/<uuid>-<original filename>. Write access is
-- scoped to the uploader's own folder via storage.foldername(name)[1].

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "listing_photos_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'listing-photos');

create policy "listing_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
