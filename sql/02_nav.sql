-- =============================================================
-- S42 v2 — Navigation menu
-- =============================================================
create table if not exists "S42_nav" (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  href        text not null,
  is_cta      boolean not null default false,
  order_idx   int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table "S42_nav" enable row level security;

drop policy if exists "S42_nav_anon_read" on "S42_nav";
drop policy if exists "S42_nav_auth_read" on "S42_nav";
drop policy if exists "S42_nav_edit_all"  on "S42_nav";

create policy "S42_nav_anon_read"  on "S42_nav" for select to anon          using (published = true);
create policy "S42_nav_auth_read"  on "S42_nav" for select to authenticated using (true);
create policy "S42_nav_edit_all"   on "S42_nav" for all    to authenticated using ("S42_is_editor"()) with check ("S42_is_editor"());

drop trigger if exists "S42_nav_touch_uat" on "S42_nav";
create trigger "S42_nav_touch_uat" before update on "S42_nav"
  for each row execute function "S42_touch_updated_at"();

-- Seed default items
insert into "S42_nav" (label, href, is_cta, order_idx)
values
  ('Home',           '/',               false, 10),
  ('Data centres',   '/datacenters/',   false, 20),
  ('Solutions',      '/solutions/',     false, 30),
  ('Sustainability', '/sustainability/',false, 40),
  ('Partners',       '/partners/',      false, 50),
  ('About Us',       '/about-us/',      false, 60),
  ('News',           '/news/',          false, 70),
  ('Contact',        '/contact/',       true,  80)
on conflict do nothing;
