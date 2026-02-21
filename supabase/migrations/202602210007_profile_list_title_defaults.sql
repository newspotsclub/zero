-- Normalize system list titles and switch future defaults to plain names.
-- Goal: avoid owner-prefixed titles like "Alice's Favorites".

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
    'Favorites',
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
    'Visited',
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

-- Backfill missing lists with plain defaults.
insert into public.profile_lists (user_id, title, visibility, slug)
select
  p.user_id,
  'Favorites',
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
  'Visited',
  'private',
  'visited'
from public.profiles p
where not exists (
  select 1
  from public.profile_lists pl
  where pl.user_id = p.user_id
    and pl.visibility = 'private'
);

-- Normalize old auto-generated owner-prefixed titles only.
update public.profile_lists
set title = 'Favorites'
where visibility = 'public'
  and (
    title ~* E'.+[''’]s[[:space:]]+favorites$'
    or lower(btrim(title)) in ('favorites', 'favourites')
  );

update public.profile_lists
set title = 'Visited'
where visibility = 'private'
  and (
    title ~* E'.+[''’]s[[:space:]]+visited$'
    or lower(btrim(title)) = 'visited'
  );
