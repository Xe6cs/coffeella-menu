-- Coffeella V2 — security
-- Permissions model, table privileges, RLS policies and privileged functions.
--
-- Principles:
--  * Explicit privileges: nothing relies on Supabase's default "grant all".
--  * RLS on every table; privileged changes go through SECURITY DEFINER
--    functions that check permissions inside the database and write the audit log.
--  * All definer functions pin search_path = '' and use schema-qualified names.

-- ---------------------------------------------------------------------------
-- Role → permission map (static configuration)
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role, permission) values
  ('owner', 'menu.manage'), ('owner', 'reviews.moderate'), ('owner', 'users.read'),
  ('owner', 'users.ban'), ('owner', 'staff.manage'), ('owner', 'staff.manage_admins'),
  ('owner', 'pages.edit'), ('owner', 'pages.publish'), ('owner', 'settings.edit'),
  ('owner', 'audit.read'), ('owner', 'media.upload'), ('owner', 'ownership.transfer'),
  ('admin', 'menu.manage'), ('admin', 'reviews.moderate'), ('admin', 'users.read'),
  ('admin', 'users.ban'), ('admin', 'staff.manage'), ('admin', 'pages.edit'),
  ('admin', 'pages.publish'), ('admin', 'settings.edit'), ('admin', 'audit.read'),
  ('admin', 'media.upload'),
  ('editor', 'menu.manage'), ('editor', 'pages.edit'), ('editor', 'media.upload'),
  ('moderator', 'reviews.moderate'), ('moderator', 'users.read')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Identity helpers (used by RLS policies)
-- ---------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and not p.is_banned
  );
$$;

create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select r.role
  from public.staff_roles r
  join public.profiles p on p.id = r.user_id
  where r.user_id = auth.uid() and not p.is_banned;
$$;

create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles r
    join public.role_permissions rp on rp.role = r.role
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and not p.is_banned
      and rp.permission = perm
  );
$$;

-- Internal: append to the audit log. Not callable by API roles.
create or replace function public.log_audit(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Create a profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 60))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Table privileges (explicit; RLS still applies on top)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Menu: public read, staff write (RLS checks menu.manage)
grant select on public.categories, public.product_groups, public.products to anon, authenticated;
grant insert, update, delete on public.categories, public.product_groups, public.products to authenticated;

-- Profiles: own row; only display_name/locale are editable by the user
grant select on public.profiles to authenticated;
grant update (display_name, locale) on public.profiles to authenticated;

-- Staff roles / permissions: read only (changes via functions)
grant select on public.staff_roles, public.role_permissions to authenticated;

-- Reviews: anon sees public columns only; customers write rating/comment only
grant select (id, product_id, rating, comment, is_hidden, created_at, updated_at) on public.reviews to anon;
grant select on public.reviews to authenticated;
grant insert (product_id, rating, comment) on public.reviews to authenticated;
grant update (rating, comment) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

-- Favorites: own rows
grant select, delete on public.favorites to authenticated;
grant insert (product_id) on public.favorites to authenticated;

-- Pages: published pages are public; status/publishing only via functions
grant select on public.pages to anon, authenticated;
grant insert (slug, title_ar, title_en, transition, theme_mode) on public.pages to authenticated;
grant update (slug, title_ar, title_en, transition, theme_mode) on public.pages to authenticated;
grant delete on public.pages to authenticated;
grant select on public.page_versions to anon, authenticated;
grant insert (page_id, content, note) on public.page_versions to authenticated;
grant select, insert, update, delete on public.page_templates to authenticated;

-- Settings: public read, staff write
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

-- Uploads
grant select on public.upload_rules to authenticated;
grant update (allowed_mime_types, max_bytes, description_ar, description_en) on public.upload_rules to authenticated;
grant select, delete on public.media_assets to authenticated;
grant insert (purpose, bucket, path, mime_type, size_bytes, width, height) on public.media_assets to authenticated;

-- Audit / ownership: read only
grant select on public.audit_log, public.ownership_transfers to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.categories enable row level security;
alter table public.product_groups enable row level security;
alter table public.products enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.pages enable row level security;
alter table public.page_versions enable row level security;
alter table public.page_templates enable row level security;
alter table public.site_settings enable row level security;
alter table public.upload_rules enable row level security;
alter table public.media_assets enable row level security;
alter table public.audit_log enable row level security;
alter table public.ownership_transfers enable row level security;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('users.read')));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Staff roles / permissions
create policy staff_roles_select on public.staff_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users.read')));
create policy role_permissions_select on public.role_permissions for select to authenticated
  using ((select public.current_staff_role()) is not null);

-- Menu: visitors see visible items whose parents are visible; staff see all
create policy categories_select on public.categories for select to anon, authenticated
  using (is_visible or (select public.has_permission('menu.manage')));
