-- Ensure user-related list data is removed when auth user is deleted.
-- This migration hardens FKs + adds a cleanup trigger for extra safety.

-- Clean obvious orphans first so FK validation can succeed.
delete from public.profile_list_items pli
where not exists (
  select 1 from public.profile_lists pl where pl.id = pli.list_id
);

delete from public.profile_lists pl
where not exists (
  select 1 from auth.users u where u.id = pl.user_id
);

delete from public.profile_lists pl
where not exists (
  select 1 from public.profiles p where p.user_id = pl.user_id
);

-- Recreate FK to auth.users with ON DELETE CASCADE for profile_lists.user_id.
do $$
declare
  fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.profile_lists'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and a.attname = 'user_id'
  loop
    execute format(
      'alter table public.profile_lists drop constraint %I',
      fk.conname
    );
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_lists_user_id_auth_fkey'
      and conrelid = 'public.profile_lists'::regclass
  ) then
    alter table public.profile_lists
      add constraint profile_lists_user_id_auth_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

-- Add cascade from profiles -> profile_lists so profile row deletion also cleans up.
do $$
declare
  fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.profile_lists'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and a.attname = 'user_id'
  loop
    execute format(
      'alter table public.profile_lists drop constraint %I',
      fk.conname
    );
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_lists_user_id_profiles_fkey'
      and conrelid = 'public.profile_lists'::regclass
  ) then
    alter table public.profile_lists
      add constraint profile_lists_user_id_profiles_fkey
      foreign key (user_id)
      references public.profiles(user_id)
      on delete cascade;
  end if;
end $$;

-- Safety cleanup trigger: hard-delete related app rows when auth user is deleted.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profile_lists where user_id = old.id;
  delete from public.user_spot_status where user_id = old.id;
  delete from public.profiles where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;

create trigger on_auth_user_deleted
after delete on auth.users
for each row execute procedure public.handle_deleted_user();
