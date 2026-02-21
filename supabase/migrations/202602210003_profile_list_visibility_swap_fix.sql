-- Fix visibility swap so private<->public toggles do not violate uniqueness mid-update.

do $$
declare
  visibility_index_oid oid;
  index_is_constraint boolean;
  constraint_is_deferrable boolean;
begin
  select c.oid
  into visibility_index_oid
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profile_lists_user_visibility_unique'
    and c.relkind = 'i'
  limit 1;

  if visibility_index_oid is not null then
    select exists (
      select 1
      from pg_constraint
      where conindid = visibility_index_oid
    )
    into index_is_constraint;

    if not index_is_constraint then
      execute 'drop index public.profile_lists_user_visibility_unique';
    end if;
  end if;

  select condeferrable
  into constraint_is_deferrable
  from pg_constraint
  where conrelid = 'public.profile_lists'::regclass
    and conname = 'profile_lists_user_visibility_unique'
  limit 1;

  if constraint_is_deferrable = false then
    alter table public.profile_lists
    drop constraint profile_lists_user_visibility_unique;
    constraint_is_deferrable := null;
  end if;

  if constraint_is_deferrable is null then
    alter table public.profile_lists
    add constraint profile_lists_user_visibility_unique
    unique (user_id, visibility)
    deferrable initially immediate;
  end if;
end $$;

create or replace function public.toggle_profile_list_visibility(target_list_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  current_visibility text;
  opposite_visibility text;
  sibling_list_id uuid;
begin
  select visibility
  into current_visibility
  from public.profile_lists
  where id = target_list_id
    and user_id = auth.uid()
  for update;

  if current_visibility is null then
    raise exception 'List not found or not owned by current user';
  end if;

  opposite_visibility := case
    when current_visibility = 'public' then 'private'
    else 'public'
  end;

  set constraints profile_lists_user_visibility_unique deferred;

  select id
  into sibling_list_id
  from public.profile_lists
  where user_id = auth.uid()
    and visibility = opposite_visibility
    and id <> target_list_id
  limit 1
  for update;

  if sibling_list_id is null then
    update public.profile_lists
    set visibility = opposite_visibility
    where id = target_list_id;
  else
    update public.profile_lists
    set visibility = case
      when id = target_list_id then opposite_visibility
      when id = sibling_list_id then current_visibility
      else visibility
    end
    where id in (target_list_id, sibling_list_id);
  end if;
end;
$$;
