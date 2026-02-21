-- Fix inserts that target (user_id, visibility) after visibility uniqueness became DEFERRABLE.
-- ON CONFLICT cannot use deferrable unique constraints as arbiters.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  computed_display_name text;
begin
  computed_display_name := coalesce(
    nullif(initcap(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[._-]+', ' ', 'g')), ''),
    'NewSpots User'
  );

  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, computed_display_name)
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = coalesce(public.profiles.display_name, excluded.display_name);

  insert into public.profile_lists (user_id, title, visibility, slug)
  select
    new.id,
    format('%s''s Favorites', computed_display_name),
    'public',
    'favorites'
  where not exists (
    select 1
    from public.profile_lists pl
    where pl.user_id = new.id
      and pl.visibility = 'public'
  );

  insert into public.profile_lists (user_id, title, visibility, slug)
  select
    new.id,
    format('%s''s Visited', computed_display_name),
    'private',
    'visited'
  where not exists (
    select 1
    from public.profile_lists pl
    where pl.user_id = new.id
      and pl.visibility = 'private'
  );

  return new;
end;
$$;

-- Keep backfill idempotent without ON CONFLICT(user_id, visibility).
insert into public.profile_lists (user_id, title, visibility, slug)
select
  p.user_id,
  format('%s''s Favorites', coalesce(nullif(p.display_name, ''), 'NewSpots User')),
  'public',
  'favorites'
from public.profiles p
where not exists (
  select 1
  from public.profile_lists pl
  where pl.user_id = p.user_id
    and pl.visibility = 'public'
);

insert into public.profile_lists (user_id, title, visibility, slug)
select
  p.user_id,
  format('%s''s Visited', coalesce(nullif(p.display_name, ''), 'NewSpots User')),
  'private',
  'visited'
from public.profiles p
where not exists (
  select 1
  from public.profile_lists pl
  where pl.user_id = p.user_id
    and pl.visibility = 'private'
);
