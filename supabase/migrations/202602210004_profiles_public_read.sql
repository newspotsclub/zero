-- Allow anonymous/public read of profiles that have a username set.
-- This enables shareable /u/:username profile pages.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Anyone can read public profiles'
  ) then
    create policy "Anyone can read public profiles"
    on public.profiles
    for select
    using (
      nullif(btrim(username), '') is not null
    );
  end if;
end $$;
