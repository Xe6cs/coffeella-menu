-- Coffeella V2 — core schema
-- Tables, constraints, indexes and housekeeping triggers.
-- Privileges, RLS policies and privileged functions live in the next migration.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts and staff roles
-- ---------------------------------------------------------------------------

create type public.staff_role as enum ('owner', 'admin', 'editor', 'moderator');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  is_banned boolean not null default false,
  banned_reason text check (banned_reason is null or char_length(banned_reason) <= 500),
  banned_at timestamptz,
  banned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- One row per staff member. Customers have no row here.
-- "on delete restrict": a staff member's account cannot be deleted until the
-- role is revoked (and the owner role can only move via ownership transfer).
create table public.staff_roles (
  user_id uuid primary key references public.profiles (id) on delete restrict,
  role public.staff_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);

-- At most one owner at any time.
create unique index staff_roles_single_owner on public.staff_roles (role) where role = 'owner';

create table public.role_permissions (
  role public.staff_role not null,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text check (name_en is null or char_length(name_en) between 1 and 120),
  icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'),
  photo_path text check (photo_path is null or char_length(photo_path) <= 300),
  photo_focus text check (photo_focus is null or photo_focus ~ '^[a-z0-9% .-]{1,40}$'),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  -- Nullable on purpose: groups without an English title stay without one.
  name_en text check (name_en is null or char_length(name_en) between 1 and 120),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_groups_category_idx on public.product_groups (category_id, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_groups (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text check (name_en is null or char_length(name_en) between 1 and 120),
  description_ar text check (description_ar is null or char_length(description_ar) <= 1000),
  description_en text check (description_en is null or char_length(description_en) <= 1000),
  -- v1 prices are either a single price or a min–max range; kept as-is.
  price_min integer not null check (price_min >= 0),
  price_max integer check (price_max is null or price_max > price_min),
  image_path text check (image_path is null or char_length(image_path) <= 300),
  is_available boolean not null default true,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_group_idx on public.products (group_id, sort_order);

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger product_groups_set_updated_at before update on public.product_groups
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reviews and favorites
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(btrim(comment)) between 1 and 1000),
  is_hidden boolean not null default false,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 300),
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per customer per product, enforced by the database.
  constraint reviews_one_per_user_per_product unique (product_id, user_id)
);

create index reviews_product_visible_idx on public.reviews (product_id) where not is_hidden;
create index reviews_user_idx on public.reviews (user_id);

create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index favorites_product_idx on public.favorites (product_id);

-- ---------------------------------------------------------------------------
-- Pages built with the visual editor
-- ---------------------------------------------------------------------------

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and slug not in ('admin', 'api', 'auth', 'account', 'login', 'signup', 'menu', 'favorites', 'p', '_next')),
  title_ar text not null check (char_length(title_ar) between 1 and 120),
  title_en text check (title_en is null or char_length(title_en) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_version_id uuid,
  transition text not null default 'fade' check (transition in ('none', 'fade', 'slide', 'zoom')),
  theme_mode text not null default 'dark' check (theme_mode in ('dark', 'light', 'system')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_published_has_version check (status = 'draft' or published_version_id is not null)
);

-- Every saved draft is a new immutable version (history + restore).
create table public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  version_no integer not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, version_no)
);

-- NO ACTION (checked at end of statement) so deleting a page can cascade to
-- its versions; versions themselves cannot be deleted through the API.
alter table public.pages
  add constraint pages_published_version_fk
  foreign key (published_version_id) references public.page_versions (id);

create trigger pages_set_updated_at before update on public.pages
  for each row execute function public.set_updated_at();

-- security definer: numbering needs a row lock on pages regardless of the
-- caller's column privileges; it only computes version_no.
create or replace function public.page_versions_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize version numbering per page.
  perform 1 from public.pages where id = new.page_id for update;
  select coalesce(max(v.version_no), 0) + 1 into new.version_no
  from public.page_versions v where v.page_id = new.page_id;
  return new;
end;
$$;

create trigger page_versions_assign_number
  before insert on public.page_versions
  for each row execute function public.page_versions_assign_number();

create or replace function public.pages_check_published_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published_version_id is not null and not exists (
    select 1 from public.page_versions v
    where v.id = new.published_version_id and v.page_id = new.id
  ) then
    raise exception 'published version does not belong to this page' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pages_check_published_version
  before insert or update of published_version_id on public.pages
  for each row execute function public.pages_check_published_version();

create table public.page_templates (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text check (name_en is null or char_length(name_en) between 1 and 120),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger page_templates_set_updated_at before update on public.page_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Site settings (public, non-secret configuration only)
-- ---------------------------------------------------------------------------

create table public.site_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb not null,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Uploads: per-purpose rules + registry of stored files
-- ---------------------------------------------------------------------------

create table public.upload_rules (
  purpose text primary key check (purpose ~ '^[a-z_]{2,40}$'),
  bucket text not null check (bucket ~ '^[a-z0-9-]{2,63}$'),
  -- Only raster image types are ever allowed (no SVG/HTML/scripts).
  allowed_mime_types text[] not null
    check (cardinality(allowed_mime_types) > 0
      and allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']),
  max_bytes integer not null check (max_bytes > 0 and max_bytes <= 10485760),
  description_ar text,
  description_en text,
  updated_at timestamptz not null default now()
);

create trigger upload_rules_set_updated_at before update on public.upload_rules
  for each row execute function public.set_updated_at();

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  purpose text not null references public.upload_rules (purpose) on delete restrict,
  bucket text not null,
  path text not null check (char_length(path) <= 300),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only) and ownership transfers
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_target_idx on public.audit_log (target_type, target_id);

create table public.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  check (from_user <> to_user),
  check (expires_at > created_at)
);

-- Only one pending transfer at a time.
create unique index ownership_transfers_one_pending on public.ownership_transfers (status) where status = 'pending';
