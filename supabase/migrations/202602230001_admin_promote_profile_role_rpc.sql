-- Allow admins to promote another signed-up user to admin by email.

create or replace function public.promote_profile_to_admin_by_email(target_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  caller_is_admin boolean;
  target_profile public.profiles%rowtype;
  role_changed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  )
  into caller_is_admin;

  if not caller_is_admin then
    raise exception 'Only admins can promote users';
  end if;

  normalized_email := lower(btrim(coalesce(target_email, '')));
  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  select *
  into target_profile
  from public.profiles
  where lower(coalesce(email, '')) = normalized_email
  limit 1;

  if target_profile.user_id is null then
    raise exception 'No profile found for email %', normalized_email;
  end if;

  if target_profile.role <> 'admin' then
    update public.profiles
    set role = 'admin'
    where user_id = target_profile.user_id
    returning * into target_profile;

    role_changed := true;
  end if;

  return jsonb_build_object(
    'user_id', target_profile.user_id,
    'email', target_profile.email,
    'role', target_profile.role,
    'changed', role_changed
  );
end;
$$;