create policy categories_insert on public.categories for insert to authenticated
  with check ((select public.has_permission('menu.manage')));
create policy categories_update on public.categories for update to authenticated
  using ((select public.has_permission('menu.manage')))
  with check ((select public.has_permission('menu.manage')));
create policy categories_delete on public.categories for delete to authenticated
  using ((select public.has_permission('menu.manage')));

create policy product_groups_select on public.product_groups for select to anon, authenticated
  using (
    (is_visible and exists (select 1 from public.categories c where c.id = category_id and c.is_visible))
    or (select public.has_permission('menu.manage'))
  );
create policy product_groups_insert on public.product_groups for insert to authenticated
  with check ((select public.has_permission('menu.manage')));
create policy product_groups_update on public.product_groups for update to authenticated
  using ((select public.has_permission('menu.manage')))
  with check ((select public.has_permission('menu.manage')));
create policy product_groups_delete on public.product_groups for delete to authenticated
  using ((select public.has_permission('menu.manage')));

create policy products_select on public.products for select to anon, authenticated
  using (
    (is_visible and exists (
      select 1 from public.product_groups g
      join public.categories c on c.id = g.category_id
      where g.id = group_id and g.is_visible and c.is_visible))
    or (select public.has_permission('menu.manage'))
  );
create policy products_insert on public.products for insert to authenticated
  with check ((select public.has_permission('menu.manage')));
create policy products_update on public.products for update to authenticated
  using ((select public.has_permission('menu.manage')))
  with check ((select public.has_permission('menu.manage')));
create policy products_delete on public.products for delete to authenticated
  using ((select public.has_permission('menu.manage')));

-- Reviews
create policy reviews_select on public.reviews for select to anon, authenticated
  using (
    not is_hidden
    or user_id = (select auth.uid())
    or (select public.has_permission('reviews.moderate'))
  );
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_user())
    and not is_hidden
    and exists (select 1 from public.products p where p.id = product_id and p.is_visible)
  );
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()));
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()));

-- Favorites
create policy favorites_select_own on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_insert_own on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy favorites_delete_own on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- Pages
create policy pages_select on public.pages for select to anon, authenticated
  using (status = 'published' or (select public.has_permission('pages.edit')));
create policy pages_insert on public.pages for insert to authenticated
  with check ((select public.has_permission('pages.edit')));
create policy pages_update on public.pages for update to authenticated
  using ((select public.has_permission('pages.edit')))
  with check ((select public.has_permission('pages.edit')));
create policy pages_delete on public.pages for delete to authenticated
  using ((select public.has_permission('pages.publish')));

create policy page_versions_select on public.page_versions for select to anon, authenticated
  using (
    (select public.has_permission('pages.edit'))
    or exists (
      select 1 from public.pages p
      where p.published_version_id = page_versions.id and p.status = 'published'
    )
  );
create policy page_versions_insert on public.page_versions for insert to authenticated
  with check ((select public.has_permission('pages.edit')) and created_by = (select auth.uid()));

create policy page_templates_all on public.page_templates for all to authenticated
  using ((select public.has_permission('pages.edit')))
  with check ((select public.has_permission('pages.edit')));

-- Settings
create policy site_settings_select on public.site_settings for select to anon, authenticated
  using (true);
create policy site_settings_insert on public.site_settings for insert to authenticated
  with check ((select public.has_permission('settings.edit')));
create policy site_settings_update on public.site_settings for update to authenticated
  using ((select public.has_permission('settings.edit')))
  with check ((select public.has_permission('settings.edit')));

-- Uploads
create policy upload_rules_select on public.upload_rules for select to authenticated
  using ((select public.current_staff_role()) is not null);
create policy upload_rules_update on public.upload_rules for update to authenticated
  using ((select public.has_permission('settings.edit')))
  with check ((select public.has_permission('settings.edit')));

create policy media_assets_select on public.media_assets for select to authenticated
  using ((select public.has_permission('media.upload')));
create policy media_assets_insert on public.media_assets for insert to authenticated
  with check ((select public.has_permission('media.upload')) and uploaded_by = (select auth.uid()));
create policy media_assets_delete on public.media_assets for delete to authenticated
  using ((select public.has_permission('media.upload')));

-- Audit and ownership
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.has_permission('audit.read')));
create policy ownership_transfers_select on public.ownership_transfers for select to authenticated
  using (
    from_user = (select auth.uid())
    or to_user = (select auth.uid())
    or (select public.has_permission('audit.read'))
  );

-- ---------------------------------------------------------------------------
-- Public read models
-- ---------------------------------------------------------------------------

