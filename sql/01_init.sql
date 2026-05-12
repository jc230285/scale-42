-- =============================================================
-- S42 v2 — Supabase initial schema
-- =============================================================
-- Run this in: https://supabase.com/dashboard/project/cijleqzgvdpdfkwyxsyk/sql/new
-- Paste the entire file → click Run.
-- Idempotent: safe to re-run; uses IF NOT EXISTS / CREATE OR REPLACE.
-- =============================================================

-- Required extensions
create extension if not exists "pgcrypto";

-- =============================================================
-- 1. Allowlist (who can sign in to the CMS / preview)
-- =============================================================
create table if not exists "S42_allowed_users" (
  email       text primary key,
  name        text,
  added_at    timestamptz not null default now(),
  added_by    text
);

-- Seed: you + any @scale-42.com email (the @scale-42.com rule is enforced by
-- the trigger below, but we still allow explicit non-domain emails here).
insert into "S42_allowed_users" (email, name, added_by)
values ('jkkec23@gmail.com', 'James (founder)', 'bootstrap')
on conflict (email) do nothing;

-- =============================================================
-- 2. Auth trigger: gate sign-ups
-- =============================================================
-- Allow sign-in only if: email is in S42_allowed_users OR ends with @scale-42.com
-- Any other Google account gets the row deleted from auth.users immediately,
-- which causes the subsequent session callback to fail and they're booted.

create or replace function "S42_enforce_allowlist"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := new.email;
begin
  if v_email is null then
    return new;
  end if;

  if lower(v_email) like '%@scale-42.com' then
    -- auto-add @scale-42.com users to the allowlist for visibility
    insert into "S42_allowed_users" (email, name, added_by)
    values (lower(v_email), coalesce(new.raw_user_meta_data->>'full_name', v_email), 'auto-domain')
    on conflict (email) do nothing;
    return new;
  end if;

  if exists (select 1 from "S42_allowed_users" where email = lower(v_email)) then
    return new;
  end if;

  -- Not allowed — reject by raising an exception. Supabase Auth surfaces this as
  -- an "access_denied" error to the OAuth callback, and no auth.users row is created.
  raise exception 'S42_ACCESS_DENIED: % is not on the allowlist', v_email;
end;
$$;

drop trigger if exists "S42_check_allowlist" on auth.users;
create trigger "S42_check_allowlist"
  before insert on auth.users
  for each row execute function "S42_enforce_allowlist"();

-- =============================================================
-- 3. Content tables
-- =============================================================

