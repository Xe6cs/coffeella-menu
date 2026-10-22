-- Coffeella V2 — security review fixes (2026-10-22)
-- Runs after 20261022000300. Nothing here changes menu data.

-- 1) Objects created later must not be exposed to the API automatically.
--    Supabase grants ALL on new public tables/functions to anon/authenticated by
--    default; from now on every new object needs an explicit GRANT.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- EXECUTE for PUBLIC is a global default and cannot be revoked "in schema",
-- so remove it for functions created by this role in any schema.
alter default privileges revoke execute on functions from public;

-- 2) Favorites only for products the user is allowed to see.
drop policy favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_user())
    and exists (select 1 from public.products p where p.id = product_id)
  );

-- 3) Banned users cannot change the display name shown on their reviews.
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_user()))
  with check (id = (select auth.uid()));

-- 4) Public settings stay small (they are readable by everyone; never store secrets).
alter table public.site_settings
  add constraint site_settings_value_size check (pg_column_size(value) <= 16384);

-- 5) Recent sign-in check, based on the authentication time Supabase Auth puts
--    in the access token ("amr" claim). Token refreshes do not reset it.
create or replace function public.recently_authenticated(p_max_age_seconds integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select max((m ->> 'timestamp')::bigint)
    from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
    ) as m
  ), 0) >= extract(epoch from now())::bigint - p_max_age_seconds;
$$;

revoke execute on function public.recently_authenticated(integer) from public, anon, authenticated;

-- Ownership transfer: both the request and the acceptance require a sign-in
-- within the last 10 minutes.
create or replace function public.request_ownership_transfer(p_to_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_permission('ownership.transfer');
  if public.current_staff_role() is distinct from 'owner' then
    raise exception 'only the current owner can transfer ownership' using errcode = '42501';
  end if;
  if not public.recently_authenticated(600) then
    raise exception 'sign in again to confirm this action' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.staff_roles r
    join public.profiles p on p.id = r.user_id
    join auth.users u on u.id = r.user_id
    where r.user_id = p_to_user and r.role = 'admin' and not p.is_banned and u.email_confirmed_at is not null
  ) then
    raise exception 'the new owner must be an active admin with a confirmed email' using errcode = '22023';
  end if;
  update public.ownership_transfers
     set status = 'cancelled', decided_at = now()
   where status = 'pending';
  insert into public.ownership_transfers (from_user, to_user, expires_at)
  values (auth.uid(), p_to_user, now() + interval '48 hours')
  returning id into v_id;
  perform public.log_audit('ownership.request', 'user', p_to_user::text, jsonb_build_object('transfer_id', v_id));
  return v_id;
end;
$$;

create or replace function public.accept_ownership_transfer(p_transfer_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.ownership_transfers;
begin
  select * into v_t from public.ownership_transfers where id = p_transfer_id for update;
  if v_t.id is null or v_t.to_user is distinct from auth.uid() then
    raise exception 'transfer not found' using errcode = 'P0002';
  end if;
  if v_t.status <> 'pending' then
    raise exception 'transfer is no longer pending' using errcode = '22023';
  end if;
  if v_t.expires_at <= now() then
    update public.ownership_transfers set status = 'expired', decided_at = now() where id = v_t.id;
    perform public.log_audit('ownership.expire', 'user', v_t.to_user::text, jsonb_build_object('transfer_id', v_t.id));
    return 'expired';
  end if;
  if not public.recently_authenticated(600) then
    raise exception 'sign in again to confirm this action' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.staff_roles r
    where r.user_id = v_t.from_user and r.role = 'owner'
  ) then
    raise exception 'the requesting user is no longer the owner' using errcode = '22023';
  end if;
  if public.current_staff_role() is distinct from 'admin' then
    raise exception 'only an active admin can accept ownership' using errcode = '42501';
  end if;
  update public.staff_roles set role = 'admin', granted_by = v_t.to_user, granted_at = now()
   where user_id = v_t.from_user;
  update public.staff_roles set role = 'owner', granted_by = v_t.from_user, granted_at = now()
   where user_id = v_t.to_user;
  update public.ownership_transfers set status = 'accepted', decided_at = now() where id = v_t.id;
  perform public.log_audit('ownership.accept', 'user', v_t.to_user::text,
    jsonb_build_object('transfer_id', v_t.id, 'previous_owner', v_t.from_user));
  return 'accepted';
end;
$$;

-- 6) Least privilege for e-mail addresses: only roles that can ban
--    (owner/admin) see them; moderators see names and status only.
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  display_name text,
  role public.staff_role,
  is_banned boolean,
  email_confirmed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_see_email boolean;
begin
  perform public.require_permission('users.read');
  v_can_see_email := public.has_permission('users.ban');
  return query
    select p.id,
           case when v_can_see_email then u.email::text else null end,
           p.display_name, r.role, p.is_banned,
           u.email_confirmed_at is not null, p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.staff_roles r on r.user_id = p.id
    where p_search is null or p_search = ''
       or (v_can_see_email and u.email ilike '%' || p_search || '%')
       or p.display_name ilike '%' || p_search || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- CREATE OR REPLACE keeps existing grants, but re-state them explicitly.
revoke execute on function public.request_ownership_transfer(uuid) from public, anon;
revoke execute on function public.accept_ownership_transfer(uuid) from public, anon;
revoke execute on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.request_ownership_transfer(uuid) to authenticated;
grant execute on function public.accept_ownership_transfer(uuid) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
