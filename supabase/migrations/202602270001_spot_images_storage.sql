-- Store spot images in Supabase Storage and reference object IDs from spots table.

alter table public.spots
add column if not exists image_storage_id text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'spot-images',
  'spot-images',
  true,
  8388608,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read spot images'
  ) then
    create policy "Anyone can read spot images"
    on storage.objects
    for select
    using (bucket_id = 'spot-images');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can upload spot images'
  ) then
    create policy "Admins can upload spot images"
    on storage.objects
    for insert
    with check (
      bucket_id = 'spot-images'
      and exists (
        select 1
        from public.profiles p
        where p.user_id = auth.uid() and p.role = 'admin'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can update spot images'
  ) then
    create policy "Admins can update spot images"
    on storage.objects
    for update
    using (
      bucket_id = 'spot-images'
      and exists (
        select 1
        from public.profiles p
        where p.user_id = auth.uid() and p.role = 'admin'
      )
    )
    with check (
      bucket_id = 'spot-images'
      and exists (
        select 1
        from public.profiles p
        where p.user_id = auth.uid() and p.role = 'admin'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can delete spot images'
  ) then
    create policy "Admins can delete spot images"
    on storage.objects
    for delete
    using (
      bucket_id = 'spot-images'
      and exists (
        select 1
        from public.profiles p
        where p.user_id = auth.uid() and p.role = 'admin'
      )
    );
  end if;
end $$;