-- Sites (data centres) — mirrors content/sites.json schema
create table if not exists "S42_sites" (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique,
  name            text not null,
  country         text,
  status          text,
  lat             numeric,
  lng             numeric,
  initial_mw      numeric,
  target_mw       numeric,
  max_capacity_mw numeric,
  power           text,
  desc_en         text,
  public_location text,
  developers      jsonb default '[]'::jsonb,
  images          jsonb default '[]'::jsonb,
  extra           jsonb default '{}'::jsonb,
  published       boolean not null default false,
  order_idx       int default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists "S42_sites_schema" (
  id          int primary key default 1,
  schema      jsonb not null,
  updated_at  timestamptz not null default now(),
  check (id = 1)
);

-- People (team)
create table if not exists "S42_people" (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  name        text not null,
  role        text,
  bio         text,
  photo       text,
  linkedin    text,
  order_idx   int default 0,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- News posts
create table if not exists "S42_news" (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title_en     text,
  type_en      text,
  date_en      text,
  read_time    text,
  image        text,
  alt          text,
  excerpt_en   text,
  subtitle     text,
  tags         text,
  source_html  text,
  body_html    text,
  featured     boolean not null default false,
  published    boolean not null default false,
  order_idx    int default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Developers / partners
create table if not exists "S42_developers" (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  logo         text,
  url          text,
  tagline      text,
  description  text,
  cta          text,
  color        text,
  order_idx    int default 0,
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Journey timeline
create table if not exists "S42_journey" (
  id            uuid primary key default gen_random_uuid(),
  year          text,
  headline_en   text,
  body_en       text,
  badge_en      text,
  image         text,
  order_idx     int default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists "S42_journey_meta" (
  id         int primary key default 1,
  title_en   text default 'Our Journey',
  lede_en    text,
  check (id = 1)
);

-- Page sections (free-form key/value blocks per page)
create table if not exists "S42_sections" (
  page        text not null,
  key         text not null,
  value_en    text,
  updated_at  timestamptz not null default now(),
  primary key (page, key)
);

-- Inquiries (contact form submissions)
create table if not exists "S42_inquiries" (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  inquiry_type  text,
  name          text,
  company       text,
  email         text,
  phone         text,
  mw            text,
  message       text,
  ip            text,
  ua            text,
  email_sent    boolean,
  autoreply_sent boolean,
  meta          jsonb default '{}'::jsonb
);

-- Audit log
create table if not exists "S42_audit" (
  id           bigserial primary key,
  ts           timestamptz not null default now(),
  actor_email  text,
  table_name   text,
  action       text,
  target_id    text,
  diff         jsonb default '{}'::jsonb
);

-- Media (image library — files live in Supabase Storage; this is metadata)
create table if not exists "S42_media" (
  id           uuid primary key default gen_random_uuid(),
  path         text unique not null,
  folder       text,
  size_bytes   bigint,
  mime         text,
  width        int,
  height       int,
  alt          text,
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);

-- =============================================================
-- 4. updated_at triggers
-- =============================================================
create or replace function "S42_touch_updated_at"()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'S42_sites','S42_people','S42_news','S42_developers',
    'S42_journey','S42_sections','S42_sites_schema'
  ]) loop
    execute format('drop trigger if exists "%1$s_touch_uat" on "%1$s"; create trigger "%1$s_touch_uat" before update on "%1$s" for each row execute function "S42_touch_updated_at"();', t);
  end loop;
end $$;

-- =============================================================
-- 5. Row Level Security
-- =============================================================
-- Anon role: can read published rows from public content tables.
-- Authenticated role: can read everything; can write iff email is allowlisted.
-- Service role: full access (bypasses RLS by design — used by the CMS server).

alter table "S42_allowed_users" enable row level security;
alter table "S42_sites"         enable row level security;
alter table "S42_sites_schema"  enable row level security;
alter table "S42_people"        enable row level security;
alter table "S42_news"          enable row level security;
alter table "S42_developers"    enable row level security;
alter table "S42_journey"       enable row level security;
alter table "S42_journey_meta"  enable row level security;
alter table "S42_sections"      enable row level security;
alter table "S42_inquiries"     enable row level security;
alter table "S42_audit"         enable row level security;
alter table "S42_media"         enable row level security;

-- Helper: is the JWT email allowlisted?
create or replace function "S42_is_editor"()
returns boolean language sql stable as $$
  select exists (
    select 1 from "S42_allowed_users"
    where email = lower(auth.jwt() ->> 'email')
  ) or lower(auth.jwt() ->> 'email') like '%@scale-42.com';
$$;

-- Drop and recreate policies (idempotent)
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where tablename like 'S42_%' loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Public content: anon can SELECT published rows; editors can do anything
create policy "S42_sites_anon_read"   on "S42_sites"      for select to anon          using (published = true);
create policy "S42_sites_auth_read"   on "S42_sites"      for select to authenticated using (true);
create policy "S42_sites_edit_all"    on "S42_sites"      for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_people_anon_read"  on "S42_people"     for select to anon          using (published = true);
create policy "S42_people_auth_read"  on "S42_people"     for select to authenticated using (true);
create policy "S42_people_edit_all"   on "S42_people"     for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_news_anon_read"    on "S42_news"       for select to anon          using (published = true);
create policy "S42_news_auth_read"    on "S42_news"       for select to authenticated using (true);
create policy "S42_news_edit_all"     on "S42_news"       for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_devs_anon_read"    on "S42_developers" for select to anon          using (published = true);
create policy "S42_devs_auth_read"    on "S42_developers" for select to authenticated using (true);
create policy "S42_devs_edit_all"     on "S42_developers" for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_journey_anon_read" on "S42_journey"    for select to anon          using (true);
create policy "S42_journey_auth_read" on "S42_journey"    for select to authenticated using (true);
create policy "S42_journey_edit_all"  on "S42_journey"    for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_jmeta_anon_read"   on "S42_journey_meta" for select to anon          using (true);
create policy "S42_jmeta_edit_all"    on "S42_journey_meta" for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_sects_anon_read"   on "S42_sections"   for select to anon          using (true);
create policy "S42_sects_edit_all"    on "S42_sections"   for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_schema_anon_read"  on "S42_sites_schema" for select to anon          using (true);
create policy "S42_schema_edit_all"   on "S42_sites_schema" for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

create policy "S42_media_anon_read"   on "S42_media"      for select to anon          using (true);
create policy "S42_media_edit_all"    on "S42_media"      for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

-- Allowlist itself: editors can read; only admins (service role) can write.
-- For now everyone allowlisted reads it; only service role writes.
create policy "S42_allow_auth_read"   on "S42_allowed_users" for select to authenticated using ("S42_is_editor"());

-- Inquiries: only editors can read; service role inserts via the contact form
-- (server-side; the form does not use the anon key for this).
create policy "S42_inq_edit_read"     on "S42_inquiries"  for select to authenticated using ("S42_is_editor"());

-- Audit: editors can read their own audit log
create policy "S42_audit_edit_read"   on "S42_audit"      for select to authenticated using ("S42_is_editor"());

-- =============================================================
-- 6. Storage buckets (run separately — Storage API not always in SQL)
-- =============================================================
-- After running this SQL, create these buckets manually at:
--   https://supabase.com/dashboard/project/cijleqzgvdpdfkwyxsyk/storage/buckets
--
--   • s42-media  (public read)
--   • s42-news   (public read)
--   • s42-sites  (public read)
--   • s42-people (public read)
--
-- OR run this via SQL (works on recent Supabase versions):
insert into storage.buckets (id, name, public)
values
  ('s42-media',  's42-media',  true),
  ('s42-news',   's42-news',   true),
  ('s42-sites',  's42-sites',  true),
  ('s42-people', 's42-people', true)
on conflict (id) do nothing;

-- =============================================================
-- DONE
-- =============================================================
-- Verify with:
--   select count(*) from "S42_allowed_users";  -- should be 1
--   select tablename from pg_tables where tablename like 'S42_%' order by 1;
-- =============================================================