-- Rating summary over visible reviews only. security_invoker: RLS of the
-- caller applies to the underlying reviews table.
create view public.product_rating_summary
with (security_invoker = true) as
  select
    r.product_id,
    round(avg(r.rating)::numeric, 2) as average_rating,
    count(*)::integer as rating_count
  from public.reviews r
  where not r.is_hidden
  group by r.product_id;

revoke all on public.product_rating_summary from anon, authenticated;
grant select on public.product_rating_summary to anon, authenticated;

-- Visible reviews with the author's first name only (no ids, no emails).
create or replace function public.get_product_reviews(
  p_product_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  rating smallint,
  comment text,
  author_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.comment, nullif(split_part(btrim(p.display_name), ' ', 1), ''), r.created_at, r.updated_at
  from public.reviews r
  join public.profiles p on p.id = r.user_id
  where r.product_id = p_product_id
    and not r.is_hidden
    and exists (select 1 from public.products pr where pr.id = r.product_id and pr.is_visible)
  order by r.updated_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Privileged operations
-- ---------------------------------------------------------------------------

create or replace function public.require_permission(perm text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.has_permission(perm) then
    raise exception 'permission denied: %', perm using errcode = '42501';
  end if;
end;
$$;

-- Hide or restore a review.
create or replace function public.moderate_review(p_review_id uuid, p_hidden boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reviews.moderate');
  update public.reviews
     set is_hidden = p_hidden,
         hidden_reason = case when p_hidden then left(nullif(btrim(p_reason), ''), 300) else null end,
         hidden_by = case when p_hidden then auth.uid() else null end,
         hidden_at = case when p_hidden then now() else null end
   where id = p_review_id;
  if not found then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  perform public.log_audit(
    case when p_hidden then 'review.hide' else 'review.unhide' end,
    'review', p_review_id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

-- Ban / unban a customer or staff member.
create or replace function public.admin_set_ban(p_user_id uuid, p_banned boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role public.staff_role;
begin
  perform public.require_permission('users.ban');
  if p_user_id = auth.uid() then
    raise exception 'you cannot ban your own account' using errcode = '42501';
  end if;
  select role into v_target_role from public.staff_roles where user_id = p_user_id;
  if v_target_role = 'owner' then
    raise exception 'the owner cannot be banned' using errcode = '42501';
  end if;
  if v_target_role = 'admin' and not public.has_permission('staff.manage_admins') then
    raise exception 'only the owner can ban an admin' using errcode = '42501';
  end if;
  update public.profiles
     set is_banned = p_banned,
         banned_reason = case when p_banned then left(nullif(btrim(p_reason), ''), 500) else null end,
         banned_at = case when p_banned then now() else null end,
         banned_by = case when p_banned then auth.uid() else null end
   where id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  perform public.log_audit(
    case when p_banned then 'user.ban' else 'user.unban' end,
    'user', p_user_id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

-- Grant or change a staff role (never 'owner': ownership moves only by transfer).
create or replace function public.admin_grant_role(p_user_id uuid, p_role public.staff_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.staff_role;
begin
  perform public.require_permission('staff.manage');
  if p_role = 'owner' then
    raise exception 'ownership can only change through an ownership transfer' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;
  select role into v_current from public.staff_roles where user_id = p_user_id;
  if v_current = 'owner' then
    raise exception 'the owner role cannot be changed here' using errcode = '42501';
  end if;
  if (p_role = 'admin' or v_current = 'admin') and not public.has_permission('staff.manage_admins') then
    raise exception 'only the owner can grant or change admin roles' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = p_user_id and not p.is_banned and u.email_confirmed_at is not null
  ) then
    raise exception 'user must exist, be active and have a confirmed email' using errcode = '22023';
  end if;
  insert into public.staff_roles (user_id, role, granted_by)
  values (p_user_id, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  perform public.log_audit('staff.grant', 'user', p_user_id::text,
    jsonb_build_object('role', p_role, 'previous_role', v_current));
end;
$$;

create or replace function public.admin_revoke_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.staff_role;
begin
  perform public.require_permission('staff.manage');
  select role into v_current from public.staff_roles where user_id = p_user_id;
  if v_current is null then
    raise exception 'user has no staff role' using errcode = 'P0002';
  end if;
  if v_current = 'owner' then
    raise exception 'the owner role cannot be removed; transfer ownership instead' using errcode = '42501';
  end if;
  if v_current = 'admin' and not public.has_permission('staff.manage_admins') then
    raise exception 'only the owner can remove an admin' using errcode = '42501';
  end if;
  delete from public.staff_roles where user_id = p_user_id;
  perform public.log_audit('staff.revoke', 'user', p_user_id::text, jsonb_build_object('previous_role', v_current));
end;
$$;

-- Ownership transfer: owner requests → target admin accepts within 48 hours.
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

-- Returns 'accepted' or 'expired' (an expired request is marked as such).
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
  -- Both parties must still be valid at acceptance time.
  if not exists (
    select 1 from public.staff_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = v_t.from_user and r.role = 'owner'
  ) then
    raise exception 'the requesting user is no longer the owner' using errcode = '22023';
  end if;
  if public.current_staff_role() is distinct from 'admin' then
    raise exception 'only an active admin can accept ownership' using errcode = '42501';
  end if;
  -- Demote first (single-owner index), then promote; same transaction.
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

create or replace function public.cancel_ownership_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.ownership_transfers;
begin
  select * into v_t from public.ownership_transfers where id = p_transfer_id for update;
  if v_t.id is null or auth.uid() not in (v_t.from_user, v_t.to_user) then
    raise exception 'transfer not found' using errcode = 'P0002';
  end if;
  if v_t.status <> 'pending' then
    raise exception 'transfer is no longer pending' using errcode = '22023';
  end if;
  update public.ownership_transfers
     set status = case when auth.uid() = v_t.to_user then 'declined' else 'cancelled' end,
         decided_at = now()
   where id = v_t.id;
  perform public.log_audit('ownership.cancel', 'user', v_t.to_user::text, jsonb_build_object('transfer_id', v_t.id));
end;
$$;

-- Publish a specific saved version of a page.
create or replace function public.publish_page(p_page_id uuid, p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('pages.publish');
  if not exists (select 1 from public.page_versions where id = p_version_id and page_id = p_page_id) then
    raise exception 'version does not belong to this page' using errcode = '22023';
  end if;
  update public.pages
     set status = 'published', published_version_id = p_version_id,
         published_at = now(), published_by = auth.uid()
   where id = p_page_id;
  perform public.log_audit('page.publish', 'page', p_page_id::text, jsonb_build_object('version_id', p_version_id));
end;
$$;

create or replace function public.unpublish_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('pages.publish');
  update public.pages set status = 'draft' where id = p_page_id;
  if not found then
    raise exception 'page not found' using errcode = 'P0002';
  end if;
  perform public.log_audit('page.unpublish', 'page', p_page_id::text);
end;
$$;

-- Staff user list (includes email, which is never exposed to the public).
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
begin
  perform public.require_permission('users.read');
  return query
    select p.id, u.email::text, p.display_name, r.role, p.is_banned,
           u.email_confirmed_at is not null, p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.staff_roles r on r.user_id = p.id
    where p_search is null or p_search = ''
       or u.email ilike '%' || p_search || '%'
       or p.display_name ilike '%' || p_search || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- One-time bootstrap of the first owner. Callable only with the service role /
-- from the SQL editor (not exposed to anon/authenticated).
create or replace function public.bootstrap_owner(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if exists (select 1 from public.staff_roles where role = 'owner') then
    raise exception 'an owner already exists; use ownership transfer instead' using errcode = '42501';
  end if;
  select u.id into v_user_id from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null;
  if v_user_id is null then
    raise exception 'no confirmed account with that email' using errcode = 'P0002';
  end if;
  insert into public.profiles (id) values (v_user_id) on conflict (id) do nothing;
  insert into public.staff_roles (user_id, role, granted_by) values (v_user_id, 'owner', null);
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (null, 'ownership.bootstrap', 'user', v_user_id::text, '{}'::jsonb);
  return v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers for content changes made through RLS-protected tables
-- ---------------------------------------------------------------------------

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  v_id := coalesce(
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id',
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'key',
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'purpose'
  );
  perform public.log_audit(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_id,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else jsonb_build_object('old', to_jsonb(old))
    end);
  return null;
end;
$$;

create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row_change();
create trigger product_groups_audit after insert or update or delete on public.product_groups
  for each row execute function public.audit_row_change();
create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_row_change();
create trigger site_settings_audit after insert or update on public.site_settings
  for each row execute function public.audit_row_change();
create trigger upload_rules_audit after update on public.upload_rules
  for each row execute function public.audit_row_change();
create trigger pages_audit after insert or delete on public.pages
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_active_user() to anon, authenticated;
grant execute on function public.current_staff_role() to anon, authenticated;
grant execute on function public.has_permission(text) to anon, authenticated;
grant execute on function public.get_product_reviews(uuid, integer, integer) to anon, authenticated;

grant execute on function public.moderate_review(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_grant_role(uuid, public.staff_role) to authenticated;
grant execute on function public.admin_revoke_role(uuid) to authenticated;
grant execute on function public.request_ownership_transfer(uuid) to authenticated;
grant execute on function public.accept_ownership_transfer(uuid) to authenticated;
grant execute on function public.cancel_ownership_transfer(uuid) to authenticated;
grant execute on function public.publish_page(uuid, uuid) to authenticated;
grant execute on function public.unpublish_page(uuid) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
-- log_audit, require_permission, bootstrap_owner, trigger functions: no API access.
